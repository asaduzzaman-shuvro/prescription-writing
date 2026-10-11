"use client";

import {
  LAB_DEPARTMENTS,
  LAB_FILE_MAX_BYTES,
  LAB_LIMITS,
  labPanel,
  labRange,
  labRefText,
  labResult,
  labTrend,
  labValueText,
  OTHER_PANEL,
  panelForInvestigation,
  panelOfTest,
  parseLabShorthand,
  OTHER_REPORT_TITLES,
  type LabCatalogue,
  type LabFileRef,
  type LabResult,
  type LabTest,
  type Sex,
  type TrendPoint,
} from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { deleteLabReport, lastFinalDoc, recordReportFilesConsent, saveLabReport } from "@/lib/doctor/data";
import { useLabCatalogue } from "@/lib/doctor/hooks";
import { parseJson, today, uuid } from "@/lib/doctor/util";
import { addLabFile, readLabFile, removeLabFile } from "@/lib/powersync/lab-files";
import { EMPTY_ROW, FLAG_STYLE, LabValueInput, rowFromResult, rowResult, type RowInput } from "./lab-entry";

export interface LabReportView {
  id: string;
  encounterId: string | null;
  reportDate: string;
  labName: string | null;
  panel: string;
  title: string;
  results: LabResult[];
  conclusion: string | null;
  files: LabFileRef[];
}

/** A patient's lab reports, newest first. */
export function useLabReports(patientId: string): LabReportView[] {
  const { data } = useQuery<{ id: string; encounter_id: string | null; report_date: string; lab_name: string | null; panel: string; title: string; results: string | null; conclusion: string | null; files: string | null }>(
    `SELECT id, encounter_id, report_date, lab_name, panel, title, results, conclusion, files FROM lab_report
      WHERE patient_id = ? AND deleted_at IS NULL ORDER BY report_date DESC, created_at DESC`,
    [patientId],
  );
  return data.map((r) => ({
    id: r.id, encounterId: r.encounter_id, reportDate: r.report_date, labName: r.lab_name, panel: r.panel, title: r.title,
    results: parseJson<LabResult[]>(r.results, []), conclusion: r.conclusion, files: parseJson<LabFileRef[]>(r.files, []),
  }));
}

/** Photo: at most 1600 px on the long side, re-encoded as JPEG (which also drops location and camera data). */
async function shrinkPhoto(file: Blob): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the photo."))), "image/jpeg", 0.7));
}

/** A report's photos/PDFs as small tiles; tap to view. Loads from this device, or the server when online. */
export function LabFileTiles({ files, onRemove }: { files: LabFileRef[]; onRemove?: (id: string) => void }) {
  const [open, setOpen] = useState<{ url: string; type: string } | null>(null);
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="lab-files">
      {files.map((f) => <LabFileTile key={f.id} file={f} onOpen={setOpen} onRemove={onRemove} />)}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)} data-testid="lab-file-viewer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open.url} alt="Report" className="max-h-full max-w-full rounded bg-white" />
          <button className="absolute right-4 top-4 rounded bg-white px-3 py-1 text-sm">Close</button>
        </div>
      )}
    </div>
  );
}

