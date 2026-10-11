"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { bookAppointment, checkInAppointment, setAppointmentStatus, startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { navigate } from "@/lib/doctor/router";
import { ageLabel, normaliseMobile, today } from "@/lib/doctor/util";

export interface ApptRow {
  id: string;
  name: string;
  mobile: string | null;
  serial_no: number;
  status: string;
  patient_id: string | null;
  doctor_user_id: string;
  note: string | null;
  doctor: string | null;
}

export function useAppointments(date: string) {
  return useQuery<ApptRow>(
    `SELECT a.id, a.name, a.mobile, a.serial_no, a.status, a.patient_id, a.doctor_user_id, a.note, d.name_en AS doctor
       FROM appointment a LEFT JOIN doctor_profile d ON d.id = a.doctor_user_id
      WHERE a.appt_date = ? ORDER BY a.serial_no`,
    [date],
  );
}

/** Check in: reuse the linked patient, or the single patient with that mobile+name, else register. */
export function useCheckIn() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  return async (a: ApptRow) => {
    let patientId = a.patient_id;
    if (!patientId && a.mobile) {
      const matches = await db.getAll<{ id: string }>(`SELECT id FROM patient WHERE mobile = ? AND lower(name) = lower(?) AND deleted_at IS NULL`, [a.mobile, a.name]);
      if (matches.length === 1) patientId = matches[0]!.id;
    }
    if (!patientId) {
      navigate(`/patients/new?appt=${a.id}&name=${encodeURIComponent(a.name)}&mobile=${encodeURIComponent(a.mobile ?? "")}`);
      return;
    }
    const enc = await checkInAppointment(db, a.id, patientId, {
      userId: session.userId,
      asDoctor: session.tenantRole === "doctor",
      specialtyCode: doctors.find((d) => d.id === a.doctor_user_id)?.specialty_code ?? "general",
    });
    navigate(`/visit/${enc}`);
  };
}

const STATUS: Record<string, string> = { booked: "bg-blue-50 text-blue-700", checked_in: "bg-green-50 text-green-700", cancelled: "bg-slate-100 text-slate-500", no_show: "bg-amber-50 text-amber-800" };

