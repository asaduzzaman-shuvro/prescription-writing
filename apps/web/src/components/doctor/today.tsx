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
  waiting: "bg-amber-50 text-amber-800",
  in_progress: "bg-blue-50 text-blue-700",
  done: "bg-green-50 text-green-700",
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
    navigate(isDoctor ? `/visit/${id}` : `/visit/${id}`);
  }

  return (
    <div className="space-y-4">
      {bmdcExpired && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Your BMDC registration expired on {profile!.bmdc_expiry}. Please renew it and inform the RxPad admin.
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Today · {date}</h1>
          <p className="text-sm text-slate-500">{queue.length} patients · {queue.filter((q) => q.status === "done").length} seen</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Link to="/patients/new" className="btn-primary">+ New patient</Link>
        </div>
      </div>
      <PatientSearch onPick={(p) => visit(p.id)} actionLabel={isDoctor ? "Start visit" : "Add to queue"} />
      {booked.length > 0 && (
        <div className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">Booked serials — not arrived yet ({booked.length})</h2>
          <div className="flex flex-wrap gap-2">
            {booked.map((a) => (
              <button key={a.id} onClick={() => checkIn(a)} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-sm hover:bg-blue-100" data-testid="booked-chip">
                <b className="tabular-nums">#{a.serial_no}</b> {a.name} <span className="text-xs text-blue-700">check in</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>#</th><th>Patient</th><th>Age/Sex</th><th>Mobile</th>{!isDoctor && <th>Doctor</th>}<th>Status</th><th></th></tr></thead>
          <tbody>
            {queue.map((q) => (
              <tr key={q.id}>
                <td className="tabular-nums">{q.serial_no}</td>
                <td><Link to={`/patients/${q.patient_id}`} className="font-medium text-brand-700 hover:underline">{q.name}</Link><div className="text-xs text-slate-400">{q.code}</div></td>
                <td>{ageLabel(q.dob)} {q.sex?.[0]?.toUpperCase()}</td>
                <td>{q.mobile}</td>
                {!isDoctor && <td>{q.doctor}</td>}
                <td><span className={`badge ${STATUS[q.status] ?? ""}`}>{q.status.replace("_", " ")}</span></td>
                <td><Link to={`/visit/${q.id}`} className="btn-secondary text-xs">{q.status === "done" ? "View" : isDoctor ? "Open" : "Vitals"}</Link></td>
              </tr>
            ))}
            {!queue.length && <tr><td colSpan={7} className="text-slate-500">No patients yet today. Search above or add a new patient.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