function LabFileTile({ file, onOpen, onRemove }: { file: LabFileRef; onOpen: (v: { url: string; type: string }) => void; onRemove?: (id: string) => void }) {
  const db = usePowerSync();
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let live = true;
    readLabFile(db, file)
      .then((b) => {
        u = URL.createObjectURL(b);
        if (live) setUrl(u);
      })
      .catch((e: Error) => live && setProblem(e.message));
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [db, file.id, file.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const isPdf = file.type === "application/pdf";
  const show = () => {
    if (!url) return;
    if (isPdf) window.open(url, "_blank", "noopener");
    else onOpen({ url, type: file.type });
  };
  return (
    <span className="relative inline-block">
      <button type="button" onClick={show} title={problem ?? (isPdf ? "Open PDF" : "View photo")} data-testid="lab-file" data-file-id={file.id}
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 text-[10px] text-slate-500">
        {url && !isPdf
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : isPdf ? "PDF" : problem ? "offline" : "…"}
      </button>
      {onRemove && (
        <button type="button" className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-red-600 text-xs leading-5 text-white" onClick={() => onRemove(file.id)}
          aria-label="Remove file" data-testid="lab-file-remove">×</button>
      )}
    </span>
  );
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

/** One report as a line of values; abnormal ones coloured, the ones that print in bold. */
export function LabReportSummary({ r }: { r: LabReportView }) {
  const cat = useLabCatalogue();
  return (
    <span className="text-sm">
      <b>{r.title}</b> <span className="text-slate-500">· {shortDate(r.reportDate)}{r.labName ? ` · ${r.labName}` : ""}</span>
      {r.results.length > 0 && <span className="text-slate-400">: </span>}
      {r.results.map((x, i) => (
        <span key={x.code}>
          {i > 0 && ", "}
          <span className={`${x.flag ? FLAG_STYLE[x.flag] : "text-slate-700"} ${x.print ? "font-semibold" : ""}`} data-testid={`lab-result-${x.code}`}>{labValueText(x, cat)}</span>
        </span>
      ))}
      {r.conclusion && <span className="text-slate-700">{r.results.length ? " · " : ": "}{r.conclusion}</span>}
      {r.files.length > 0 && <span className="text-slate-500"> · 📎 {r.files.length}</span>}
    </span>
  );
}

/** A test's numeric values over time, oldest first. */
export function trendSeries(reports: LabReportView[], code: string): TrendPoint[] {
  // Reports come newest first; reversed, two reports of the same day keep the order they were entered in.
  return [...reports]
    .reverse()
    .flatMap((r) => r.results.filter((x) => x.code === code && x.value !== undefined).map((x) => ({ date: r.reportDate, value: x.value!, flag: x.flag })))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const DOT: Record<string, string> = { H: "#b91c1c", L: "#1d4ed8" };

/** A small line chart of one test's values, with the normal range shaded. */
export function LabTrendChart({ code, points, sex, testId }: { code: string; points: TrendPoint[]; sex: Sex | null; testId?: string }) {
  const test = useLabCatalogue().byCode[code];
  if (!test || !points.length) return null;
  const w = 240, h = 64;
  const { points: pts, band } = labTrend(points, labRange(test, sex), w, h);
  return (
    <div className="inline-block" data-testid={testId}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${test.short} trend`} className="rounded bg-white">
        {band && <rect x={0} y={band.top} width={w} height={Math.max(0, band.bottom - band.top)} fill="#ecfdf5" />}
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#64748b" strokeWidth={1.5} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={p.flag ? DOT[p.flag] ?? "#b45309" : "#334155"}>
            <title>{`${p.value} ${test.unit} · ${shortDate(p.date)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="text-xs text-slate-600">
        {points.map((p) => p.value).join(" → ")} {test.unit}
        <span className="text-slate-400"> · {shortDate(points[0]!.date)} – {shortDate(points[points.length - 1]!.date)}</span>
      </div>
    </div>
  );
}

/** The visit's Reports card: add the paper reports the patient brought; ticked values print on the prescription. */
export function LabReports({
  encounterId,
  patientId,
  sex,
  leading,
}: {
  encounterId: string;
  patientId: string;
  sex: Sex | null;
  /** Desktop visit tabs, sitting on the same row as the report chips. */
  leading?: ReactNode;
}) {
  const db = usePowerSync();
  const cat = useLabCatalogue();
  const reports = useLabReports(patientId);
  const [editing, setEditing] = useState<{ panel: string; report?: LabReportView; title?: string } | null>(null);
  const [quick, setQuick] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<string[]>([]);
  const thisVisit = reports.filter((r) => r.encounterId === encounterId);
  const earlier = reports.filter((r) => r.encounterId !== encounterId);
  const lastLab = reports.find((r) => r.labName)?.labName ?? "";
  const { data: consent } = useQuery<{ c: string | null }>(`SELECT report_files_consent_at AS c FROM patient WHERE id = ?`, [patientId]);

  // What the doctor asked for last time is usually what the patient brings: offer those first.
  useEffect(() => {
    void lastFinalDoc(db, patientId, encounterId).then((d) => setOrdered(d?.investigations ?? []));
  }, [db, patientId, encounterId]);
  // One chip per panel ("RBS, HbA1c" → Blood sugar); hidden once this visit has that report.
  const orderedChips: { key: string; panel: string; title?: string; names: string[] }[] = [];
  for (const name of ordered) {
    const p = panelForInvestigation(name, cat);
    const key = p.title ? `${OTHER_PANEL}:${p.title}` : p.panel;
    const chip = orderedChips.find((c) => c.key === key);
    if (chip) chip.names.push(name);
    else if (!thisVisit.some((r) => (p.title ? r.panel === OTHER_PANEL && r.title === p.title : r.panel === p.panel))) orderedChips.push({ key, ...p, names: [name] });
  }

  /** "hb 9.2 wbc 11800 rbs 11.4": one report per panel, dated today, from the last lab. */
  async function saveQuick() {
    const parsed = parseLabShorthand(quick, cat);
    if (parsed.unknown.length) return setQuickError(`Didn't recognise: ${parsed.unknown.join(", ")}`);
    if (!parsed.results.length) return;
    const byPanel = new Map<string, LabResult[]>();
    for (const x of parsed.results) {
      const test = cat.byCode[x.code]!;
      const panel = panelOfTest(x.code, cat)?.id ?? OTHER_PANEL;
      byPanel.set(panel, [...(byPanel.get(panel) ?? []).filter((r) => r.code !== x.code), labResult(test, x, sex)]);
    }
    try {
      for (const [panel, results] of byPanel) {
        await saveLabReport(db, { patientId, encounterId, reportDate: today(), labName: lastLab, panel, title: labPanel(panel, cat)?.name ?? "Reports", results, conclusion: "" });
      }
      setQuick("");
      setQuickError(null);
    } catch (e) {
      setQuickError((e as Error).message);
    }
  }

  async function remove(r: LabReportView) {
    if (!confirm(`Delete the ${r.title} report of ${shortDate(r.reportDate)}?`)) return;
    await deleteLabReport(db, r.id);
    for (const f of r.files) await removeLabFile(f.id);
  }

  return (
    <section className="space-y-2" data-testid="lab-reports">
      <div className="flex flex-wrap items-center gap-1.5">
        {leading}
        <h3 className={`mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500 ${leading ? "xl:hidden" : ""}`}>Reports</h3>
        {[...cat.panels.filter((p) => CHIP_PANELS.includes(p.id)).map((p) => ({ id: p.id, name: p.name })), { id: OTHER_PANEL, name: "Imaging / other" }].map((p) => (
          <button key={p.id} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs hover:bg-slate-50" onClick={() => setEditing({ panel: p.id })} data-testid={`lab-add-${p.id}`}>
            + {p.name}
          </button>
        ))}
        <select className="input w-auto py-0.5 text-xs" value="" onChange={(e) => e.target.value && setEditing({ panel: e.target.value })} aria-label="More tests" data-testid="lab-add-more">
          <option value="">+ More tests…</option>
          {LAB_DEPARTMENTS.map((d) => {
            const panels = cat.panels.filter((p) => p.department === d.id && !CHIP_PANELS.includes(p.id));
            return panels.length ? <optgroup key={d.id} label={d.name}>{panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup> : null;
          })}
        </select>
      </div>
      {orderedChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="lab-ordered">
          <span className="text-slate-500">Ordered last visit:</span>
          {orderedChips.map((c) => (
            <button key={c.key} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-brand-700 hover:bg-brand-100"
              onClick={() => setEditing({ panel: c.panel, title: c.title })} data-testid="lab-ordered-chip">
              + {c.names.join(", ")}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input min-w-0 flex-1 py-1 text-sm" value={quick} placeholder="Quick entry: hb 9.2 wbc 11800 rbs 11.4 hbsag neg — Enter to save"
          onChange={(e) => { setQuick(e.target.value); setQuickError(null); }} onKeyDown={(e) => e.key === "Enter" && void saveQuick()} data-testid="lab-quick" />
      </div>
      {quickError && <p className="text-sm text-red-700" data-testid="lab-quick-error">{quickError}</p>}
      {editing && (
        <LabReportEditor
          key={editing.report?.id ?? `${editing.panel}:${editing.title ?? ""}`}
          panel={editing.panel}
          report={editing.report}
          initialTitle={editing.title}
          patientId={patientId}
          encounterId={encounterId}
          sex={sex}
          reports={reports}
          cat={cat}
          filesConsented={Boolean(consent[0]?.c)}
          onDone={() => setEditing(null)}
        />
      )}
      {thisVisit.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-slate-50 px-2 py-1" data-testid="lab-report">
          <div className="space-y-1">
            <LabReportSummary r={r} />
            <LabFileTiles files={r.files} />
          </div>
          <span className="flex gap-1">
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setEditing({ panel: r.panel, report: r })}>Edit</button>
            <button className="btn-ghost px-2 py-0.5 text-xs text-red-700" onClick={() => remove(r)}>Delete</button>
          </span>
        </div>
      ))}
      {earlier.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-slate-500">Earlier reports ({earlier.length})</summary>
          <div className="mt-1 space-y-1">
            {earlier.map((r) => <div key={r.id} className="px-2"><LabReportSummary r={r} /></div>)}
          </div>
        </details>
      )}
    </section>
  );
}

/** The panels offered as chips; the rest of the catalogue is under "More tests". */
const CHIP_PANELS = ["cbc", "sugar", "rft", "lft", "lipid", "thyroid", "urine", "electrolytes", "serology"];

function LabReportEditor({ panel, report, initialTitle, patientId, encounterId, sex, reports, cat, filesConsented, onDone }: {
  panel: string;
  report?: LabReportView;
  initialTitle?: string;
  filesConsented: boolean;
  patientId: string;
  encounterId: string;
  sex: Sex | null;
  reports: LabReportView[];
  /** The card's catalogue, already loaded (the editor's state starts from it). */
  cat: LabCatalogue;
  onDone: () => void;
}) {
  const db = usePowerSync();
  const byCode = cat.byCode;
  const isOther = panel === OTHER_PANEL;
  const codes = [...new Set([...(labPanel(panel, cat)?.tests ?? []), ...(report?.results.map((r) => r.code) ?? [])])].filter((c) => byCode[c]);
  // Results this device's catalogue doesn't know (a test added since) are shown and kept as they are.
  const kept = report?.results.filter((r) => !byCode[r.code]) ?? [];
  const sectionOf = Object.fromEntries((labPanel(panel, cat)?.sections ?? []).flatMap((s) => s.tests.map((c) => [c, s.title])));
  const [date, setDate] = useState(report?.reportDate ?? today());
  // The clinic's patients mostly use one or two labs: until the field is touched, show the last one typed
  // (worked out on each render, since a report saved a moment ago may still be on its way into the list).
  const [typedLab, setLabName] = useState<string | null>(report ? (report.labName ?? "") : null);
  const labName = typedLab ?? reports.find((r) => r.labName)?.labName ?? "";
  const [typedTitle, setTitle] = useState(report?.title ?? initialTitle ?? "");
  const title = typedTitle || (isOther ? "" : (labPanel(panel, cat)?.name ?? ""));
  const [conclusion, setConclusion] = useState(report?.conclusion ?? "");
  const [showRange, setShowRange] = useState(Boolean(report?.results.some((r) => r.low !== undefined || r.high !== undefined)));
  const [rows, setRows] = useState<Record<string, RowInput>>(() =>
    Object.fromEntries(codes.map((c) => [c, rowFromResult(byCode[c], report?.results.find((x) => x.code === c))])),
  );
  const [error, setError] = useState<string | null>(null);
  const [trendOf, setTrendOf] = useState<string | null>(null);
  // Photos point at the report, so a new report gets its id now.
  const [reportId] = useState(() => report?.id ?? uuid());
  const [files, setFiles] = useState<LabFileRef[]>(report?.files ?? []);
  const added = useRef<string[]>([]);
  const removed = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** `list` is copied from the input first: clearing the input empties its live FileList. */
  async function addFiles(list: File[]) {
    if (!list.length) return;
    if (!filesConsented) {
      if (!confirm("Keep photos of this patient's reports?\n\nThey are stored for this clinic only and can be deleted at any time. Ask the patient before continuing.")) return;
      await recordReportFilesConsent(db, patientId);
    }
    setBusy(true);
    setError(null);
    try {
      const next = [...files];
      for (const file of list) {
        if (next.length >= LAB_LIMITS.files) throw new Error(`At most ${LAB_LIMITS.files} files per report.`);
        const isPdf = file.type === "application/pdf";
        if (!isPdf && !file.type.startsWith("image/")) throw new Error("Only photos or PDF files.");
        const blob = isPdf ? file : await shrinkPhoto(file);
        if (blob.size > LAB_FILE_MAX_BYTES) throw new Error("That file is over 5 MB.");
        const ref: LabFileRef = { id: uuid(), type: isPdf ? "application/pdf" : "image/jpeg" };
        await addLabFile({ id: ref.id, type: ref.type, data: await blob.arrayBuffer(), patientId, labReportId: reportId });
        added.current.push(ref.id);
        next.push(ref);
        setFiles([...next]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function removeFile(id: string) {
    setFiles((f) => f.filter((x) => x.id !== id));
    removed.current.push(id);
  }

  async function cancel() {
    // Files added in this editor were never saved on the report: drop them.
    for (const id of added.current) await removeLabFile(id);
    onDone();
  }

  const resultOf = (test: LabTest): LabResult | null => rowResult(test, rows[test.code] ?? EMPTY_ROW, sex, sectionOf[test.code]);
  const set = (code: string, patch: Partial<RowInput>) => setRows((r) => ({ ...r, [code]: { ...(r[code] ?? EMPTY_ROW), ...patch } }));

  /** The patient's last earlier value of a test, e.g. "prev 8.1 · 12 Mar 26". */
  const previous = (code: string) => {
    for (const r of reports) {
      if (r.id === report?.id || r.reportDate > date) continue;
      const x = r.results.find((y) => y.code === code);
      if (x) return `prev ${x.value ?? x.text} · ${shortDate(r.reportDate)}`;
    }
    return null;
  };

  async function save() {
    const entered = codes.map((c) => resultOf(byCode[c]!)).filter((x): x is LabResult => x !== null);
    const results = [...entered, ...kept];
    if (!results.length && !conclusion.trim() && !files.length) return setError(isOther ? "Write the report's finding." : "Enter at least one value.");
    try {
      await saveLabReport(db, { patientId, encounterId: report ? report.encounterId : encounterId, reportDate: date, labName, panel, title, results, conclusion, files }, reportId);
      for (const id of removed.current) await removeLabFile(id);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2" data-testid="lab-editor">
      <div className="flex flex-wrap items-end gap-2">
        {isOther ? (
          <label className="flex flex-col text-xs text-slate-500">
            Report
            <input className="input w-56" list="lab-other-titles" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="USG of whole abdomen" data-testid="lab-title" />
            <datalist id="lab-other-titles">{OTHER_REPORT_TITLES.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
        ) : (
          <b className="pb-1.5 text-sm">{title}</b>
        )}
        <label className="flex flex-col text-xs text-slate-500">
          Report date
          <input type="date" className="input w-36" value={date} max={today()} onChange={(e) => setDate(e.target.value)} data-testid="lab-date" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Lab
          <input className="input w-44" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="Popular Diagnostic" data-testid="lab-name" />
        </label>
        {!isOther && (
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setShowRange((v) => !v)} data-testid="lab-range-toggle">
            Lab's range {showRange ? "▴" : "▾"}
          </button>
        )}
      </div>
      {!isOther && (
        <table className="w-full text-sm">
          <tbody>
            {codes.map((c, i, shown) => {
              const test = byCode[c]!;
              const row = rows[c] ?? EMPTY_ROW;
              const res = resultOf(test);
              const prev = previous(c);
              const heading = sectionOf[c] && sectionOf[c] !== sectionOf[shown[i - 1] ?? ""] ? sectionOf[c] : null;
              return (
                <Fragment key={c}>
                {heading && (
                  <tr><td colSpan={7} className="pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{heading}</td></tr>
                )}
                <tr className="align-top">
                  <td className="py-0.5 pr-2 text-slate-600" title={test.name}>{test.short}</td>
                  <td className="py-0.5 pr-2">
                    <LabValueInput test={test} row={row} onChange={(patch) => set(c, patch)} testId={`lab-value-${c}`} />
                    {prev && (
                      <button type="button" className="block text-left text-[11px] text-slate-400 hover:text-brand-700" title="Show the trend"
                        onClick={() => setTrendOf(trendOf === c ? null : c)} data-testid={`lab-prev-${c}`}>
                        {prev} ↗
                      </button>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{test.unit}</td>
                  <td className="py-1 pr-2 text-xs text-slate-400">{labRefText(test, sex)}</td>
                  {showRange && (
                    <td className="py-0.5 pr-2 whitespace-nowrap">
                      {test.kind === "numeric" && (
                        <>
                          <input className="input w-16 py-1 text-xs" inputMode="decimal" placeholder="low" value={row.low} onChange={(e) => set(c, { low: e.target.value })} aria-label={`${test.short} low`} />
                          {" – "}
                          <input className="input w-16 py-1 text-xs" inputMode="decimal" placeholder="high" value={row.high} onChange={(e) => set(c, { high: e.target.value })} aria-label={`${test.short} high`} />
                        </>
                      )}
                    </td>
                  )}
                  <td className={`w-6 py-1 text-xs font-bold ${res?.flag ? FLAG_STYLE[res.flag] : ""}`} data-testid={`lab-flag-${c}`}>{res?.flag ?? ""}</td>
                  <td className="py-1">
                    {res && (
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input type="checkbox" checked={res.print} onChange={(e) => set(c, { print: e.target.checked })} data-testid={`lab-print-${c}`} />
                        print
                      </label>
                    )}
                  </td>
                </tr>
                {trendOf === c && (
                  <tr>
                    <td />
                    <td colSpan={6} className="pb-2">
                      <LabTrendChart code={c} sex={sex} testId={`lab-trend-${c}`}
                        points={[...trendSeries(reports.filter((r) => r.id !== report?.id), c), ...(res?.value !== undefined ? [{ date, value: res.value, flag: res.flag }] : [])]
                          .sort((a, b) => a.date.localeCompare(b.date))} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {kept.map((r) => (
              <tr key={r.code} data-testid={`lab-kept-${r.code}`}>
                <td colSpan={7} className="py-0.5 text-xs text-slate-500">{labValueText(r, cat)} <span className="text-slate-400">(kept as entered)</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <textarea
        className="input min-h-10 w-full"
        rows={isOther ? 2 : 1}
        value={conclusion}
        onChange={(e) => setConclusion(e.target.value)}
        placeholder={isOther ? "Finding, e.g. Fatty liver grade I" : "Comment (optional, prints)"}
        data-testid="lab-conclusion"
      />
      <div className="flex flex-wrap items-center gap-2">
        <LabFileTiles files={files} onRemove={removeFile} />
        <label className="btn-secondary cursor-pointer px-2 py-1 text-xs">
          📷 Photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
        <label className="btn-secondary cursor-pointer px-2 py-1 text-xs">
          Attach file
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} data-testid="lab-file-input" />
        </label>
        {busy && <span className="text-xs text-slate-500">Adding…</span>}
      </div>
      {error && <p className="text-sm text-red-700" data-testid="lab-error">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1 text-sm" onClick={save} disabled={busy} data-testid="lab-save">Save report</button>
        <button className="btn-ghost px-3 py-1 text-sm" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}
