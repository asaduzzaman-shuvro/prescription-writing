"use client";

import type { PrescriptionDoc } from "@rx/core";
import { useQuery } from "@powersync/react";
import type { ReactNode } from "react";
import { Link } from "@/lib/doctor/router";
import { parseJson } from "@/lib/doctor/util";
import { LabReportSummary, useLabReports } from "./lab-reports";

export type VisitRxActions = {
  prescriptionId: string;
  readOnly: boolean;
  version: number;
  blocked: boolean;
  finalize: () => void;
  editVersion: () => void;
};

/** Right rail on the visit screen: patient, alerts, past visits, recent labs + print actions. */
export function VisitSidePanel({
  patientId,
  encounterId,
  allergies,
  pregnancyStatus,
  patientCard,
  actions,
}: {
  patientId: string;
  encounterId: string;
  allergies: string[];
  pregnancyStatus: string | null;
  /** Patient identity / fee / visit type — rendered above Alerts. */
  patientCard?: ReactNode;
  actions?: VisitRxActions | null;
}) {
  const { data: visits } = useQuery<{ id: string; visit_date: string; status: string; doc: string | null; rx_id: string | null }>(
    `SELECT e.id, e.visit_date, e.status,
            (SELECT doc FROM prescription WHERE encounter_id = e.id AND status = 'final' ORDER BY version DESC LIMIT 1) AS doc,
            (SELECT id FROM prescription WHERE encounter_id = e.id ORDER BY status = 'final' DESC, version DESC LIMIT 1) AS rx_id
       FROM encounter e
      WHERE e.patient_id = ? AND e.id <> ? AND e.status <> 'cancelled'
      ORDER BY e.visit_date DESC, e.created_at DESC
      LIMIT 8`,
    [patientId, encounterId],
  );
  const labs = useLabReports(patientId).slice(0, 6);
  const alerts =
    allergies.length > 0 ||
    (pregnancyStatus && pregnancyStatus !== "none");

  return (
    <aside
      className="flex h-full min-h-0 flex-col"
      data-testid="visit-side-panel"
    >
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-y-contain pr-0.5">
        {patientCard}

        <section className={`rounded-md border px-2 py-1.5 ${alerts ? "border-alert/35 bg-red-50/50" : "border-slate-200 bg-white"}`}>
          <h3 className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Alerts</h3>
          {allergies.length > 0 ? (
            <p className="mt-0.5 text-xs font-semibold leading-snug text-alert">⚠ Allergy: {allergies.join(", ")}</p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">No recorded allergies</p>
          )}
          {pregnancyStatus && pregnancyStatus !== "none" && (
            <p className="mt-0.5 text-xs font-medium text-sakura-600">
              {pregnancyStatus === "both" ? "Pregnant + lactating" : pregnancyStatus === "pregnant" ? "Pregnant" : "Lactating"}
            </p>
          )}
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-2 py-1">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Past visits</span>
            <Link to={`/patients/${patientId}`} className="text-[11px] font-medium text-brand-700 hover:underline">
              History
            </Link>
          </div>
          <ul className="divide-y divide-slate-50">
            {visits.map((v) => {
              const doc = parseJson<PrescriptionDoc | null>(v.doc, null);
              return (
                <li key={v.id} className="px-2 py-1 text-xs">
                  <div className="flex items-center justify-between gap-1">
                    <b className="tabular-nums text-slate-800">{v.visit_date}</b>
                    <Link to={`/visit/${v.id}`} className="text-[11px] text-brand-700 hover:underline">
                      Open
                    </Link>
                  </div>
                  {doc && (
                    <p className="mt-0.5 line-clamp-2 leading-snug text-slate-500">
                      {doc.diagnoses.join(", ") || doc.chiefComplaints.join(", ") || "—"}
                    </p>
                  )}
                </li>
              );
            })}
            {!visits.length && <li className="px-2 py-1.5 text-xs text-slate-400">No earlier visits</li>}
          </ul>
        </section>

        <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-2 py-1">
            <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Lab reports</span>
            <Link to={`/visit/${encounterId}/reports`} className="text-[11px] font-medium text-brand-700 hover:underline">
              Enter
            </Link>
          </div>
          <ul className="divide-y divide-slate-50">
            {labs.map((r) => (
              <li key={r.id} className="px-2 py-1 text-xs">
                <LabReportSummary r={r} />
              </li>
            ))}
            {!labs.length && <li className="px-2 py-1.5 text-xs text-slate-400">No reports yet</li>}
          </ul>
        </section>
      </div>

      {actions && (
        <div
          className="mt-1 shrink-0 space-y-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-sm print:hidden"
          data-testid="visit-side-actions"
        >
          <p className="px-0.5 text-[10px] leading-snug text-slate-400">Ctrl+Enter · Ctrl+P · /</p>
          {actions.readOnly ? (
            <div className="grid grid-cols-2 gap-1">
              <button type="button" className="btn-secondary py-1.5" onClick={actions.editVersion}>
                Edit v{actions.version + 1}
              </button>
              <Link to={`/rx/${actions.prescriptionId}/print`} className="btn-primary py-1.5 text-center">
                Print
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <Link to={`/rx/${actions.prescriptionId}/print`} className="btn-secondary py-1.5 text-center" title="Ctrl+P">
                Preview
              </Link>
              <button
                type="button"
                className="btn-primary py-1.5"
                onClick={actions.finalize}
                disabled={actions.blocked}
                data-testid="finalize"
                title="Ctrl+Enter"
              >
                Finalise
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
