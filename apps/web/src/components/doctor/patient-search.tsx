"use client";

import { useQuery } from "@powersync/react";
import { Search } from "lucide-react";
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
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          className="input h-8 w-full pl-7 text-sm"
          placeholder="Search by mobile, name or ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="patient-search"
        />
      </div>
      {q.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-100">
          {data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <Link to={`/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">
                  {p.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {ageLabel(p.dob)}
                  {p.sex ? ` · ${p.sex[0]!.toUpperCase()}` : ""}
                  {p.mobile ? ` · ${p.mobile}` : ""}
                  {p.code ? ` · ${p.code}` : ""}
                  {p.last_visit ? <span className="text-slate-400"> · last {p.last_visit}</span> : null}
                </p>
              </div>
              <button type="button" className="btn-primary h-7 shrink-0 px-2 text-xs" onClick={() => onPick(p)}>
                {actionLabel}
              </button>
            </li>
          ))}
          {!data.length && <li className="px-2 py-3 text-center text-sm text-slate-500">No match.</li>}
        </ul>
      )}
    </div>
  );
}
