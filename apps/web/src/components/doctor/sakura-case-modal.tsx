"use client";

import { useEffect, useState } from "react";
import { sakuraApi, SakuraApiError } from "@/lib/sakura/client";
import type {
  SakuraAppointment,
  SakuraCaseDetails,
  SakuraOtCaseForm,
  SakuraResearchCaseForm,
} from "@/lib/sakura/types";
import { getDisplaySerial } from "@/lib/sakura/utils";
import styles from "./sakura-dashboard.module.css";

const OT_SIDES = ["Left", "Right", "Bilateral", "N/A"];
const OT_PRIORITIES = ["Elective", "Urgent", "Emergency"];
const OT_ANESTHESIA = ["Local", "Sedation", "GA", "TBD"];
const RESEARCH_CONSENT = ["Yes", "No", "Pending"];
const RESEARCH_VISIT = ["Screening", "Baseline", "Follow-up", "End of study"];

function emptyOt(): Required<SakuraOtCaseForm> {
  return {
    procedure: "",
    side: "N/A",
    plannedDate: "",
    priority: "Elective",
    anesthesia: "TBD",
    diagnosis: "",
    notes: "",
  };
}

function emptyResearch(): Required<SakuraResearchCaseForm> {
  return {
    studyTitle: "",
    studyCode: "",
    consentTaken: "Pending",
    visitType: "Baseline",
    inclusionNotes: "",
    notes: "",
  };
}

