"use client";

import { LAB_DEPARTMENTS, labRefText, type LabCatalogue, type LabPanel, type LabResult, type LabWho, type Sex } from "@rx/core";
import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/doctor/context";
import { saveLabRequest, verifyLabRequest } from "@/lib/doctor/data";
import { useLabCatalogue } from "@/lib/doctor/hooks";
import { buildLabPrintHtml, provisionalLabRef } from "@/lib/doctor/lab-print";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, parseJson, uuid } from "@/lib/doctor/util";
import { ReportLoading } from "@/components/loading-states";
import { SaveButton } from "@/components/save-button";
import { ListPager } from "@/components/list-pager";
import { EMPTY_ROW, FLAG_STYLE, LabValueInput, rowFromResult, rowResult, type RowInput } from "./lab-entry";
import { PatientSearch } from "./patient-search";

/**
 * The clinic's own lab: the assistant (or doctor) takes a patient's tests, enters the results and prints a lab
 * report. #/lab is the list, #/lab/new a new request, #/lab/<requestId> one request, #/lab/<requestId>/print its report.
 */
export function LabScreen({ route }: { route: string[] }) {
  // Keyed by the address: "New lab report" for another patient starts afresh.
  if (route[1] === "new") return <LabRequestEditor key={typeof window !== "undefined" ? window.location.hash : "new"} />;
  if (route[1] && route[2] === "print") return <LabPrintView requestId={route[1]} />;
  if (route[1]) return <LabRequestEditor requestId={route[1]} />;
  return <LabWorklist />;
}

const shortTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function LabWorklist() {
  const session = useSession();
  const [page, setPage] = useState(0);
  const pageSize = 40;
  const { data } = useQuery<{ request_id: string; lab_no: string | null; collected_at: string | null; titles: string; name: string; code: string | null; abnormal: number; verified: number }>(
    `SELECT r.request_id, max(r.lab_no) AS lab_no, min(r.collected_at) AS collected_at, group_concat(r.title, ', ') AS titles, p.name, p.code,
            sum(r.results LIKE '%"flag":%') AS abnormal,
            sum(CASE WHEN r.verified_at IS NOT NULL AND r.verified_at <> '' THEN 1 ELSE 0 END) AS verified
       FROM lab_report r JOIN patient p ON p.id = r.patient_id
      WHERE r.source = 'in_house' AND r.request_id IS NOT NULL AND r.deleted_at IS NULL
      GROUP BY r.request_id ORDER BY max(r.created_at) DESC LIMIT ? OFFSET ?`,
    [pageSize, page * pageSize],
  );
  const { data: totals } = useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM (
       SELECT r.request_id FROM lab_report r
        WHERE r.source = 'in_house' AND r.request_id IS NOT NULL AND r.deleted_at IS NULL
        GROUP BY r.request_id
     ) AS requests`,
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Lab</h1>
        <span className="flex items-center gap-1.5">
          {session.tenantRole !== "assistant" && <a href="#/settings/lab" className="btn-ghost text-sm" data-testid="lab-settings-link">Lab settings</a>}
          <Link to="/lab/new" className="btn-primary">+ New lab report</Link>
        </span>
      </div>
      <div className="card divide-y divide-slate-100" data-testid="lab-worklist">
        {data.map((r) => (
          <div key={r.request_id} className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 text-sm" data-testid="lab-request">
            <Link to={`/lab/${r.request_id}`} className="min-w-0 hover:underline">
              <b>{r.name}</b> <span className="text-slate-500">{r.code}</span>
              <span className="ml-2 text-slate-700">{r.titles}</span>
              {r.abnormal > 0 && <span className="ml-2 text-xs font-semibold text-red-700">abnormal</span>}
              {r.verified > 0
                ? <span className="ml-2 text-xs font-semibold text-green-700">verified</span>
                : <span className="ml-2 text-xs text-amber-700">unverified</span>}
            </Link>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <span data-testid="lab-no">{r.lab_no ?? provisionalLabRef(r.request_id)}</span>
              <span>{shortTime(r.collected_at)}</span>
              <Link to={`/lab/${r.request_id}/print`} className="btn-secondary px-2 py-0.5 text-xs">Print</Link>
            </span>
          </div>
        ))}
        {!data.length && <p className="px-2.5 py-3 text-sm text-slate-500">No lab reports yet. Start with “New lab report”.</p>}
        <ListPager page={page} total={Number(totals[0]?.n ?? 0)} size={pageSize} onPage={setPage} />
      </div>
    </div>
  );
}

interface PanelState {
  panel: string;
  specimen: string;
  comment: string;
  rows: Record<string, RowInput>;
}

/** A datetime-local value for now, in this device's time. */
const localNow = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function LabRequestEditor({ requestId }: { requestId?: string }) {
  const db = usePowerSync();
  const cat = useLabCatalogue();
  const [id] = useState(() => requestId ?? uuid());
  const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.hash.split("?")[1] ?? "") : new URLSearchParams();
  const [patientId, setPatientId] = useState<string | null>(qs.get("patient"));
  const [referredBy, setReferredBy] = useState("");
  const [collectedAt, setCollectedAt] = useState(localNow);
  const [panels, setPanels] = useState<PanelState[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(!requestId);

  const { data: existing } = useQuery<{ patient_id: string; panel: string; specimen: string | null; comment: string | null; referred_by: string | null; collected_at: string | null; results: string | null }>(
    `SELECT patient_id, panel, specimen, comment, referred_by, collected_at, results FROM lab_report WHERE request_id = ? AND deleted_at IS NULL ORDER BY created_at`,
    [requestId ?? "__new__"],
  );
  // Opening a saved request: fill the form once from its rows.
  useEffect(() => {
    if (loaded.current || !existing.length) return;
    loaded.current = true;
    const first = existing[0]!;
    setPatientId(first.patient_id);
    setReferredBy(first.referred_by ?? "");
    if (first.collected_at) setCollectedAt(toLocalInput(first.collected_at));
    setPanels(existing.map((r) => {
      const results = parseJson<LabResult[]>(r.results, []);
      const codes = [...new Set([...(cat.panelById[r.panel]?.tests ?? []), ...results.map((x) => x.code)])];
      return { panel: r.panel, specimen: r.specimen ?? "", comment: r.comment ?? "", rows: Object.fromEntries(codes.map((c) => [c, rowFromResult(cat.byCode[c], results.find((x) => x.code === c))])) };
    }));
  }, [existing, cat]);

  const { data: pts } = useQuery<{ id: string; name: string; dob: string | null; sex: string | null; code: string | null; mobile: string | null }>(
    "SELECT id, name, dob, sex, code, mobile FROM patient WHERE id = ?", [patientId ?? "__none__"]);
  const patient = pts[0];
  const ageDays = patient?.dob ? Math.floor((Date.now() - new Date(`${patient.dob}T00:00:00`).getTime()) / 86_400_000) : null;
  const who: LabWho = { sex: (patient?.sex as Sex) ?? null, ageDays };

  const toggle = (p: LabPanel) =>
    setPanels((ps) => (ps.some((x) => x.panel === p.id) ? ps.filter((x) => x.panel !== p.id) : [...ps, { panel: p.id, specimen: p.specimen ?? "", comment: "", rows: {} }]));
  const remove = (panel: string) => setPanels((ps) => ps.filter((x) => x.panel !== panel));
  const setRow = (panel: string, code: string, patch: Partial<RowInput>) =>
    setPanels((ps) => ps.map((x) => (x.panel === panel ? { ...x, rows: { ...x.rows, [code]: { ...(x.rows[code] ?? EMPTY_ROW), ...patch } } } : x)));
  const setPanel = (panel: string, patch: Partial<PanelState>) => setPanels((ps) => ps.map((x) => (x.panel === panel ? { ...x, ...patch } : x)));

  const resultsOf = (st: PanelState): LabResult[] => {
    const p = cat.panelById[st.panel];
    const sectionOf = Object.fromEntries((p?.sections ?? []).flatMap((s) => s.tests.map((c) => [c, s.title])));
    const codes = [...new Set([...(p?.tests ?? []), ...Object.keys(st.rows)])];
    return codes
      .map((c) => (cat.byCode[c] ? rowResult(cat.byCode[c]!, st.rows[c] ?? EMPTY_ROW, who, sectionOf[c]) : null))
      .filter((x): x is LabResult => x !== null);
  };

  async function save(thenPrint: boolean) {
    if (saving) return;
    setError(null);
    if (!patientId) return setError("Choose the patient first.");
    if (!panels.length) return setError("Choose at least one test.");
    const empty = panels.find((st) => !resultsOf(st).length);
    if (empty) return setError(`Enter the results of ${cat.panelById[empty.panel]?.name ?? empty.panel}, or remove it.`);
    setSaving(true);
    try {
      await saveLabRequest(db, {
        requestId: id, patientId, referredBy, collectedAt: new Date(collectedAt).toISOString(),
        panels: panels.map((st) => ({
          panel: st.panel, title: cat.panelById[st.panel]?.name ?? st.panel, department: cat.panelById[st.panel]?.department ?? "",
          specimen: st.specimen, comment: st.comment, results: resultsOf(st),
        })),
      });
      navigate(thenPrint ? `/lab/${id}/print` : "/lab");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const words = filter.trim().toLowerCase();
  const offered = cat.panels.filter((p) => !words || `${p.name} ${(p.aliases ?? []).join(" ")}`.toLowerCase().includes(words));

  return (
    <div className="space-y-2" data-testid="lab-request-editor">
      <div className="flex items-center gap-2">
        <Link to="/lab" className="btn-ghost">← Lab</Link>
        <h1 className="text-lg font-semibold">{requestId ? "Lab report" : "New lab report"}</h1>
      </div>

      {patient ? (
        <div className="card flex flex-wrap items-center gap-2 p-2 text-sm" data-testid="lab-patient">
          <b>{patient.name}</b>
          <span className="text-slate-500">{ageLabel(patient.dob)} {patient.sex?.[0]?.toUpperCase()} · {patient.mobile} · {patient.code}</span>
          {!requestId && <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setPatientId(null)}>Change</button>}
        </div>
      ) : (
        <div className="space-y-1">
          <PatientSearch onPick={(p) => setPatientId(p.id)} actionLabel="Select" />
          <Link to="/patients/new?then=lab" className="text-sm text-brand-700 underline">Register a new patient</Link>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-2 p-2">
        <label className="flex flex-col text-xs text-slate-500">
          Referred by
          <input className="input w-64" value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Dr. … (blank: Self)" data-testid="lab-referred-by" />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Sample collected
          <input type="datetime-local" className="input w-56" value={collectedAt} max={localNow()} onChange={(e) => setCollectedAt(e.target.value)} data-testid="lab-collected-at" />
        </label>
      </div>

      <div className="card space-y-1.5 p-2" data-testid="lab-test-picker">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Tests</h2>
          <input className="input max-w-xs py-1 text-sm" placeholder="Find a test…" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="lab-test-filter" />
        </div>
        {LAB_DEPARTMENTS.map((d) => {
          const ps = offered.filter((p) => p.department === d.id);
          if (!ps.length) return null;
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-1.5">
              <span className="w-36 text-xs text-slate-500">{d.name}</span>
              {ps.map((p) => {
                const on = panels.some((x) => x.panel === p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p)} data-testid={`lab-pick-${p.id}`}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 hover:bg-slate-50"}`}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {panels.map((st) => (
        <PanelResults key={st.panel} cat={cat} state={st} who={who}
          onRow={(code, patch) => setRow(st.panel, code, patch)} onPanel={(patch) => setPanel(st.panel, patch)} onRemove={() => remove(st.panel)} />
      ))}

      {error && <p className="text-sm text-red-700" data-testid="lab-request-error">{error}</p>}
      <div className="flex gap-2">
        <SaveButton type="button" className="btn-primary" saving={saving} onClick={() => save(true)} data-testid="lab-save-print">Save & print</SaveButton>
        <SaveButton type="button" className="btn-secondary" saving={saving} onClick={() => save(false)} data-testid="lab-save-request">Save</SaveButton>
      </div>
    </div>
  );
}

