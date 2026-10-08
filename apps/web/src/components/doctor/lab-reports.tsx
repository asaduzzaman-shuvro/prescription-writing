"use client";

import {
  LAB_PANELS,
  LAB_TEST_BY_CODE,
  labPanel,
  labRange,
  labResult,
  labValueText,
  OTHER_PANEL,
  OTHER_REPORT_TITLES,
  type LabResult,
  type LabTest,
  type Sex,
} from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { deleteLabReport, saveLabReport } from "@/lib/doctor/data";
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

/** The visit's Reports card: add the paper reports the patient brought; ticked values print on the prescription. */
export function LabReports({ encounterId, patientId, sex }: { encounterId: string; patientId: string; sex: Sex | null }) {
  const db = usePowerSync();
  const reports = useLabReports(patientId);
  const [editing, setEditing] = useState<{ panel: string; report?: LabReportView } | null>(null);
  const thisVisit = reports.filter((r) => r.encounterId === encounterId);
  const earlier = reports.filter((r) => r.encounterId !== encounterId);

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
      {editing && (
        <LabReportEditor
          key={editing.report?.id ?? editing.panel}
          panel={editing.panel}
          report={editing.report}
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

function LabReportEditor({ panel, report, patientId, encounterId, sex, reports, onDone }: {
  panel: string;
  report?: LabReportView;
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
  const [title, setTitle] = useState(report?.title ?? (isOther ? "" : (labPanel(panel)?.name ?? "")));
  const [conclusion, setConclusion] = useState(report?.conclusion ?? "");
  const [showRange, setShowRange] = useState(Boolean(report?.results.some((r) => r.low !== undefined || r.high !== undefined)));
  const [rows, setRows] = useState<Record<string, RowInput>>(() =>
    Object.fromEntries(codes.map((c) => {
      const r = report?.results.find((x) => x.code === c);
      return [c, { value: r?.value !== undefined ? String(r.value) : "", text: r?.text ?? "", low: r?.low !== undefined ? String(r.low) : "", high: r?.high !== undefined ? String(r.high) : "", print: r?.print }];
    })),
  );
  const [error, setError] = useState<string | null>(null);

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
                <tr key={c} className="align-top">
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
                    {prev && <div className="text-[11px] text-slate-400" data-testid={`lab-prev-${c}`}>{prev}</div>}
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