function Ms({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

type Props = {
  appointment: SakuraAppointment;
  caseType: "OT Case" | "Research Case";
  allAppointments: SakuraAppointment[];
  onClose: () => void;
  onSaved: (updated: Partial<SakuraAppointment>) => void;
};

export function SakuraCaseModal({
  appointment,
  caseType,
  allAppointments,
  onClose,
  onSaved,
}: Props) {
  const [ot, setOt] = useState<Required<SakuraOtCaseForm>>(emptyOt);
  const [research, setResearch] = useState<Required<SakuraResearchCaseForm>>(emptyResearch);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const details = appointment.caseDetails;
    setOt({ ...emptyOt(), ...(details?.ot || {}) });
    setResearch({ ...emptyResearch(), ...(details?.research || {}) });
    setError(null);
  }, [appointment]);

  async function save() {
    if (caseType === "OT Case" && !ot.procedure.trim()) {
      setError("Procedure / surgery name is required.");
      return;
    }
    if (caseType === "Research Case" && !research.studyTitle.trim()) {
      setError("Study / protocol title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const caseDetails: SakuraCaseDetails =
      caseType === "OT Case"
        ? { caseType: "OT Case", ot: { ...ot, procedure: ot.procedure.trim() } }
        : {
            caseType: "Research Case",
            research: { ...research, studyTitle: research.studyTitle.trim() },
          };
    try {
      const updated = await sakuraApi.put<SakuraAppointment>(`/appointments/${appointment.id}`, {
        identifier: caseType,
        caseDetails,
      });
      onSaved({
        identifier: updated?.identifier ?? caseType,
        caseDetails: (updated?.caseDetails as SakuraCaseDetails) ?? caseDetails,
      });
    } catch (err) {
      const message =
        err instanceof SakuraApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not save case details.";
      setError(message);
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className={styles.modalBackdrop} style={{ zIndex: 102 }} onClick={onClose} role="dialog">
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--sg-line)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.caseModalHead}>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg leading-tight font-extrabold">
              <Ms name={caseType === "OT Case" ? "medical_services" : "biotech"} />
              {caseType === "OT Case" ? "OT case" : "Research case"} · #
              {getDisplaySerial(appointment, allAppointments)}
            </h2>
            <p className="mt-1 text-sm opacity-90">{appointment.patient.fullName}</p>
          </div>
          <button type="button" className="shrink-0 rounded-lg p-1 hover:bg-white/10" onClick={onClose} aria-label="Close">
            <Ms name="close" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {caseType === "OT Case" ? (
            <>
              <label className={styles.caseField}>
                <span className={styles.caseLabel}>
                  Procedure / surgery <span className="text-red-500">*</span>
                </span>
                <input
                  className={styles.caseInput}
                  value={ot.procedure}
                  onChange={(e) => setOt((f) => ({ ...f, procedure: e.target.value }))}
                  placeholder="e.g. Tonsillectomy"
                />
              </label>
              <div className={styles.caseGrid}>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Side</span>
                  <select
                    className={styles.caseInput}
                    value={ot.side}
                    onChange={(e) => setOt((f) => ({ ...f, side: e.target.value }))}
                  >
                    {OT_SIDES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Priority</span>
                  <select
                    className={styles.caseInput}
                    value={ot.priority}
                    onChange={(e) => setOt((f) => ({ ...f, priority: e.target.value }))}
                  >
                    {OT_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Anesthesia</span>
                  <select
                    className={styles.caseInput}
                    value={ot.anesthesia}
                    onChange={(e) => setOt((f) => ({ ...f, anesthesia: e.target.value }))}
                  >
                    {OT_ANESTHESIA.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Planned OT date</span>
                  <input
                    type="date"
                    className={styles.caseInput}
                    value={ot.plannedDate}
                    onChange={(e) => setOt((f) => ({ ...f, plannedDate: e.target.value }))}
                  />
                </label>
              </div>
              <label className={styles.caseField}>
                <span className={styles.caseLabel}>Diagnosis / indication</span>
                <input
                  className={styles.caseInput}
                  value={ot.diagnosis}
                  onChange={(e) => setOt((f) => ({ ...f, diagnosis: e.target.value }))}
                  placeholder="Short indication"
                />
              </label>
              <label className={styles.caseField}>
                <span className={styles.caseLabel}>OT notes</span>
                <textarea
                  className={styles.caseInput}
                  rows={2}
                  value={ot.notes}
                  onChange={(e) => setOt((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Implants, special prep, etc."
                />
              </label>
            </>
          ) : (
            <>
              <label className={styles.caseField}>
                <span className={styles.caseLabel}>
                  Study / protocol title <span className="text-red-500">*</span>
                </span>
                <input
                  className={styles.caseInput}
                  value={research.studyTitle}
                  onChange={(e) => setResearch((f) => ({ ...f, studyTitle: e.target.value }))}
                  placeholder="Study name"
                />
              </label>
              <div className={styles.caseGrid}>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Study ID / code</span>
                  <input
                    className={styles.caseInput}
                    value={research.studyCode}
                    onChange={(e) => setResearch((f) => ({ ...f, studyCode: e.target.value }))}
                    placeholder="Optional code"
                  />
                </label>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Consent taken</span>
                  <select
                    className={styles.caseInput}
                    value={research.consentTaken}
                    onChange={(e) => setResearch((f) => ({ ...f, consentTaken: e.target.value }))}
                  >
                    {RESEARCH_CONSENT.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.caseField}>
                  <span className={styles.caseLabel}>Visit type</span>
                  <select
                    className={styles.caseInput}
                    value={research.visitType}
                    onChange={(e) => setResearch((f) => ({ ...f, visitType: e.target.value }))}
                  >
                    {RESEARCH_VISIT.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={styles.caseField}>
                <span className={styles.caseLabel}>Inclusion / eligibility notes</span>
                <input
                  className={styles.caseInput}
                  value={research.inclusionNotes}
                  onChange={(e) => setResearch((f) => ({ ...f, inclusionNotes: e.target.value }))}
                  placeholder="Criteria notes"
                />
              </label>
              <label className={styles.caseField}>
                <span className={styles.caseLabel}>Research notes</span>
                <textarea
                  className={styles.caseInput}
                  rows={2}
                  value={research.notes}
                  onChange={(e) => setResearch((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Samples, follow-up, etc."
                />
              </label>
            </>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--sg-line)] pt-2">
            <button type="button" className={styles.caseBtnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.caseBtnPrimary}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save case"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
