"use client";

import {
  LAB_PANELS,
  LAB_TEST_BY_CODE,
  labPanel,
  labRange,
  labResult,
  labTrend,
  labValueText,
  OTHER_PANEL,
  panelForInvestigation,
  panelOfTest,
  parseLabShorthand,
  OTHER_REPORT_TITLES,
  type LabResult,
  type LabTest,
  type Sex,
  type TrendPoint,
} from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { Fragment, useEffect, useState } from "react";
import { deleteLabReport, lastFinalDoc, saveLabReport } from "@/lib/doctor/data";
import { parseJson, today } from "@/lib/doctor/util";

export interface LabReportView {
  id: string;
  encounterId: string | null;
  reportDate: string;
  labName: string | null;
  panel: string;
  title: string;
  results: LabResult[];
  conclusion: string | null;
}

/** A patient's lab reports, newest first. */
export function useLabReports(patientId: string): LabReportView[] {
  const { data } = useQuery<{ id: string; encounter_id: string | null; report_date: string; lab_name: string | null; panel: string; title: string; results: string | null; conclusion: string | null }>(
    `SELECT id, encounter_id, report_date, lab_name, panel, title, results, conclusion FROM lab_report
      WHERE patient_id = ? AND deleted_at IS NULL ORDER BY report_date DESC, created_at DESC`,
    [patientId],
  );
  return data.map((r) => ({
    id: r.id, encounterId: r.encounter_id, reportDate: r.report_date, labName: r.lab_name, panel: r.panel, title: r.title,
    results: parseJson<LabResult[]>(r.results, []), conclusion: r.conclusion,
  }));
}

const FLAG_STYLE: Record<string, string> = { H: "text-red-700", L: "text-blue-700", A: "text-amber-700" };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

