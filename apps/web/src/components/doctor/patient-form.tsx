"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { ArrowLeft, CalendarPlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { checkInAppointment, createPatient, startVisit, updatePatient, type PatientInput, type PregnancyStatus } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageParts, dobFromAge, normaliseMobile, parseJson } from "@/lib/doctor/util";
import { SaveButton } from "@/components/save-button";

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
  referredBy: string;
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
  pregnancyStatus: "", guardianName: "", referredBy: "", nid: "", brn: "", healthId: "", notes: "", consent: false, birthWeightKg: "", gestationalAgeWeeks: "",
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
  const { data: referrers } = useQuery<{ r: string }>(
    `SELECT referred_by AS r FROM patient WHERE referred_by IS NOT NULL
     UNION SELECT json_extract(doc, '$.referredBy') FROM prescription WHERE json_extract(doc, '$.referredBy') IS NOT NULL
     ORDER BY r LIMIT 200`,
  );

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
      referredBy: String(existing.referred_by ?? ""),
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
  const sexBtn = (active: boolean) =>
    `flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
      active ? "border-brand-600 bg-brand-50 text-brand-800 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
    }`;
  const years = Number(f.ageYears || 0);
  const sexOptions = f.sex === "other" ? (["male", "female", "other"] as const) : (["male", "female"] as const);
  const fieldRow = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
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
      referredBy: f.referredBy,
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

  const fieldsModal = (
    <div className="grid gap-2 md:grid-cols-6">
      <div className="md:col-span-4"><label className="label">Name *</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus data-testid="patient-name" /></div>
      <div className="md:col-span-2">
        <label className="label">Sex</label>
        <div className="flex gap-1">
          {sexOptions.map((x) => (
            <button type="button" key={x} onClick={() => set("sex", x)} className={sexBtn(f.sex === x)}>{x[0]!.toUpperCase() + x.slice(1)}</button>
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
          <label className="label" htmlFor="preg-modal">Pregnancy / lactation</label>
          <select id="preg-modal" className="input" value={f.pregnancyStatus} onChange={(e) => set("pregnancyStatus", e.target.value as FormState["pregnancyStatus"])} data-testid="patient-pregnancy">
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
          <div><label className="label" htmlFor="birth-wt-m">Birth weight (kg)</label><input id="birth-wt-m" className="input" inputMode="decimal" value={f.birthWeightKg} onChange={(e) => set("birthWeightKg", e.target.value.replace(/[^\d.]/g, ""))} data-testid="patient-birth-weight" /></div>
          <div><label className="label" htmlFor="ga-m">Gestational age at birth (weeks)</label><input id="ga-m" className="input" inputMode="numeric" value={f.gestationalAgeWeeks} onChange={(e) => set("gestationalAgeWeeks", e.target.value.replace(/\D/g, ""))} data-testid="patient-ga" /></div>
        </>
      )}
      <div className="md:col-span-3"><label className="label" htmlFor="guardian-m">Guardian name</label><input id="guardian-m" className="input" value={f.guardianName} onChange={(e) => set("guardianName", e.target.value)} /></div>
      <div className="md:col-span-3">
        <label className="label" htmlFor="ref-by-m">Ref By — Referring doctor</label>
        <input id="ref-by-m" className="input" list="patient-referrers" value={f.referredBy} onChange={(e) => set("referredBy", e.target.value)} placeholder="Referring doctor's name (blank: self)" data-testid="patient-ref-by" />
        <datalist id="patient-referrers">{referrers.map((r) => <option key={r.r} value={r.r} />)}</datalist>
      </div>
      <details className="md:col-span-6">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">National IDs & notes (optional)</summary>
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

  const identityRow =
    "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-12 lg:items-end lg:gap-3";

  const fieldsPage = (
    <div className="space-y-4">
      <div className={identityRow}>
        <div className="col-span-2 sm:col-span-2 lg:col-span-3 lg:max-w-sm">
          <label className="label">Name *</label>
          <input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus data-testid="patient-name" />
        </div>
        <div className="lg:col-span-2 lg:max-w-[8.5rem]">
          <label className="label">Sex</label>
          <select className="input" value={f.sex} onChange={(e) => set("sex", e.target.value as FormState["sex"])}>
            <option value="">Select</option>
            {sexOptions.map((x) => (
              <option key={x} value={x}>{x[0]!.toUpperCase() + x.slice(1)}</option>
            ))}
          </select>
        </div>
        {f.useDob ? (
          <div className="col-span-2 sm:col-span-1 lg:col-span-3">
            <label className="label">Date of birth</label>
            <input type="date" className="input" value={f.dob} onChange={(e) => set("dob", e.target.value)} />
          </div>
        ) : (
          <>
            <div className="lg:col-span-1 lg:max-w-[5.25rem]">
              <label className="label">Age (years)</label>
              <input className="input w-full min-w-0" inputMode="numeric" value={f.ageYears} onChange={(e) => set("ageYears", e.target.value.replace(/\D/g, ""))} data-testid="patient-age" />
            </div>
            <div className="lg:col-span-1 lg:max-w-[4.5rem]">
              <label className="label">Months</label>
              <input className="input w-full min-w-0" inputMode="numeric" value={f.ageMonths} onChange={(e) => set("ageMonths", e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="lg:col-span-1 lg:max-w-[4rem]">
              <label className="label">Days</label>
              <input className="input w-full min-w-0" inputMode="numeric" value={f.ageDays} onChange={(e) => set("ageDays", e.target.value.replace(/\D/g, ""))} />
            </div>
          </>
        )}
        <div className={`col-span-2 flex items-end pb-2 sm:col-span-3 lg:min-w-0 lg:pb-0 ${f.useDob ? "lg:col-span-4" : "lg:col-span-3"}`}>
          <label className="flex items-center gap-2 text-xs text-slate-700 sm:text-sm" title="Enter exact date of birth">
            <input type="checkbox" checked={f.useDob} onChange={(e) => set("useDob", e.target.checked)} />
            <span className="min-w-0 sm:whitespace-nowrap">Exact date of birth</span>
          </label>
        </div>
      </div>

      <div className={fieldRow}>
        <div>
          <label className="label">Mobile</label>
          <input className="input" inputMode="tel" value={f.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="01XXXXXXXXX" data-testid="patient-mobile" />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="guardian">Guardian name</label>
          <input id="guardian" className="input" value={f.guardianName} onChange={(e) => set("guardianName", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <label className="label">Drug allergies (comma separated)</label>
          <input className="input" value={f.allergies} onChange={(e) => set("allergies", e.target.value)} data-testid="patient-allergies" />
        </div>
        <div>
          <label className="label" htmlFor="ref-by">Ref By — Referring doctor</label>
          <input id="ref-by" className="input" list="patient-referrers-page" value={f.referredBy} onChange={(e) => set("referredBy", e.target.value)} placeholder="Blank: self" data-testid="patient-ref-by" />
          <datalist id="patient-referrers-page">{referrers.map((r) => <option key={r.r} value={r.r} />)}</datalist>
        </div>
      </div>

      {(f.sex === "female" || f.sex === "") && (
        <div className={fieldRow}>
          <div className="lg:max-w-xs">
            <label className="label" htmlFor="preg">Pregnancy / lactation</label>
            <select id="preg" className="input" value={f.pregnancyStatus} onChange={(e) => set("pregnancyStatus", e.target.value as FormState["pregnancyStatus"])} data-testid="patient-pregnancy">
              <option value="">Not recorded</option>
              <option value="none">Not pregnant / not lactating</option>
              <option value="pregnant">Pregnant</option>
              <option value="lactating">Lactating</option>
              <option value="both">Pregnant and lactating</option>
            </select>
          </div>
        </div>
      )}

      {infant && (
        <div className={fieldRow}>
          <div>
            <label className="label" htmlFor="birth-wt">Birth weight (kg)</label>
            <input id="birth-wt" className="input" inputMode="decimal" value={f.birthWeightKg} onChange={(e) => set("birthWeightKg", e.target.value.replace(/[^\d.]/g, ""))} data-testid="patient-birth-weight" />
          </div>
          <div>
            <label className="label" htmlFor="ga">Gestational age at birth (weeks)</label>
            <input id="ga" className="input" inputMode="numeric" value={f.gestationalAgeWeeks} onChange={(e) => set("gestationalAgeWeeks", e.target.value.replace(/\D/g, ""))} data-testid="patient-ga" />
          </div>
        </div>
      )}

      <details className="rounded-lg border border-slate-200 bg-slate-50/40 px-2.5 py-1.5">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">National IDs & notes (optional)</summary>
        <div className={`mt-2 ${fieldRow}`}>
          <div><label className="label">NID</label><input className="input" value={f.nid} onChange={(e) => set("nid", e.target.value)} /></div>
          <div><label className="label">Birth reg. no. (BRN)</label><input className="input" value={f.brn} onChange={(e) => set("brn", e.target.value)} /></div>
          <div><label className="label">Health ID</label><input className="input" value={f.healthId} onChange={(e) => set("healthId", e.target.value)} /></div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="label">Notes (past history etc.)</label>
            <textarea className="input" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
      </details>

      <label className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50/40 p-2.5 text-sm">
        <input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} data-testid="patient-consent" />
        <span>The patient or their guardian consents to storing their health information for treatment (রোগীর তথ্য সংরক্ষণে সম্মতি দিয়েছেন).</span>
      </label>
    </div>
  );

  const fields = modal ? fieldsModal : fieldsPage;

  const primaryLabel = session.tenantRole === "doctor" ? "Save & start visit" : "Save & add to queue";

  const pageChrome = !modal;
  const actions = (
    <div className={`flex flex-wrap gap-2 ${modal || pageChrome ? "justify-end" : ""}`}>
      <button
        type="button"
        className={modal || pageChrome ? "btn-ghost order-last sm:order-first" : "btn-ghost"}
        onClick={() => (onClose ? onClose() : history.back())}
      >
        Cancel
      </button>
      {!patientId && (
        <SaveButton
          className={
            modal || pageChrome ? "btn-primary rounded-lg px-3 shadow-sm shadow-brand-600/15" : "btn-primary"
          }
          saving={saving}
          data-testid="patient-save-visit"
        >
          {primaryLabel}
        </SaveButton>
      )}
      <SaveButton
        type="button"
        className={
          patientId ? "btn-primary" : modal || pageChrome ? "btn-secondary rounded-lg" : "btn-secondary"
        }
        saving={saving}
        onClick={(e) => save(e, false)}
      >
        Save
      </SaveButton>
    </div>
  );

  if (modal) {
    return (
      <form onSubmit={(e) => save(e, true)} className="flex flex-col gap-3" data-testid="patient-form-modal">
        <div className="space-y-3 [&_.input]:h-8 [&_.input]:rounded-lg [&_.label]:mb-0.5 [&_.label]:text-[11px]">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5 ring-1 ring-slate-900/5">
            <p className="mb-2 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Patient details</p>
            {fields}
          </div>
        </div>
        {error && <p className="alert-danger">{error}</p>}
        <div className="sticky bottom-0 -mx-0.5 border-t border-slate-100 bg-white/95 pt-2.5 backdrop-blur-sm">{actions}</div>
      </form>
    );
  }

  const thenLab = qs.get("then") === "lab";

  return (
    <form onSubmit={(e) => save(e, true)} className="w-full space-y-3" data-testid="patient-form-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={thenLab ? "/lab" : "/patients"}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {thenLab ? "Back to lab" : "Back to patients"}
        </Link>
        {apptId && !patientId && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 ring-1 ring-blue-200/80">
            From booking
          </span>
        )}
        {patientId && <span className="text-sm font-semibold text-slate-700">Edit patient</span>}
      </div>

      <section className="[&_.input]:h-9 [&_.input]:rounded-lg [&_.input]:border-slate-200/80 [&_.input]:shadow-sm [&_.label]:mb-0.5 [&_.label]:text-[11px] rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 sm:p-4">
        {fields}
      </section>

      {error && <p className="alert-danger">{error}</p>}

      <div className="sticky bottom-0 z-10 rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
        {actions}
      </div>
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-2 backdrop-blur-[2px] sm:p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-patient-title"
      data-testid="new-patient-modal"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50/90 via-white to-white px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/25" aria-hidden>
            <CalendarPlus className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="new-patient-title" className="text-base font-bold tracking-tight text-slate-900">
              New appointment
            </h2>
            <p className="text-[11px] leading-snug text-slate-500">Register the patient, then start the visit or add to today&apos;s queue</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200/80 bg-white p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 sm:px-4 sm:py-3">
          <PatientEdit onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
