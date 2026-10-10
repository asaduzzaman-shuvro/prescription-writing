"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors, useMyProfile } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, today } from "@/lib/doctor/util";
import { useAppointments, useCheckIn } from "./bookings";
import { PatientSearch } from "./patient-search";

const STATUS: Record<string, string> = {
  waiting: "bg-amber-100 text-warn",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-slate-100 text-slate-500",
};

export function Today() {
  const db = usePowerSync();
  const session = useSession();
  const { current: chamber, chambers, select } = useChambers();
  const doctors = useDoctors();
  const profile = useMyProfile();
  const isDoctor = session.tenantRole === "doctor";
  const [doctorId, setDoctorId] = useState<string>("");
  const date = today();
  const { data: queue } = useQuery<{
    id: string; serial_no: number; status: string; patient_id: string; name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null; doctor: string | null;
  }>(
    `SELECT e.id, e.serial_no, e.status, e.patient_id, p.name, p.dob, p.sex, p.mobile, p.code, d.name_en AS doctor
       FROM encounter e JOIN patient p ON p.id = e.patient_id LEFT JOIN doctor_profile d ON d.id = e.doctor_user_id
      WHERE e.visit_date = ? ${isDoctor ? "AND e.doctor_user_id = ?" : ""}
      ORDER BY CASE e.status WHEN 'in_progress' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, e.serial_no`,
    isDoctor ? [date, session.userId] : [date],
  );
  const { data: appts } = useAppointments(date);
  const booked = appts.filter((a) => a.status === "booked" && (!isDoctor || a.doctor_user_id === session.userId));
  const checkIn = useCheckIn();
  const effectiveDoctor = isDoctor ? session.userId : doctorId || doctors[0]?.id || "";
  const bmdcExpired = profile?.bmdc_expiry && profile.bmdc_expiry < date;
  const waiting = queue.filter((q) => q.status === "waiting").length;
  const active = queue.filter((q) => q.status === "in_progress").length;
  const done = queue.filter((q) => q.status === "done").length;

  async function visit(patientId: string) {
    if (!effectiveDoctor) return alert("No doctor in this chamber yet.");
    const doc = doctors.find((d) => d.id === effectiveDoctor);
    const id = await startVisit(db, {
      tenantId: session.tenantId,
      userId: session.userId,
      patientId,
      doctorUserId: effectiveDoctor,
      chamberId: chamber?.id ?? null,
      specialtyCode: doc?.specialty_code ?? "general",
      asDoctor: isDoctor,
    });
    navigate(`/visit/${id}`);
  }

  const stat = (label: string, value: number, tone: string) => (
    <div className={`card px-2.5 py-2 ${tone}`}>
      <div className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );

  return (
    <div className="space-y-2.5">
      {bmdcExpired && (
        <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm text-alert">
          Your BMDC registration expired on {profile!.bmdc_expiry}. Please renew it and inform the RxPad admin.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {profile?.name_en ?? session.name}
            {profile?.specialty_code ? ` · ${profile.specialty_code.replace(/_/g, " ")}` : ""}
            {chamber ? ` · ${chamber.name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {chambers.length > 1 && (
            <select className="input w-auto" value={chamber?.id ?? ""} onChange={(e) => select(e.target.value)} aria-label="Chamber">
              {chambers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {!isDoctor && doctors.length > 1 && (
            <select className="input w-auto" value={effectiveDoctor} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
            </select>
          )}
          <Link to="/patients/new" className="btn-primary">+ New prescription</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4" data-testid="dashboard-stats">
        {stat("In queue", waiting, "border-l-4 border-l-warn")}
        {stat("In room", active, "border-l-4 border-l-blue-500")}
        {stat("Seen today", done, "border-l-4 border-l-green-500")}
        {stat("Total today", queue.length, "border-l-4 border-l-brand-500")}
      </div>

      <PatientSearch onPick={(p) => visit(p.id)} actionLabel={isDoctor ? "Start visit" : "Add to queue"} />

      {booked.length > 0 && (
        <div className="card p-2">
          <h2 className="mb-1.5 text-sm font-semibold">Booked — not arrived ({booked.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            {booked.map((a) => (
              <button key={a.id} onClick={() => checkIn(a)} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-sm hover:bg-blue-100" data-testid="booked-chip">
                <b className="tabular-nums">#{a.serial_no}</b> {a.name} <span className="text-xs text-blue-700">check in</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-700">Today&apos;s queue · {date}</div>
        <table className="table">
          <thead><tr><th>#</th><th>Patient</th><th>Age/Sex</th><th>Mobile</th>{!isDoctor && <th>Doctor</th>}<th>Status</th><th></th></tr></thead>
          <tbody>
            {queue.map((q) => (
              <tr key={q.id}>
                <td className="tabular-nums">{q.serial_no}</td>
                <td>
                  <Link to={`/patients/${q.patient_id}`} className="font-medium text-brand-700 hover:underline">{q.name}</Link>
                  <div className="text-xs text-slate-400">{q.code}</div>
                </td>
                <td>{ageLabel(q.dob)} {q.sex?.[0]?.toUpperCase()}</td>
                <td>{q.mobile}</td>
                {!isDoctor && <td>{q.doctor}</td>}
                <td><span className={`badge ${STATUS[q.status] ?? ""}`}>{q.status.replace("_", " ")}</span></td>
                <td>
                  <Link to={`/visit/${q.id}`} className="btn-secondary text-xs">
                    {q.status === "done" ? "View" : isDoctor ? "Open Rx" : "Vitals"}
                  </Link>
                </td>
              </tr>
            ))}
            {!queue.length && <tr><td colSpan={7} className="text-slate-500">No patients yet today. Search above or start a new prescription.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
