"use client";

import { useQuery } from "@powersync/react";
import { useState } from "react";
import { Link } from "@/lib/doctor/router";
import { ageLabel, normaliseMobile } from "@/lib/doctor/util";

export interface PatientHit {
  id: string;
  name: string;
  dob: string | null;
  sex: string | null;
  mobile: string | null;
  code: string | null;
  last_visit: string | null;
}

/** Search by mobile (one number often covers a whole family), name or patient code. */
export function usePatientSearch(q: string, limit = 20) {
  const term = q.trim();
  const mobile = normaliseMobile(term);
  const isMobile = /^\d{4,}$/.test(mobile);
  return useQuery<PatientHit>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code,
            (SELECT MAX(visit_date) FROM encounter e WHERE e.patient_id = p.id) AS last_visit
       FROM patient p
      WHERE p.deleted_at IS NULL AND (${isMobile ? "p.mobile LIKE ?" : "p.name LIKE ? OR p.code LIKE ?"})
      ORDER BY last_visit DESC NULLS LAST, p.name
      LIMIT ?`,
    term.length < 2 ? ["__none__", limit] : isMobile ? [`%${mobile}%`, limit] : [`%${term}%`, `%${term}%`, limit],
  );
}

export function PatientSearch({ onPick, actionLabel }: { onPick: (p: PatientHit) => void; actionLabel: string }) {
  const [q, setQ] = useState("");
  const { data } = usePatientSearch(q, 8);
  return (
    <div className="card p-3">
      <input className="input" placeholder="Search patient by mobile, name or ID…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="patient-search" />
      {q.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-slate-100">
          {data.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <Link to={`/patients/${p.id}`} className="hover:underline">
                <b>{p.name}</b> <span className="text-slate-500">{ageLabel(p.dob)} {p.sex?.[0]?.toUpperCase()} · {p.mobile} · {p.code}</span>
                {p.last_visit && <span className="ml-2 text-xs text-slate-400">last visit {p.last_visit}</span>}
              </Link>
              <button className="btn-secondary text-xs" onClick={() => onPick(p)}>{actionLabel}</button>
            </li>
          ))}
          {!data.length && (
            <li className="py-2 text-sm text-slate-500">No match. <Link to="/patients/new" className="text-brand-700 underline">Register new patient</Link></li>
          )}
        </ul>
      )}
    </div>
  );
}
