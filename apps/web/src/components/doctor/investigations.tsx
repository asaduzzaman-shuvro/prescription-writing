"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, today } from "@/lib/doctor/util";
import { PatientSearch } from "./patient-search";

const ENC_STATUS: Record<string, string> = {
  waiting: "bg-amber-50 text-amber-900 ring-amber-100",
  in_progress: "bg-blue-50 text-blue-800 ring-blue-100",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-100",
};

function statusLabel(s: string) {
  return s.replaceAll("_", " ");
}

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

  const active = queue.filter((q) => q.status !== "done").length;

  return (
    <div className="space-y-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-slate-900">Investigations</h1>
          <p className="text-xs text-slate-500">
            External lab reports (CBC, sugar, imaging…) · <span className="tabular-nums font-medium text-slate-700">{date}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            <span className="tabular-nums font-medium text-slate-700">{queue.length}</span> visits today
            {active > 0 && (
              <>
                {" "}
                · <span className="tabular-nums font-medium text-amber-700">{active}</span> open
              </>
            )}
          </span>
          {!isDoctor && doctors.length > 1 && (
            <select className="input h-8 w-auto text-sm" value={effectiveDoctor} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name_en}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-1.5 text-[11px] font-semibold text-slate-500">Find patient</h2>
        <PatientSearch onPick={(p) => void openForPatient(p.id)} actionLabel="Enter reports" />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="inv-today">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
          <h2 className="text-xs font-semibold text-slate-900">Today&apos;s visits</h2>
          <span className="text-[11px] tabular-nums text-slate-500">{queue.length} rows</span>
        </div>
        {!queue.length ? (
          <p className="px-2.5 py-6 text-center text-sm text-slate-500">No visits today. Search for a patient above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th className="text-right">Reports</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/80">
                    <td className="tabular-nums font-medium text-slate-800">{q.serial_no}</td>
                    <td>
                      <Link to={`/patients/${q.patient_id}`} className="font-medium text-brand-700 hover:underline">
                        {q.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {ageLabel(q.dob)}
                        {q.sex ? ` · ${q.sex[0]!.toUpperCase()}` : ""}
                        {q.mobile ? ` · ${q.mobile}` : ""}
                      </p>
                    </td>
                    <td className="text-xs text-slate-500">{q.code ?? "—"}</td>
                    <td>
                      <span className={`badge ring-1 ${ENC_STATUS[q.status] ?? "bg-slate-50 text-slate-700 ring-slate-200"}`}>
                        {statusLabel(q.status)}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link to={`/visit/${q.id}/reports`} className="btn-primary inline-flex h-7 px-2 text-xs" data-testid="inv-open-reports">
                        Reports
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
