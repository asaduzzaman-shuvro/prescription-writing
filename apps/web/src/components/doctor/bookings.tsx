"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { CalendarDays, Search } from "lucide-react";
import { useState } from "react";
import { bookAppointment, checkInAppointment, setAppointmentStatus, startVisit, type VisitType } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { navigate } from "@/lib/doctor/router";
import { ageLabel, normaliseMobile, today } from "@/lib/doctor/util";
import { ListPager } from "@/components/list-pager";
import { SaveButton } from "@/components/save-button";
import { ActiveChamberSelector } from "./active-chamber";
import { SakuraBookingsPanel } from "./sakura-bookings-panel";

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

export function useAppointments(date: string, chamberId: string | null = null) {
  const chamberSql = chamberId ? "AND a.chamber_id = ?" : "";
  const params = chamberId ? [date, chamberId] : [date];
  return useQuery<ApptRow>(
    `SELECT a.id, a.name, a.mobile, a.serial_no, a.status, a.patient_id, a.doctor_user_id, a.note, d.name_en AS doctor
       FROM appointment a LEFT JOIN doctor_profile d ON d.id = a.doctor_user_id
      WHERE a.appt_date = ? ${chamberSql} ORDER BY a.serial_no`,
    params,
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
      visitType: visitTypeFromNote(a.note),
    });
    navigate(`/visit/${enc}`);
  };
}

const STATUS: Record<string, string> = {
  booked: "bg-blue-50 text-blue-800 ring-blue-100",
  checked_in: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
  no_show: "bg-amber-50 text-amber-900 ring-amber-100",
};

function statusLabel(s: string) {
  return s.replaceAll("_", " ");
}

const BOOKING_NOTE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: "new", label: "New" },
  { value: "followup", label: "Follow-up" },
  { value: "report", label: "Report showing" },
];

function visitTypeFromNote(note: string | null): VisitType | undefined {
  if (note === "new" || note === "followup" || note === "report") return note;
  return undefined;
}

function noteLabel(note: string | null) {
  if (!note) return "—";
  return BOOKING_NOTE_OPTIONS.find((o) => o.value === note)?.label ?? note;
}

