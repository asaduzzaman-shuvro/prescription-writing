"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel } from "@/lib/doctor/util";
import { usePatientSearch, type PatientHit } from "./patient-search";

export function PatientList() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const [q, setQ] = useState("");
  const search = usePatientSearch(q, 50);
  const recent = useQuery<PatientHit>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code, (SELECT MAX(visit_date) FROM encounter e WHERE e.patient_id = p.id) AS last_visit
       FROM patient p WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 50`,
  );
  const rows = q.trim().length >= 2 ? search.data : recent.data;
  const { data: count } = useQuery<{ n: number }>("SELECT count(*) AS n FROM patient WHERE deleted_at IS NULL");
  const isDoctor = session.tenantRole === "doctor";

  async function visit(patientId: string) {
    const doctorId = isDoctor ? session.userId : doctors[0]?.id;
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Patients</h1>
          <p className="text-sm text-slate-500">{count[0]?.n ?? 0} registered — available offline on this device</p>
        </div>
        <Link to="/patients/new" className="btn-primary">+ New patient</Link>
      </div>
      <input
        className="input max-w-xl"
        placeholder="Search by mobile, name or ID"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="patient-list-search"
        autoFocus
      />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Age/Sex</th>
              <th>Mobile</th>
              <th>Last visit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/80">
                <td className="text-xs text-slate-500">{p.code ?? "pending"}</td>
                <td>
                  <Link to={`/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                </td>
                <td>{ageLabel(p.dob)} {p.sex?.[0]?.toUpperCase()}</td>
                <td>{p.mobile}</td>
                <td className="tabular-nums text-slate-600">{p.last_visit ?? "—"}</td>
                <td className="text-right">
                  <button type="button" className="btn-secondary text-xs" onClick={() => void visit(p.id)}>
                    {isDoctor ? "Open Rx" : "Queue"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-5 text-center text-slate-500">
                  {q.trim().length >= 2 ? (
                    <>
                      No match.{" "}
                      <Link to="/patients/new" className="text-brand-700 underline">Register new patient</Link>
                    </>
                  ) : (
                    <>
                      No patients yet.{" "}
                      <Link to="/patients/new" className="text-brand-700 underline">Add the first patient</Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
