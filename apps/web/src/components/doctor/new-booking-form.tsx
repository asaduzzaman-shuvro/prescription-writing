"use client";

import { usePowerSync } from "@powersync/react";
import { useEffect, useState } from "react";
import { bookAppointment, createPatient, type VisitType } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { normaliseMobile, today } from "@/lib/doctor/util";
import { SaveButton } from "@/components/save-button";

const BOOKING_NOTE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: "new", label: "New" },
  { value: "followup", label: "Follow-up" },
  { value: "report", label: "Report showing" },
];

const grid12 = "grid grid-cols-12 gap-2";
const cell2 = "col-span-12 sm:col-span-6 lg:col-span-2 min-w-0";

export function NewBookingForm({ apptDate }: { apptDate?: string }) {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { chambers, current: chamber, select } = useChambers();
  const date = apptDate ?? today();
  const isDoctor = session.tenantRole === "doctor";
  const [form, setForm] = useState<{ name: string; mobile: string; sex: "" | "male" | "female" | "other"; chamberId: string; note: VisitType; doctorId: string }>({
    name: "",
    mobile: "",
    sex: "",
    chamberId: "",
    note: "new",
    doctorId: "",
  });
  const [msg, setMsg] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (chamber?.id && !form.chamberId) {
      setForm((f) => ({ ...f, chamberId: chamber.id }));
    }
  }, [chamber?.id, form.chamberId]);

  const doctorId = isDoctor ? session.userId : form.doctorId || doctors[0]?.id || "";

  async function resolvePatientId(name: string, mobile: string, sex: "male" | "female" | "other"): Promise<string> {
    const matches = await db.getAll<{ id: string }>(
      `SELECT id FROM patient WHERE mobile = ? AND lower(name) = lower(?) AND deleted_at IS NULL`,
      [mobile, name],
    );
    if (matches.length === 1) return matches[0]!.id;
    return createPatient(db, session.userId, session.tenantId, {
      name,
      dob: null,
      dobEstimated: false,
      sex,
      mobile,
      address: "",
      allergies: [],
      pregnancyStatus: null,
      guardianName: "",
      referredBy: "",
      nid: "",
      brn: "",
      healthId: "",
      notes: "",
      consent: true,
      birthWeightKg: null,
      gestationalAgeWeeks: null,
    });
  }

  async function book(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    setMsg(undefined);
    if (booking || !doctorId) return;
    const name = form.name.trim();
    if (!name) return setFormError("Patient name is required");
    if (!form.mobile.trim()) return setFormError("Mobile is required");
    const mobile = normaliseMobile(form.mobile);
    if (!/^01\d{9}$/.test(mobile)) return setFormError("Mobile should look like 01XXXXXXXXX");
    if (!form.sex) return setFormError("Sex is required");
    if (!form.chamberId) return setFormError("Chamber is required");
    setBooking(true);
    try {
      const patientId = await resolvePatientId(name, mobile, form.sex);
      select(form.chamberId);
      const serial = await bookAppointment(db, {
        tenantId: session.tenantId,
        userId: session.userId,
        doctorUserId: doctorId,
        chamberId: form.chamberId,
        name,
        mobile,
        date,
        note: form.note,
        patientId,
      });
      setMsg(`Booked serial #${serial} for ${name} on ${date}`);
      setForm((f) => ({ ...f, name: "", mobile: "", sex: "", note: "new" }));
    } finally {
      setBooking(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm" data-testid="new-booking">
      <h2 className="mb-2 text-[11px] font-semibold text-slate-500">New booking</h2>
      <form onSubmit={book} className={grid12}>
        <div className={cell2}>
          <label className="label">Patient name *</label>
          <input className="input h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="book-name" />
        </div>
        <div className={cell2}>
          <label className="label">Mobile *</label>
          <input
            className="input h-8"
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            placeholder="01XXXXXXXXX"
            required
            inputMode="tel"
            data-testid="book-mobile"
          />
        </div>
        <div className={cell2}>
          <label className="label" htmlFor="book-sex">Sex *</label>
          <select
            id="book-sex"
            className="input h-8"
            value={form.sex}
            onChange={(e) => setForm({ ...form, sex: e.target.value as "" | "male" | "female" | "other" })}
            required
            data-testid="book-sex"
          >
            <option value="">Select…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className={cell2}>
          <label className="label" htmlFor="book-chamber">Chamber *</label>
          <select
            id="book-chamber"
            className="input h-8"
            value={form.chamberId}
            onChange={(e) => setForm({ ...form, chamberId: e.target.value })}
            required
            data-testid="book-chamber"
          >
            {chambers.length > 1 && !form.chamberId && <option value="">Select chamber…</option>}
            {chambers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.replace(/\s*\n\s*/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className={cell2}>
          <label className="label" htmlFor="book-note">Note</label>
          <select
            id="book-note"
            className="input h-8"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value as VisitType })}
            data-testid="book-note"
          >
            {BOOKING_NOTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {!isDoctor && doctors.length > 1 && (
          <div className={cell2}>
            <label className="label">Doctor</label>
            <select className="input h-8" value={doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name_en}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={`${cell2} flex items-end`}>
          <SaveButton className="btn-primary h-8 w-full sm:w-auto" saving={booking} data-testid="book-submit">
            Book serial
          </SaveButton>
        </div>
      </form>
      {formError && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800" data-testid="book-error">
          {formError}
        </p>
      )}
      {msg && (
        <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800" data-testid="book-msg">
          {msg}
        </p>
      )}
    </section>
  );
}