export function BookingsScreen() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const chamberId = chamber?.id ?? null;
  const sakuraEnabled = session.sakuraWebEnabled;
  const [source, setSource] = useState<"rxpad" | "sakura">("rxpad");
  const [date, setDate] = useState(today());
  const [form, setForm] = useState<{ name: string; mobile: string; note: VisitType; doctorId: string }>({
    name: "",
    mobile: "",
    note: "new",
    doctorId: "",
  });
  const [q, setQ] = useState("");
  const [patientPage, setPatientPage] = useState(0);
  const [msg, setMsg] = useState<string>();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const { data } = useAppointments(date, chamberId);
  const checkIn = useCheckIn();
  const isDoctor = session.tenantRole === "doctor";
  const doctorId = isDoctor ? session.userId : form.doctorId || doctors[0]?.id || "";
  const term = q.trim();
  const mobileQ = normaliseMobile(term);
  const isMobile = /^\d{4,}$/.test(mobileQ);
  const searching = term.length >= 1;
  const patientPageSize = 50;
  const searchParams: string[] = [];
  const patientSearch = !searching ? "" : isMobile ? "AND p.mobile LIKE ?" : "AND (p.name LIKE ? OR p.code LIKE ?)";
  if (searching) {
    searchParams.push(isMobile ? `%${mobileQ}%` : `%${term}%`);
    if (!isMobile) searchParams.push(`%${term}%`);
  }
  const apptJoin =
    chamberId != null
      ? "LEFT JOIN appointment a ON a.patient_id = p.id AND a.appt_date = ? AND a.status <> 'cancelled' AND a.chamber_id = ?"
      : "LEFT JOIN appointment a ON a.patient_id = p.id AND a.appt_date = ? AND a.status <> 'cancelled'";
  const patientQueryParams = chamberId != null ? [date, chamberId, ...searchParams, patientPageSize, patientPage * patientPageSize] : [date, ...searchParams, patientPageSize, patientPage * patientPageSize];
  const { data: patients } = useQuery<{
    id: string; name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null; serial_no: number | null; appt_status: string | null;
  }>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code, a.serial_no, a.status AS appt_status
       FROM patient p
       ${apptJoin}
      WHERE p.deleted_at IS NULL ${patientSearch}
      ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END, a.serial_no, p.name
      LIMIT ? OFFSET ?`,
    patientQueryParams,
  );
  const { data: patientTotals } = useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM patient p WHERE p.deleted_at IS NULL ${patientSearch}`,
    searchParams,
  );

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (booking || !form.name.trim() || !doctorId) return;
    if (!chamberId) return setMsg("Select an active chamber (Settings → Chambers) before booking.");
    const mobile = normaliseMobile(form.mobile);
    const name = form.name;
    setBooking(true);
    try {
      const serial = await bookAppointment(db, { tenantId: session.tenantId, userId: session.userId, doctorUserId: doctorId, chamberId: chamber?.id ?? null, name, mobile, date, note: form.note });
      setMsg(`Booked serial #${serial} for ${name} on ${date}`);
      setForm({ ...form, name: "", mobile: "", note: "new" });
    } finally {
      setBooking(false);
    }
  }

  async function bookPatient(p: { id: string; name: string; mobile: string | null }) {
    if (!doctorId || bookingId) return;
    setBookingId(p.id);
    setMsg(undefined);
    try {
      const serial = await bookAppointment(db, {
        tenantId: session.tenantId, userId: session.userId, doctorUserId: doctorId, chamberId: chamber?.id ?? null,
        name: p.name, mobile: normaliseMobile(p.mobile ?? ""), date, note: form.note, patientId: p.id,
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
  const arrived = data.filter((a) => a.status === "checked_in").length;
  const grid12 = "grid grid-cols-12 gap-2";
  const cell3 = "col-span-12 sm:col-span-6 lg:col-span-3 min-w-0";
  const isToday = date === today();

  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Serial booking</h1>
          <p className="text-xs text-slate-500">
            {source === "sakura" ? (
              <>Sakura Web queue · {date}</>
            ) : (
              <>
                <span className="tabular-nums font-medium text-slate-700">{active.length}</span> booked ·{" "}
                <span className="tabular-nums font-medium text-slate-700">{arrived}</span> arrived
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {sakuraEnabled && (
            <nav className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs" aria-label="Booking source">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 font-medium transition ${source === "rxpad" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                onClick={() => setSource("rxpad")}
              >
                RxPad
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 font-medium transition ${source === "sakura" ? "bg-[#9DBD68]/25 text-[#325A46] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                onClick={() => setSource("sakura")}
                data-testid="bookings-sakura-tab"
              >
                Sakura Web
              </button>
            </nav>
          )}
          {source === "rxpad" && <ActiveChamberSelector />}
          {source === "rxpad" && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              <input type="date" className="input h-8 w-auto text-sm" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            </label>
          )}
        </div>
      </header>

      {source === "sakura" && sakuraEnabled ? (
        <SakuraBookingsPanel date={date} onDateChange={setDate} />
      ) : (
        <>
      <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <h2 className="mb-2 text-[11px] font-semibold text-slate-500">New booking</h2>
        <form onSubmit={book} className={grid12}>
          <div className={cell3}>
            <label className="label">Patient name</label>
            <input className="input h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="book-name" />
          </div>
          <div className={cell3}>
            <label className="label">Mobile</label>
            <input className="input h-8" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="01XXXXXXXXX" data-testid="book-mobile" />
          </div>
          <div className={cell3}>
            <label className="label" htmlFor="book-note">Note</label>
            <select
              id="book-note"
              className="input h-8"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value as VisitType })}
              data-testid="book-note"
            >
              {BOOKING_NOTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {!isDoctor && doctors.length > 1 && (
            <div className={cell3}>
              <label className="label">Doctor</label>
              <select className="input h-8" value={doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name_en}</option>
                ))}
              </select>
            </div>
          )}
          <div className={`${cell3} flex items-end`}>
            <SaveButton className="btn-primary h-8 w-full sm:w-auto" saving={booking} data-testid="book-submit">
              Book serial
            </SaveButton>
          </div>
        </form>
        {msg && (
          <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800" data-testid="book-msg">
            {msg}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold text-slate-900">
            Booked serials <span className="font-normal text-slate-500">· {date}</span>
          </h2>
          <span className="text-[11px] tabular-nums text-slate-500">{data.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Mobile</th>
                <th>Note</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className={a.status === "cancelled" ? "opacity-50" : "hover:bg-slate-50/80"}>
                  <td className="tabular-nums font-medium text-slate-800">{a.serial_no}</td>
                  <td className="font-medium text-slate-900">{a.name}</td>
                  <td className="tabular-nums">{a.mobile || "—"}</td>
                  <td className="text-slate-600">{noteLabel(a.note)}</td>
                  <td>
                    <span className={`badge ring-1 ${STATUS[a.status] ?? "bg-slate-50 text-slate-700 ring-slate-200"}`}>
                      {statusLabel(a.status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {a.status === "booked" && isToday && (
                        <button type="button" className="btn-primary h-7 px-2 text-xs" onClick={() => void checkIn(a)}>
                          Check in
                        </button>
                      )}
                      {a.status === "booked" && (
                        <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => void setAppointmentStatus(db, a.id, "cancelled")}>
                          Cancel
                        </button>
                      )}
                      {a.status === "booked" && date < today() && (
                        <button type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => void setAppointmentStatus(db, a.id, "no_show")}>
                          No-show
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!data.length && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-slate-500">No bookings for this date.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="booking-patients">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xs font-semibold text-slate-900">Book from patient list</h2>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="input h-8 w-full pl-7 text-sm"
              placeholder="Search name, mobile or ID"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPatientPage(0);
              }}
              aria-label="Search patients to book"
              data-testid="booking-patient-search"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Age / sex</th>
                <th>Mobile</th>
                <th>ID</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td className="text-slate-700">
                    {ageLabel(p.dob)}
                    {p.sex ? ` · ${p.sex[0]!.toUpperCase()}` : ""}
                  </td>
                  <td className="tabular-nums">{p.mobile || "—"}</td>
                  <td className="text-xs text-slate-500">{p.code ?? "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button type="button" className="btn-primary h-7 px-2 text-xs" onClick={() => void openRx(p.id)} data-testid="booking-open-rx">
                        {isDoctor ? "Open Rx" : "Queue"}
                      </button>
                      {p.appt_status ? (
                        <span className="text-xs tabular-nums text-slate-500">#{p.serial_no}</span>
                      ) : (
                        <SaveButton
                          type="button"
                          className="btn-secondary h-7 px-2 text-xs"
                          saving={bookingId === p.id}
                          pendingLabel="…"
                          onClick={() => void bookPatient(p)}
                          data-testid="book-patient"
                        >
                          Book
                        </SaveButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!patients.length && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-500">No patients match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListPager page={patientPage} total={Number(patientTotals[0]?.n ?? 0)} size={patientPageSize} onPage={setPatientPage} />
      </section>
        </>
      )}
    </div>
  );
}