/** One report as a line of values; abnormal ones coloured, the ones that print in bold. */
export function LabReportSummary({ r }: { r: LabReportView }) {
  return (
    <span className="text-sm">
      <b>{r.title}</b> <span className="text-slate-500">· {shortDate(r.reportDate)}{r.labName ? ` · ${r.labName}` : ""}</span>
      {r.results.length > 0 && <span className="text-slate-400">: </span>}
      {r.results.map((x, i) => (
        <span key={x.code}>
          {i > 0 && ", "}
          <span className={`${x.flag ? FLAG_STYLE[x.flag] : "text-slate-700"} ${x.print ? "font-semibold" : ""}`} data-testid={`lab-result-${x.code}`}>{labValueText(x)}</span>
        </span>
      ))}
      {r.conclusion && <span className="text-slate-700">{r.results.length ? " · " : ": "}{r.conclusion}</span>}
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
  const test = LAB_TEST_BY_CODE[code];
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
export function LabReports({ encounterId, patientId, sex }: { encounterId: string; patientId: string; sex: Sex | null }) {
  const db = usePowerSync();
  const reports = useLabReports(patientId);
  const [editing, setEditing] = useState<{ panel: string; report?: LabReportView; title?: string } | null>(null);
  const [quick, setQuick] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<string[]>([]);
  const thisVisit = reports.filter((r) => r.encounterId === encounterId);
  const earlier = reports.filter((r) => r.encounterId !== encounterId);
  const lastLab = reports.find((r) => r.labName)?.labName ?? "";

  // What the doctor asked for last time is usually what the patient brings: offer those first.
  useEffect(() => {
    void lastFinalDoc(db, patientId, encounterId).then((d) => setOrdered(d?.investigations ?? []));
  }, [db, patientId, encounterId]);
  // One chip per panel ("RBS, HbA1c" → Blood sugar); hidden once this visit has that report.
  const orderedChips: { key: string; panel: string; title?: string; names: string[] }[] = [];
  for (const name of ordered) {
    const p = panelForInvestigation(name);
    const key = p.title ? `${OTHER_PANEL}:${p.title}` : p.panel;
    const chip = orderedChips.find((c) => c.key === key);
    if (chip) chip.names.push(name);
    else if (!thisVisit.some((r) => (p.title ? r.panel === OTHER_PANEL && r.title === p.title : r.panel === p.panel))) orderedChips.push({ key, ...p, names: [name] });
  }

  /** "hb 9.2 wbc 11800 rbs 11.4": one report per panel, dated today, from the last lab. */
  async function saveQuick() {
    const parsed = parseLabShorthand(quick);
    if (parsed.unknown.length) return setQuickError(`Didn't recognise: ${parsed.unknown.join(", ")}`);
    if (!parsed.results.length) return;
    const byPanel = new Map<string, LabResult[]>();
    for (const x of parsed.results) {
      const test = LAB_TEST_BY_CODE[x.code]!;
      const panel = panelOfTest(x.code)?.id ?? OTHER_PANEL;
      byPanel.set(panel, [...(byPanel.get(panel) ?? []).filter((r) => r.code !== x.code), labResult(test, x, sex)]);
    }
    try {
      for (const [panel, results] of byPanel) {
        await saveLabReport(db, { patientId, encounterId, reportDate: today(), labName: lastLab, panel, title: labPanel(panel)?.name ?? "Reports", results, conclusion: "" });
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
  }

  return (
    <section className="space-y-2" data-testid="lab-reports">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</h3>
        {[...LAB_PANELS.map((p) => ({ id: p.id, name: p.name })), { id: OTHER_PANEL, name: "Imaging / other" }].map((p) => (
          <button key={p.id} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs hover:bg-slate-50" onClick={() => setEditing({ panel: p.id })} data-testid={`lab-add-${p.id}`}>
            + {p.name}
          </button>
        ))}
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
          onDone={() => setEditing(null)}
        />
      )}
      {thisVisit.map((r) => (
        <div key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-slate-50 px-2 py-1" data-testid="lab-report">
          <LabReportSummary r={r} />
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

interface RowInput {
  value: string;
  text: string;
  low: string;
  high: string;
  /** Unset: follow the flag (abnormal values print). */
  print?: boolean;
}

const toNum = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

function rangeHint(test: LabTest, sex: Sex | null) {
  const { low, high } = labRange(test, sex);
  if (low !== undefined && high !== undefined) return `${low}–${high}`;
  if (low !== undefined) return `>${low}`;
  if (high !== undefined) return `<${high}`;
  return (test.normal ?? []).join("/");
}

function LabReportEditor({ panel, report, initialTitle, patientId, encounterId, sex, reports, onDone }: {
  panel: string;
  report?: LabReportView;
  initialTitle?: string;
  patientId: string;
  encounterId: string;
  sex: Sex | null;
  reports: LabReportView[];
  onDone: () => void;
}) {
  const db = usePowerSync();
  const isOther = panel === OTHER_PANEL;
  const codes = [...new Set([...(labPanel(panel)?.tests ?? []), ...(report?.results.map((r) => r.code) ?? [])])].filter((c) => LAB_TEST_BY_CODE[c]);
  const [date, setDate] = useState(report?.reportDate ?? today());
  // The clinic's patients mostly use one or two labs: until the field is touched, show the last one typed
  // (worked out on each render, since a report saved a moment ago may still be on its way into the list).
  const [typedLab, setLabName] = useState<string | null>(report ? (report.labName ?? "") : null);
  const labName = typedLab ?? reports.find((r) => r.labName)?.labName ?? "";
  const [title, setTitle] = useState(report?.title ?? initialTitle ?? (isOther ? "" : (labPanel(panel)?.name ?? "")));
  const [conclusion, setConclusion] = useState(report?.conclusion ?? "");
  const [showRange, setShowRange] = useState(Boolean(report?.results.some((r) => r.low !== undefined || r.high !== undefined)));
  const [rows, setRows] = useState<Record<string, RowInput>>(() =>
    Object.fromEntries(codes.map((c) => {
      const r = report?.results.find((x) => x.code === c);
      return [c, { value: r?.value !== undefined ? String(r.value) : "", text: r?.text ?? "", low: r?.low !== undefined ? String(r.low) : "", high: r?.high !== undefined ? String(r.high) : "", print: r?.print }];
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [trendOf, setTrendOf] = useState<string | null>(null);

  const resultOf = (test: LabTest): LabResult | null => {
    const row = rows[test.code]!;
    const value = toNum(row.value);
    if (value === undefined && !row.text) return null;
    return labResult(test, { value, text: row.text || undefined, low: toNum(row.low), high: toNum(row.high), print: row.print }, sex);
  };
  const set = (code: string, patch: Partial<RowInput>) => setRows((r) => ({ ...r, [code]: { ...r[code]!, ...patch } }));

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
    const results = codes.map((c) => resultOf(LAB_TEST_BY_CODE[c]!)).filter((x): x is LabResult => x !== null);
    if (!results.length && !conclusion.trim()) return setError(isOther ? "Write the report's finding." : "Enter at least one value.");
    try {
      await saveLabReport(db, { patientId, encounterId: report ? report.encounterId : encounterId, reportDate: date, labName, panel, title, results, conclusion }, report?.id);
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
            {codes.map((c) => {
              const test = LAB_TEST_BY_CODE[c]!;
              const row = rows[c]!;
              const res = resultOf(test);
              const prev = previous(c);
              return (
                <Fragment key={c}>
                <tr className="align-top">
                  <td className="py-0.5 pr-2 text-slate-600" title={test.name}>{test.short}</td>
                  <td className="py-0.5 pr-2">
                    {test.kind === "coded" ? (
                      <select className="input w-28 py-1" value={row.text} onChange={(e) => set(c, { text: e.target.value })} data-testid={`lab-value-${c}`}>
                        <option value="">—</option>
                        {test.options!.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="input w-24 py-1" inputMode="decimal" value={row.value} onChange={(e) => set(c, { value: e.target.value })} data-testid={`lab-value-${c}`} />
                    )}
                    {prev && (
                      <button type="button" className="block text-left text-[11px] text-slate-400 hover:text-brand-700" title="Show the trend"
                        onClick={() => setTrendOf(trendOf === c ? null : c)} data-testid={`lab-prev-${c}`}>
                        {prev} ↗
                      </button>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{test.unit}</td>
                  <td className="py-1 pr-2 text-xs text-slate-400">{rangeHint(test, sex)}</td>
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
      {error && <p className="text-sm text-red-700" data-testid="lab-error">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1 text-sm" onClick={save} data-testid="lab-save">Save report</button>
        <button className="btn-ghost px-3 py-1 text-sm" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
