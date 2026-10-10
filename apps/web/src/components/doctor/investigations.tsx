"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, today } from "@/lib/doctor/util";
import { PatientSearch } from "./patient-search";

/**
 * Top-nav entry for the paper lab reports a patient brings (CBC, sugar, imaging…).
 * Opens the visit Reports tab; in-house clinic lab stays under Lab.
 */
export function InvestigationsScreen() {
  const db = usePowerSync();
  const session = useSession();
  const { current: chamber } = useChambers();
  const doctors = useDoctors();
  const isDoctor = session.tenantRole === "doctor";
  const date = today();
  const [doctorId, setDoctorId] = useState("");
  const effectiveDoctor = isDoctor ? session.userId : doctorId || doctors[0]?.id || "";

  const { data: queue } = useQuery<{
    id: string; serial_no: number; status: string; patient_id: string; name: string; dob: string | null; sex: string | null; mobile: string | null; code: string | null;
  }>(
    `SELECT e.id, e.serial_no, e.status, e.patient_id, p.name, p.dob, p.sex, p.mobile, p.code
       FROM encounter e JOIN patient p ON p.id = e.patient_id
      WHERE e.visit_date = ? AND e.status <> 'cancelled' ${isDoctor ? "AND e.doctor_user_id = ?" : ""}
      ORDER BY CASE e.status WHEN 'in_progress' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, e.serial_no`,
    isDoctor ? [date, session.userId] : [date],
  );

  async function openForPatient(patientId: string) {
    const open = queue.find((q) => q.patient_id === patientId && q.status !== "done");
    if (open) {
      navigate(`/visit/${open.id}/reports`);
      return;
    }
    const done = queue.find((q) => q.patient_id === patientId);
    if (done) {
      navigate(`/visit/${done.id}/reports`);
      return;
    }
    if (!effectiveDoctor) {
      alert("No doctor in this chamber yet.");
      return;
    }
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
    navigate(`/visit/${id}/reports`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Investigations</h1>
          <p className="text-sm text-slate-500">Enter the lab reports the patient brought — CBC, sugar, imaging, and so on.</p>
        </div>
        {!isDoctor && doctors.length > 1 && (
          <select className="input w-auto" value={effectiveDoctor} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
          </select>
        )}
      </div>

      <PatientSearch onPick={(p) => void openForPatient(p.id)} actionLabel="Enter reports" />

      <div className="card overflow-hidden" data-testid="inv-today">
        <div className="border-b border-slate-100 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Today&apos;s visits</div>
        {!queue.length ? (
          <p className="px-2.5 py-3 text-sm text-slate-500">No visits today. Search for a patient above.</p>
        ) : (
          <table className="table">
            <tbody>
              {queue.map((q) => (
                <tr key={q.id}>
                  <td className="tabular-nums">#{q.serial_no}</td>
                  <td>
                    <div className="font-medium">{q.name}</div>
                    <div className="text-xs text-slate-500">{ageLabel(q.dob)} · {q.sex ?? "—"} · {q.mobile}</div>
                  </td>
                  <td className="text-right">
                    <Link to={`/visit/${q.id}/reports`} className="btn-secondary text-xs" data-testid="inv-open-reports">
                      Reports
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
