"use client";

import { useQuery } from "@powersync/react";
import { useState } from "react";
import { Link } from "@/lib/doctor/router";
import { ageLabel } from "@/lib/doctor/util";
import { usePatientSearch, type PatientHit } from "./patient-search";

export function PatientList() {
  const [q, setQ] = useState("");
  const search = usePatientSearch(q, 50);
  const recent = useQuery<PatientHit>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code, (SELECT MAX(visit_date) FROM encounter e WHERE e.patient_id = p.id) AS last_visit
       FROM patient p WHERE p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 50`,
  );
  const rows = q.trim().length >= 2 ? search.data : recent.data;
  const { data: count } = useQuery<{ n: number }>("SELECT count(*) AS n FROM patient WHERE deleted_at IS NULL");
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Patients</h1>
          <p className="text-sm text-slate-500">{count[0]?.n ?? 0} registered — available offline on this device</p>
        </div>
        <Link to="/patients/new" className="btn-primary">+ New patient</Link>
      </div>
      <input className="input" placeholder="Search by mobile, name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>ID</th><th>Name</th><th>Age/Sex</th><th>Mobile</th><th>Last visit</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="text-xs text-slate-500">{p.code ?? "pending"}</td>
                <td><Link to={`/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link></td>
                <td>{ageLabel(p.dob)} {p.sex?.[0]?.toUpperCase()}</td>
                <td>{p.mobile}</td>
                <td>{p.last_visit ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
