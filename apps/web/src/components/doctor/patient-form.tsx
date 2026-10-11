"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useState } from "react";
import { checkInAppointment, createPatient, startVisit, updatePatient, type PatientInput, type PregnancyStatus } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { navigate } from "@/lib/doctor/router";
import { ageParts, dobFromAge, normaliseMobile, parseJson } from "@/lib/doctor/util";

interface FormState {
  name: string;
  ageYears: string;
  ageMonths: string;
  ageDays: string;
  dob: string;
  useDob: boolean;
  sex: "" | "male" | "female" | "other";
  mobile: string;
  address: string;
  allergies: string;
  pregnancyStatus: "" | PregnancyStatus;
  guardianName: string;
  nid: string;
  brn: string;
  healthId: string;
  notes: string;
  consent: boolean;
  birthWeightKg: string;
  gestationalAgeWeeks: string;
}

const EMPTY: FormState = {
  name: "", ageYears: "", ageMonths: "", ageDays: "", dob: "", useDob: false, sex: "", mobile: "", address: "", allergies: "",
  pregnancyStatus: "", guardianName: "", nid: "", brn: "", healthId: "", notes: "", consent: false, birthWeightKg: "", gestationalAgeWeeks: "",
};

export function PatientEdit({
  patientId,
  onClose,
}: {
  patientId?: string;
  /** When set, form runs as an embedded modal body (Cancel closes instead of history.back). */
  onClose?: () => void;
}) {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const modal = !!onClose;
  // Arriving from a booking: #/patients/new?appt=<id>&name=..&mobile=..
  const qs = typeof window !== "undefined" ? new URLSearchParams(window.location.hash.split("?")[1] ?? "") : new URLSearchParams();
  const apptId = patientId || modal ? null : qs.get("appt");
  const [f, setF] = useState<FormState>(() =>
    modal ? { ...EMPTY } : { ...EMPTY, name: qs.get("name") ?? "", mobile: qs.get("mobile") ?? "" },
  );
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const { data } = useQuery<Record<string, string | number | null>>("SELECT * FROM patient WHERE id = ?", [patientId ?? "__new__"]);
  const existing = data[0];

  useEffect(() => {
    if (!existing) return;
    const a = ageParts(existing.dob as string | null);
    setF({
      name: String(existing.name ?? ""),
      ageYears: a ? String(a.years) : "",
      ageMonths: a && a.years < 5 ? String(a.months) : "",
      ageDays: "",
      dob: String(existing.dob ?? ""),
      useDob: !existing.dob_estimated && !!existing.dob,
      sex: (existing.sex as FormState["sex"]) ?? "",
      mobile: String(existing.mobile ?? ""),
      address: String(existing.address ?? ""),
      allergies: parseJson<string[]>(existing.allergies as string, []).join(", "),
      pregnancyStatus: (existing.pregnancy_status as FormState["pregnancyStatus"]) ?? "",
      guardianName: String(existing.guardian_name ?? ""),
      nid: String(existing.nid ?? ""),
      brn: String(existing.brn ?? ""),
      healthId: String(existing.health_id ?? ""),
      notes: String(existing.notes ?? ""),
      consent: !!existing.consent_at,
      birthWeightKg: existing.birth_weight_kg == null ? "" : String(existing.birth_weight_kg),
      gestationalAgeWeeks: existing.gestational_age_weeks == null ? "" : String(existing.gestational_age_weeks),
    });
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const years = Number(f.ageYears || 0);
  // Birth details matter for infants; the fields show for patients under 2. Any age can be saved.
  const infant = f.useDob ? (ageParts(f.dob)?.years ?? 99) < 2 : f.ageYears === "" ? f.ageMonths !== "" || f.ageDays !== "" : years < 2;
  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

  async function save(e: React.FormEvent, thenVisit: boolean) {
    e.preventDefault();
    setError(undefined);
    if (!f.name.trim()) return setError("Name is required");
    if (!f.consent) return setError("Record the patient's (or guardian's) consent to store their health data");
    const mobile = normaliseMobile(f.mobile);
    if (mobile && !/^01\d{9}$/.test(mobile)) return setError("Mobile should look like 01XXXXXXXXX");
    const input: PatientInput = {
      name: f.name,
      dob: f.useDob ? f.dob || null : f.ageYears || f.ageMonths || f.ageDays ? dobFromAge(years, Number(f.ageMonths || 0), Number(f.ageDays || 0)) : null,
      dobEstimated: !f.useDob,
      sex: f.sex || null,
      mobile,
      address: f.address,
      allergies: f.allergies.split(",").map((x) => x.trim()).filter(Boolean),
      pregnancyStatus: f.sex === "female" || f.sex === "" ? (f.pregnancyStatus || null) : null,
      guardianName: f.guardianName,
      nid: f.nid,
      brn: f.brn,
      healthId: f.healthId,
      notes: f.notes,
      consent: f.consent,
      birthWeightKg: infant ? num(f.birthWeightKg) : null,
      gestationalAgeWeeks: infant && num(f.gestationalAgeWeeks) !== null ? Math.round(num(f.gestationalAgeWeeks)!) : null,
    };
    setSaving(true);
    try {
      if (patientId) {
        await updatePatient(db, patientId, input);
        onClose?.();
        navigate(`/patients/${patientId}`);
        return;
      }
      const id = await createPatient(db, session.userId, session.tenantId, input);
      if (apptId) {
        const enc = await checkInAppointment(db, apptId, id, {
          userId: session.userId,
          asDoctor: session.tenantRole === "doctor",
          specialtyCode: doctors.find((d) => d.id === session.userId)?.specialty_code ?? doctors[0]?.specialty_code ?? "general",
        });
        onClose?.();
        navigate(`/visit/${enc}`);
        return;
      }
      if (thenVisit) {
        const isDoctor = session.tenantRole === "doctor";
        const doctorId = isDoctor ? session.userId : doctors[0]?.id;
        if (doctorId) {
          const enc = await startVisit(db, {
            tenantId: session.tenantId, userId: session.userId, patientId: id, doctorUserId: doctorId, chamberId: chamber?.id ?? null,
            specialtyCode: doctors.find((d) => d.id === doctorId)?.specialty_code ?? "general", asDoctor: isDoctor,
          });
          onClose?.();
          navigate(`/visit/${enc}`);
          return;
        }
      }
      onClose?.();
      // Registered from the Lab screen: back there with this patient.
      // Plain save stays on the list (Current date), not the empty profile.
      navigate(qs.get("then") === "lab" ? `/lab/new?patient=${id}` : "/patients");
    } finally {
      setSaving(false);
    }
  }

  const fields = (
    <div className="grid gap-2 md:grid-cols-6">
      <div className="md:col-span-4"><label className="label">Name *</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus data-testid="patient-name" /></div>
      <div className="md:col-span-2">
        <label className="label">Sex</label>
        <div className="flex gap-1">
          {(["male", "female", "other"] as const).map((x) => (
            <button type="button" key={x} onClick={() => set("sex", x)} className={`btn flex-1 border ${f.sex === x ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white"}`}>{x[0]!.toUpperCase() + x.slice(1)}</button>
          ))}
        </div>
      </div>
      {f.useDob ? (
        <div className="md:col-span-3"><label className="label">Date of birth</label><input type="date" className="input" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></div>
      ) : (
        <>
          <div><label className="label">Age (years)</label><input className="input" inputMode="numeric" value={f.ageYears} onChange={(e) => set("ageYears", e.target.value.replace(/\D/g, ""))} data-testid="patient-age" /></div>
          <div><label className="label">Months</label><input className="input" inputMode="numeric" value={f.ageMonths} onChange={(e) => set("ageMonths", e.target.value.replace(/\D/g, ""))} /></div>
          <div><label className="label">Days</label><input className="input" inputMode="numeric" value={f.ageDays} onChange={(e) => set("ageDays", e.target.value.replace(/\D/g, ""))} /></div>
        </>
      )}
      <div className="flex items-end md:col-span-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.useDob} onChange={(e) => set("useDob", e.target.checked)} /> Enter exact date of birth</label>
      </div>
      <div className="md:col-span-3"><label className="label">Mobile</label><input className="input" inputMode="tel" value={f.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="01XXXXXXXXX" data-testid="patient-mobile" /></div>
      <div className="md:col-span-3"><label className="label">Address</label><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
      <div className="md:col-span-6"><label className="label">Drug allergies (comma separated generics, e.g. Penicillin, Sulfonamide)</label><input className="input" value={f.allergies} onChange={(e) => set("allergies", e.target.value)} data-testid="patient-allergies" /></div>
      {(f.sex === "female" || f.sex === "") && (
        <div className="md:col-span-3">
          <label className="label" htmlFor="preg">Pregnancy / lactation</label>
          <select id="preg" className="input" value={f.pregnancyStatus} onChange={(e) => set("pregnancyStatus", e.target.value as FormState["pregnancyStatus"])} data-testid="patient-pregnancy">
            <option value="">Not recorded</option>
            <option value="none">Not pregnant / not lactating</option>
            <option value="pregnant">Pregnant</option>
            <option value="lactating">Lactating</option>
            <option value="both">Pregnant and lactating</option>
          </select>
        </div>
      )}
      {infant && (
        <>
          <div><label className="label" htmlFor="birth-wt">Birth weight (kg)</label><input id="birth-wt" className="input" inputMode="decimal" value={f.birthWeightKg} onChange={(e) => set("birthWeightKg", e.target.value.replace(/[^\d.]/g, ""))} data-testid="patient-birth-weight" /></div>
          <div><label className="label" htmlFor="ga">Gestational age at birth (weeks)</label><input id="ga" className="input" inputMode="numeric" value={f.gestationalAgeWeeks} onChange={(e) => set("gestationalAgeWeeks", e.target.value.replace(/\D/g, ""))} data-testid="patient-ga" /></div>
        </>
      )}
      <div className="md:col-span-3"><label className="label" htmlFor="guardian">Guardian name</label><input id="guardian" className="input" value={f.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></div>
      <details className="md:col-span-6">
        <summary className="cursor-pointer text-sm text-slate-600">National IDs & notes (optional)</summary>
        <div className="mt-1.5 grid gap-2 md:grid-cols-3">
          <div><label className="label">NID</label><input className="input" value={f.nid} onChange={(e) => set("nid", e.target.value)} /></div>
          <div><label className="label">Birth reg. no. (BRN)</label><input className="input" value={f.brn} onChange={(e) => set("brn", e.target.value)} /></div>
          <div><label className="label">Health ID</label><input className="input" value={f.healthId} onChange={(e) => set("healthId", e.target.value)} /></div>
          <div className="md:col-span-3"><label className="label">Notes (past history etc.)</label><textarea className="input" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
      </details>
      <label className="flex items-start gap-2 text-sm md:col-span-6">
        <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} data-testid="patient-consent" />
        <span>The patient or their guardian consents to storing their health information for treatment (রোগীর তথ্য সংরক্ষণে সম্মতি দিয়েছেন).</span>
      </label>
    </div>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      {!patientId && (
        <button className="btn-primary" disabled={saving} data-testid="patient-save-visit">
          {session.tenantRole === "doctor" ? "Save & start visit" : "Save & add to queue"}
        </button>
      )}
      <button type="button" className={patientId ? "btn-primary" : "btn-secondary"} disabled={saving} onClick={(e) => save(e, false)}>
        Save
      </button>
      <button type="button" className="btn-ghost" onClick={() => (onClose ? onClose() : history.back())}>
        Cancel
      </button>
    </div>
  );

  if (modal) {
    return (
      <form onSubmit={(e) => save(e, true)} className="space-y-2" data-testid="patient-form-modal">
        {fields}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {actions}
      </form>
    );
  }

  return (
    <form onSubmit={(e) => save(e, true)} className="mx-auto max-w-3xl space-y-2">
      <h1 className="text-lg font-semibold">{patientId ? "Edit patient" : "New patient"}</h1>
      <div className="card p-2.5">{fields}</div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {actions}
    </form>
  );
}

/** Modal dialog for registering a new patient (same fields as the New patient page). */
export function NewPatientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 sm:p-6 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-patient-title"
      data-testid="new-patient-modal"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h2 id="new-patient-title" className="text-base font-semibold text-slate-900">
            New patient
          </h2>
          <button type="button" className="btn-ghost px-2 text-lg leading-none text-slate-500" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="max-h-[min(80vh,40rem)] overflow-y-auto p-3">
          <PatientEdit onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