export function BookingsScreen() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const [date, setDate] = useState(today());
  const [form, setForm] = useState({ name: "", mobile: "", note: "", doctorId: "" });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string>();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const { data } = useAppointments(date);
  const checkIn = useCheckIn();
  const isDoctor = session.tenantRole === "doctor";
  const doctorId = isDoctor ? session.userId : form.doctorId || doctors[0]?.id || "";
  const term = q.trim();
  const mobileQ = normaliseMobile(term);
  const isMobile = /^\d{4,}$/.test(mobileQ);
  const searching = term.length >= 1;
  const patientParams: (string | number)[] = [date];
  const patientSearch = !searching ? "" : isMobile ? "AND p.mobile LIKE ?" : "AND (p.name LIKE ? OR p.code LIKE ?)";
  if (searching) patientParams.push(isMobile ? `%${mobileQ}%` : `%${term}%`);
  if (searching && !isMobile) patientParams.push(`%${term}%`);
  patientParams.push(50);
  const { data: patients } = useQuery<{
    id: string; name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null; serial_no: number | null; appt_status: string | null;
  }>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code, a.serial_no, a.status AS appt_status
       FROM patient p
       LEFT JOIN appointment a ON a.patient_id = p.id AND a.appt_date = ? AND a.status <> 'cancelled'
      WHERE p.deleted_at IS NULL ${patientSearch}
      ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END, a.serial_no, p.name
      LIMIT ?`,
    patientParams,
  );

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !doctorId) return;
    const mobile = normaliseMobile(form.mobile);
    const serial = await bookAppointment(db, { tenantId: session.tenantId, userId: session.userId, doctorUserId: doctorId, chamberId: chamber?.id ?? null, name: form.name, mobile, date, note: form.note });
    setMsg(`Booked serial #${serial} for ${form.name} on ${date}`);
    setForm({ ...form, name: "", mobile: "", note: "" });
  }

  async function bookPatient(p: { id: string; name: string; mobile: string | null }) {
    if (!doctorId || bookingId) return;
    setBookingId(p.id);
    setMsg(undefined);
    try {
      const serial = await bookAppointment(db, {
        tenantId: session.tenantId, userId: session.userId, doctorUserId: doctorId, chamberId: chamber?.id ?? null,
        name: p.name, mobile: normaliseMobile(p.mobile ?? ""), date, note: "", patientId: p.id,
      });
      setMsg(`Booked serial #${serial} for ${p.name} on ${date}`);
    } finally {
      setBookingId(null);
    }
  }

  async function openRx(patientId: string) {
    if (!doctorId) return alert("No doctor in this chamber yet.");
    const id = await startVisit(db, {
      tenantId: session.tenantId,
      userId: session.userId,
      patientId,
      doctorUserId: doctorId,
      chamberId: chamber?.id ?? null,
      specialtyCode: doctors.find((d) => d.id === doctorId)?.specialty_code ?? "general",
      asDoctor: isDoctor,
    });
    navigate(`/visit/${id}`);
  }

  const active = data.filter((a) => a.status !== "cancelled");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Serial booking</h1>
          <p className="text-sm text-slate-500">{active.length} booked · {data.filter((a) => a.status === "checked_in").length} arrived</p>
        </div>
        <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </div>
      <form onSubmit={book} className="card flex flex-wrap items-end gap-1.5 p-2">
        <div className="min-w-48 flex-1"><label className="label">Patient name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="book-name" /></div>
        <div><label className="label">Mobile</label><input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="01XXXXXXXXX" data-testid="book-mobile" /></div>
        {!isDoctor && doctors.length > 1 && (
          <div><label className="label">Doctor</label><select className="input" value={doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}</select></div>
        )}
        <div className="min-w-40 flex-1"><label className="label">Note</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="New / follow-up / report" /></div>
        <button className="btn-primary" data-testid="book-submit">Book serial</button>
      </form>
      {msg && <p className="text-sm text-green-700" data-testid="book-msg">{msg}</p>}

      <div className="card overflow-x-auto" data-testid="booking-patients">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
          <h2 className="text-sm font-semibold text-slate-700">Patients</h2>
          <input className="input h-7 w-56 text-xs" placeholder="Search name, mobile or ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients to book" data-testid="booking-patient-search" />
        </div>
        <table className="table">
          <thead><tr><th>Name</th><th>Age/Sex</th><th>Mobile</th><th>ID</th><th></th></tr></thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.name}</td>
                <td>{ageLabel(p.dob)} {p.sex?.[0]?.toUpperCase()}</td>
                <td>{p.mobile}</td>
                <td className="text-slate-500">{p.code}</td>
                <td className="whitespace-nowrap text-right">
                  <button type="button" className="btn-primary text-xs" onClick={() => openRx(p.id)} data-testid="booking-open-rx">
                    {isDoctor ? "Open Rx" : "Queue"}
                  </button>
                  {p.appt_status ? (
                    <span className="ml-2 text-xs text-slate-500">Serial #{p.serial_no}</span>
                  ) : (
                    <button type="button" className="btn-secondary ml-1.5 text-xs" disabled={bookingId === p.id} onClick={() => bookPatient(p)} data-testid="book-patient">
                      Book
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!patients.length && <tr><td colSpan={5} className="text-slate-500">No patients match.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-700">Booked serials · {date}</div>
        <table className="table">
          <thead><tr><th>#</th><th>Name</th><th>Mobile</th><th>Note</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} className={a.status === "cancelled" ? "opacity-50" : ""}>
                <td className="tabular-nums">{a.serial_no}</td>
                <td>{a.name}</td>
                <td>{a.mobile}</td>
                <td className="text-slate-500">{a.note}</td>
                <td><span className={`badge ${STATUS[a.status] ?? ""}`}>{a.status.replace("_", " ")}</span></td>
                <td className="whitespace-nowrap">
                  {a.status === "booked" && date === today() && <button className="btn-secondary text-xs" onClick={() => checkIn(a)}>Check in</button>}
                  {a.status === "booked" && <button className="btn-ghost text-xs" onClick={() => setAppointmentStatus(db, a.id, "cancelled")}>Cancel</button>}
                  {a.status === "booked" && date < today() && <button className="btn-ghost text-xs" onClick={() => setAppointmentStatus(db, a.id, "no_show")}>No-show</button>}
                </td>
              </tr>
            ))}
            {!data.length && <tr><td colSpan={6} className="text-slate-500">No bookings for this date.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
