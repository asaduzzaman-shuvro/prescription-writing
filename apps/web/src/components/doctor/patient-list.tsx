"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, normaliseMobile, today } from "@/lib/doctor/util";
import type { PatientHit } from "./patient-search";

/** Each tab is the whole group, not a shortened slice of the others. */
type PatientGroup = "today" | "unseen" | "seen";

/** A written prescription has medicines, or has been finalised. Opening a visit only creates an empty draft. */
const WRITTEN_RX = `EXISTS (
  SELECT 1 FROM prescription rx
   WHERE rx.patient_id = p.id
     AND (rx.status = 'final' OR rx.doc LIKE '%"items": [{%' OR rx.doc LIKE '%"items":[{%')
)`;

const TODAY_VISIT = `EXISTS (SELECT 1 FROM encounter e WHERE e.patient_id = p.id AND e.visit_date = ? AND e.status <> 'cancelled')`;
/** Registration day is the local date stored at the start of created_at. */
const REGISTERED_TODAY = `substr(p.created_at, 1, 10) = ?`;
const ON_TODAY = `((${TODAY_VISIT}) OR (${REGISTERED_TODAY}))`;

const GROUP_WHERE: Record<PatientGroup, string> = {
  today: `(${ON_TODAY}) AND NOT (${WRITTEN_RX})`,
  unseen: `NOT (${WRITTEN_RX}) AND NOT (${ON_TODAY})`,
  seen: WRITTEN_RX,
};

function groupFromHash(): PatientGroup {
  if (typeof window === "undefined") return "today";
  const g = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("group");
  return g === "unseen" || g === "seen" ? g : "today";
}

export function PatientList() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<PatientGroup>(groupFromHash);
  const date = today();
  const term = q.trim();
  const mobile = normaliseMobile(term);
  const searching = term.length >= 2;
  const isMobile = /^\d{4,}$/.test(mobile);
  const params: (string | number)[] = [];
  if (group === "today" || group === "unseen") params.push(date, date);
  const searchSql = !searching
    ? ""
    : isMobile
      ? "AND p.mobile LIKE ?"
      : "AND (p.name LIKE ? OR p.code LIKE ?)";
  if (searching) {
    if (isMobile) params.push(`%${mobile}%`);
    else params.push(`%${term}%`, `%${term}%`);
  }
  params.push(50);
  const rows = useQuery<PatientHit>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code,
            (SELECT MAX(visit_date) FROM encounter e WHERE e.patient_id = p.id AND e.status <> 'cancelled') AS last_visit
       FROM patient p
      WHERE p.deleted_at IS NULL AND ${GROUP_WHERE[group]} ${searchSql}
      ORDER BY last_visit DESC, p.name
      LIMIT ?`,
    params,
  );
  const { data: counts } = useQuery<{ today_n: number; unseen_n: number; seen_n: number; n: number }>(
    `SELECT
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${GROUP_WHERE.today}) AS today_n,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${GROUP_WHERE.unseen}) AS unseen_n,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${GROUP_WHERE.seen}) AS seen_n,
        (SELECT count(*) FROM patient WHERE deleted_at IS NULL) AS n`,
    [date, date, date, date],
  );
  const tally = counts[0];
  const isDoctor = session.tenantRole === "doctor";
  const tabs: { id: PatientGroup; label: string; hint: string; n: number }[] = [
    { id: "today", label: "Current date", hint: `Registered or visiting today (${date}), with no prescription yet`, n: tally?.today_n ?? 0 },
    { id: "unseen", label: "Unseen patients", hint: "Older patients who do not have a prescription yet", n: tally?.unseen_n ?? 0 },
    { id: "seen", label: "Seen patients", hint: "Patients who have a prescription written", n: tally?.seen_n ?? 0 },
  ];
  const active = tabs.find((t) => t.id === group) ?? tabs[0]!;

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
          <p className="text-sm text-slate-500">{tally?.n ?? 0} registered — available offline on this device</p>
        </div>
        <Link to="/patients/new" className="btn-primary">+ New patient</Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <nav className="flex flex-wrap gap-0.5 rounded-md bg-slate-100 p-0.5" aria-label="Patient groups" data-testid="patient-groups">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${group === t.id ? "bg-white font-medium text-brand-700 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
              aria-pressed={group === t.id}
              data-testid={`patient-tab-${t.id}`}
              onClick={() => setGroup(t.id)}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums text-xs text-slate-400">{t.n}</span>
            </button>
          ))}
        </nav>
        <p className="text-xs text-slate-500">{active.hint}</p>
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
            {rows.data.map((p) => (
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
            {!rows.data.length && (
              <tr>
                <td colSpan={6} className="py-5 text-center text-slate-500">
                  {searching ? (
                    <>
                      No match in {active.label.toLowerCase()}.{" "}
                      <Link to="/patients/new" className="text-brand-700 underline">Register new patient</Link>
                    </>
                  ) : (
                    <>No one in {active.label.toLowerCase()}.</>
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