function PanelResults({ cat, state, who, onRow, onPanel, onRemove }: {
  cat: LabCatalogue;
  state: PanelState;
  who: LabWho;
  onRow: (code: string, patch: Partial<RowInput>) => void;
  onPanel: (patch: Partial<PanelState>) => void;
  onRemove: () => void;
}) {
  const p = cat.panelById[state.panel];
  const sectionOf = Object.fromEntries((p?.sections ?? []).flatMap((s) => s.tests.map((c) => [c, s.title])));
  const codes = [...new Set([...(p?.tests ?? []), ...Object.keys(state.rows)])].filter((c) => cat.byCode[c]);
  return (
    <section className="card space-y-1.5 p-2" data-testid={`lab-panel-${state.panel}`}>
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="pb-1.5 font-semibold">{p?.name ?? state.panel}</h2>
        <label className="flex flex-col text-xs text-slate-500">
          Specimen
          <input className="input w-44 py-1" value={state.specimen} onChange={(e) => onPanel({ specimen: e.target.value })} />
        </label>
        <button className="btn-ghost ml-auto px-2 py-0.5 text-xs text-red-700" onClick={onRemove}>Remove test</button>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {codes.map((c, i) => {
            const test = cat.byCode[c]!;
            const row = state.rows[c] ?? EMPTY_ROW;
            const res = rowResult(test, row, who, sectionOf[c]);
            const heading = sectionOf[c] && sectionOf[c] !== sectionOf[codes[i - 1] ?? ""] ? sectionOf[c] : null;
            return (
              <FragmentRow key={c} heading={heading}>
                <tr className="align-top">
                  <td className="w-48 py-0.5 pr-2 text-slate-600" title={test.name}>{test.short}</td>
                  <td className="py-0.5 pr-2"><LabValueInput test={test} row={row} onChange={(patch) => onRow(c, patch)} testId={`lab-in-${c}`} /></td>
                  <td className="py-1 pr-2 text-xs text-slate-500">{test.kind === "culture" ? "" : test.unit}</td>
                  <td className="py-1 pr-2 text-xs text-slate-400">{labRefText(test, who)}</td>
                  <td className={`w-6 py-1 text-xs font-bold ${res?.flag ? FLAG_STYLE[res.flag] : ""}`} data-testid={`lab-in-flag-${c}`}>{res?.flag ?? ""}</td>
                </tr>
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
      <input className="input w-full py-1 text-sm" value={state.comment} onChange={(e) => onPanel({ comment: e.target.value })} placeholder="Comment (optional, prints)" />
    </section>
  );
}

function FragmentRow({ heading, children }: { heading: string | null | undefined; children: React.ReactNode }) {
  return (
    <>
      {heading && <tr><td colSpan={5} className="pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{heading}</td></tr>}
      {children}
    </>
  );
}

function LabPrintView({ requestId }: { requestId: string }) {
  const db = usePowerSync();
  const session = useSession();
  const cat = useLabCatalogue();
  const frame = useRef<HTMLIFrameElement>(null);
  const [bundle, setBundle] = useState<{ html: string; labNo: string | null; verified: boolean } | null | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const canVerify = session.tenantRole === "doctor" || session.tenantRole === "clinic_admin";
  // Rebuild when the request changes, or its Lab No / verification arrives from the server.
  const { data: watch } = useQuery<{ k: string }>(
    `SELECT max(updated_at) || coalesce(max(lab_no), '') || coalesce(max(verified_at), '') || count(*) AS k FROM lab_report WHERE request_id = ? AND deleted_at IS NULL`, [requestId]);
  const { data: profile } = useQuery<{ k: string }>(`SELECT coalesce(max(updated_at), '') AS k FROM lab_profile`);
  useEffect(() => {
    void buildLabPrintHtml(db, requestId, { cat, userName: session.name }).then(setBundle);
  }, [db, requestId, cat, session.name, watch[0]?.k, profile[0]?.k]);

  async function print() {
    const w = frame.current?.contentWindow;
    if (!w) return;
    await w.document.fonts.ready;
    w.focus();
    w.print();
  }

  async function toggleVerify() {
    if (!bundle || !canVerify) return;
    setVerifying(true);
    try {
      await verifyLabRequest(db, requestId, !bundle.verified);
      setBundle(await buildLabPrintHtml(db, requestId, { cat, userName: session.name }));
    } finally {
      setVerifying(false);
    }
  }

  if (bundle === undefined) return <ReportLoading />;
  if (bundle === null) return <div className="text-sm text-slate-500">This lab report isn't on this device.</div>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        <Link to={`/lab/${requestId}`} className="btn-ghost">← Edit</Link>
        <Link to="/lab" className="btn-ghost">Lab</Link>
        {canVerify && (
          <button type="button" className={bundle.verified ? "btn-secondary" : "btn-primary"} disabled={verifying} onClick={toggleVerify} data-testid="lab-verify">
            {bundle.verified ? "Clear verification" : "Mark verified"}
          </button>
        )}
        <button className="btn-primary" onClick={print} data-testid="lab-print">Print</button>
        <a className="btn-secondary" href={`/api/print/lab/${requestId}/pdf`} target="_blank" rel="noreferrer" data-testid="lab-pdf">Download PDF (online)</a>
        <span className="text-xs text-slate-500" data-testid="lab-print-no">{bundle.labNo ? `Lab No ${bundle.labNo}` : `${provisionalLabRef(requestId)} · Lab No once synced`}</span>
        <span className={`text-xs ${bundle.verified ? "text-green-700" : "text-amber-700"}`} data-testid="lab-verify-status">
          {bundle.verified ? "Verified" : "Not verified"}
        </span>
      </div>
      <div className="overflow-auto rounded bg-slate-200 p-2">
        <iframe ref={frame} title="Lab report preview" srcDoc={bundle.html} sandbox="allow-same-origin allow-modals"
          className="mx-auto block bg-white shadow" style={{ width: "226mm", height: "317mm", border: 0 }} data-testid="lab-print-frame" />
      </div>
    </div>
  );
}
