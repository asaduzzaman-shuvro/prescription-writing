"use client";

import type { PrescriptionDoc } from "@rx/core";
import { useQuery } from "@powersync/react";
import { useState } from "react";
import { useSession } from "@/lib/doctor/context";
import { parseJson, today } from "@/lib/doctor/util";

function monthStart() {
  const t = today();
  return `${t.slice(0, 8)}01`;
}

function top(counts: Map<string, number>, n = 10) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** Practice summary computed from the local database (works offline). */
export function ReportsScreen() {
  const session = useSession();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const mine = session.tenantRole === "doctor";
  const { data: visits } = useQuery<{ id: string; visit_date: string; fee: number | null; patient_id: string; first_visit: string; visit_type: string | null }>(
    `SELECT e.id, e.visit_date, e.fee, e.patient_id, e.visit_type,
            (SELECT MIN(x.visit_date) FROM encounter x WHERE x.patient_id = e.patient_id) AS first_visit
       FROM encounter e WHERE e.visit_date BETWEEN ? AND ? AND e.status = 'done' ${mine ? "AND e.doctor_user_id = ?" : ""}`,
    mine ? [from, to, session.userId] : [from, to],
  );
  const { data: rxs } = useQuery<{ doc: string }>(
    `SELECT rx.doc FROM prescription rx JOIN encounter e ON e.id = rx.encounter_id
      WHERE rx.status = 'final' AND e.visit_date BETWEEN ? AND ? ${mine ? "AND rx.doctor_user_id = ?" : ""}
        AND NOT EXISTS (SELECT 1 FROM prescription n WHERE n.supersedes_id = rx.id AND n.status = 'final')`,
    mine ? [from, to, session.userId] : [from, to],
  );
  const fees = visits.reduce((s, v) => s + (v.fee ?? 0), 0);
  const newPatients = visits.filter((v) => v.first_visit === v.visit_date).length;
  const followUps = visits.filter((v) => v.visit_type === "followup").length;
  const reportVisits = visits.filter((v) => v.visit_type === "report");
  const freeReports = reportVisits.filter((v) => !v.fee).length;
  const dx = new Map<string, number>();
  const meds = new Map<string, number>();
  let abx = 0;
  for (const r of rxs) {
    const d = parseJson<PrescriptionDoc | null>(r.doc, null);
    if (!d) continue;
    d.diagnoses.forEach((x) => dx.set(x, (dx.get(x) ?? 0) + 1));
    d.items.forEach((i) => meds.set(i.genericName || i.brandName, (meds.get(i.genericName || i.brandName) ?? 0) + 1));
    if (d.items.some((i) => i.isAntibiotic)) abx++;
  }
  const byDay = new Map<string, { n: number; fee: number }>();
  visits.forEach((v) => {
    const cur = byDay.get(v.visit_date) ?? { n: 0, fee: 0 };
    byDay.set(v.visit_date, { n: cur.n + 1, fee: cur.fee + (v.fee ?? 0) });
  });
  const stat = (label: string, value: string | number) => (
    <div className="card px-2.5 py-2"><div className="text-[10px] uppercase text-slate-500">{label}</div><div className="text-xl font-semibold tabular-nums">{value}</div></div>
  );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-lg font-semibold">Reports</h1>
        <div className="flex items-center gap-1.5 text-sm">
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />–
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-5" data-testid="report-stats">
        {stat("Patients seen", visits.length)}
        {stat("New patients", newPatients)}
        {stat("Fees collected (৳)", fees.toLocaleString("en-IN"))}
        {stat("Prescriptions", rxs.length)}
        {stat("With antibiotic", rxs.length ? `${Math.round((abx / rxs.length) * 100)}%` : "—")}
        {stat("Follow-ups", followUps)}
        {stat("Report showing", reportVisits.length)}
        {stat("Free report visits", freeReports)}
      </div>
      <div className="grid gap-1.5 md:grid-cols-3">
        <div className="card p-2 text-sm"><h2 className="mb-1.5 font-semibold">Top diagnoses</h2><ol className="list-decimal pl-5">{top(dx).map(([k, v]) => <li key={k}>{k} <span className="text-slate-400">({v})</span></li>)}</ol></div>
        <div className="card p-2 text-sm"><h2 className="mb-1.5 font-semibold">Most prescribed generics</h2><ol className="list-decimal pl-5">{top(meds).map(([k, v]) => <li key={k}>{k} <span className="text-slate-400">({v})</span></li>)}</ol></div>
        <div className="card p-2 text-sm">
          <h2 className="mb-1.5 font-semibold">Daily</h2>
          <table className="w-full text-sm"><tbody>{[...byDay.entries()].sort().reverse().map(([d, v]) => <tr key={d}><td>{d}</td><td className="text-right tabular-nums">{v.n}</td><td className="text-right tabular-nums">৳{v.fee}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
