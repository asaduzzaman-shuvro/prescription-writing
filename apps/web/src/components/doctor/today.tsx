"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { useState } from "react";
import { startVisit } from "@/lib/doctor/data";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors, useMyProfile } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { today } from "@/lib/doctor/util";
import { useAppointments, useCheckIn } from "./bookings";
import { PatientSearch } from "./patient-search";

/** Same rule as the patient list: a written prescription has medicines, or has been finalised. */
const WRITTEN_RX = `EXISTS (
  SELECT 1 FROM prescription rx
   WHERE rx.patient_id = p.id
     AND (rx.status = 'final' OR rx.doc LIKE '%"items": [{%' OR rx.doc LIKE '%"items":[{%')
)`;
const ON_TODAY = `(EXISTS (SELECT 1 FROM encounter e WHERE e.patient_id = p.id AND e.visit_date = ? AND e.status <> 'cancelled') OR substr(p.created_at, 1, 10) = ?)`;

function monthStart(date: string) {
  return `${date.slice(0, 8)}01`;
}

function recentDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d);
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(start);
    dt.setDate(start.getDate() - i);
    days.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }
  return days;
}

function num(v: unknown) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: number) {
  return `৳${v.toLocaleString("en-IN")}`;
}

export function Today() {
  const db = usePowerSync();
  const session = useSession();
  const { current: chamber, chambers, select } = useChambers();
  const doctors = useDoctors();
  const profile = useMyProfile();
  const isDoctor = session.tenantRole === "doctor";
  const showMoney = session.tenantRole !== "assistant";
  const [doctorId, setDoctorId] = useState<string>("");
  const date = today();
  const fromMonth = monthStart(date);
  const days = recentDays(date, 7);
  const docSql = isDoctor ? "AND doctor_user_id = ?" : "";
  const docParams = isDoctor ? [session.userId] : [];

  const { data: dayRows } = useQuery<{
    waiting: number; in_room: number; finished: number; total: number; fees: number; fresh: number; followup: number; report: number; written: number;
  }>(
    `SELECT
        coalesce(sum(CASE WHEN e.status = 'waiting' THEN 1 ELSE 0 END), 0) AS waiting,
        coalesce(sum(CASE WHEN e.status = 'in_progress' THEN 1 ELSE 0 END), 0) AS in_room,
        coalesce(sum(CASE WHEN e.status = 'done' THEN 1 ELSE 0 END), 0) AS finished,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' THEN 1 ELSE 0 END), 0) AS total,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' THEN coalesce(e.fee, 0) ELSE 0 END), 0) AS fees,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' AND (e.visit_type IS NULL OR e.visit_type = '' OR e.visit_type = 'new') THEN 1 ELSE 0 END), 0) AS fresh,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' AND e.visit_type = 'followup' THEN 1 ELSE 0 END), 0) AS followup,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' AND e.visit_type = 'report' THEN 1 ELSE 0 END), 0) AS report,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' AND EXISTS (
          SELECT 1 FROM prescription rx WHERE rx.encounter_id = e.id
            AND (rx.status = 'final' OR rx.doc LIKE '%"items": [{%' OR rx.doc LIKE '%"items":[{%')
        ) THEN 1 ELSE 0 END), 0) AS written
       FROM encounter e
      WHERE e.visit_date = ? ${isDoctor ? "AND e.doctor_user_id = ?" : ""}`,
    isDoctor ? [date, session.userId] : [date],
  );

  const { data: people } = useQuery<{ registered: number; registered_today: number; current_open: number; older_open: number; written: number }>(
    `SELECT
        (SELECT count(*) FROM patient WHERE deleted_at IS NULL) AS registered,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND substr(p.created_at, 1, 10) = ?) AS registered_today,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND (${ON_TODAY}) AND NOT (${WRITTEN_RX})) AS current_open,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND NOT (${WRITTEN_RX}) AND NOT (${ON_TODAY})) AS older_open,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${WRITTEN_RX}) AS written`,
    [date, date, date, date, date],
  );

  const { data: monthRows } = useQuery<{ visits: number; finished: number; fees: number; followup: number; report: number; rx: number }>(
    `SELECT
        coalesce(sum(CASE WHEN e.status <> 'cancelled' THEN 1 ELSE 0 END), 0) AS visits,
        coalesce(sum(CASE WHEN e.status = 'done' THEN 1 ELSE 0 END), 0) AS finished,
        coalesce(sum(CASE WHEN e.status = 'done' THEN coalesce(e.fee, 0) ELSE 0 END), 0) AS fees,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' AND e.visit_type = 'followup' THEN 1 ELSE 0 END), 0) AS followup,
        coalesce(sum(CASE WHEN e.status <> 'cancelled' AND e.visit_type = 'report' THEN 1 ELSE 0 END), 0) AS report,
        (SELECT count(*) FROM prescription rx
           JOIN encounter ev ON ev.id = rx.encounter_id
          WHERE rx.status = 'final' AND ev.visit_date BETWEEN ? AND ?
            ${isDoctor ? "AND rx.doctor_user_id = ?" : ""}
            AND NOT EXISTS (SELECT 1 FROM prescription n WHERE n.supersedes_id = rx.id AND n.status = 'final')) AS rx
       FROM encounter e
      WHERE e.visit_date BETWEEN ? AND ? ${isDoctor ? "AND e.doctor_user_id = ?" : ""}`,
    isDoctor ? [fromMonth, date, session.userId, fromMonth, date, session.userId] : [fromMonth, date, fromMonth, date],
  );

  const { data: weekRows } = useQuery<{ visit_date: string; n: number; fee: number }>(
    `SELECT visit_date, count(*) AS n, coalesce(sum(fee), 0) AS fee
       FROM encounter
      WHERE visit_date BETWEEN ? AND ? AND status <> 'cancelled' ${docSql}
      GROUP BY visit_date`,
    [days[0] ?? date, date, ...docParams],
  );

  const { data: labRows } = useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM lab_report WHERE deleted_at IS NULL AND report_date BETWEEN ? AND ?`,
    [fromMonth, date],
  );

  const { data: appts } = useAppointments(date);
  const booked = appts.filter((a) => a.status === "booked" && (!isDoctor || a.doctor_user_id === session.userId));
  const checkIn = useCheckIn();
  const effectiveDoctor = isDoctor ? session.userId : doctorId || doctors[0]?.id || "";
  const bmdcExpired = profile?.bmdc_expiry && profile.bmdc_expiry < date;

  const day = dayRows[0];
  const waiting = num(day?.waiting);
  const inRoom = num(day?.in_room);
  const finished = num(day?.finished);
  const totalToday = num(day?.total);
  const feesToday = num(day?.fees);
  const writtenToday = num(day?.written);
  const toWrite = Math.max(0, totalToday - writtenToday);
  const book = people[0];
  const registered = num(book?.registered);
  const currentOpen = num(book?.current_open);
  const olderOpen = num(book?.older_open);
  const writtenPatients = num(book?.written);
  const month = monthRows[0];
  const weekMax = Math.max(1, ...weekRows.map((r) => num(r.n)));

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

  const stat = (label: string, value: string | number, tone: string) => (
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
            {` · ${date}`}
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
        {stat("Waiting", waiting, "border-l-4 border-l-warn")}
        {stat("With the doctor", inRoom, "border-l-4 border-l-blue-500")}
        {stat("Prescription written", writtenToday, "border-l-4 border-l-green-500")}
        {stat(showMoney ? "Fees recorded" : "Visits today", showMoney ? money(feesToday) : totalToday, "border-l-4 border-l-brand-500")}
      </div>

      <PatientSearch onPick={(p) => visit(p.id)} actionLabel={isDoctor ? "Start visit" : "Add to queue"} />

      <section className="card p-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Today</h2>
            <span className="text-xs text-slate-400 tabular-nums">{totalToday} visits</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
            {totalToday > 0 && (
              <>
                <div className="bg-amber-400" style={{ width: `${(waiting / totalToday) * 100}%` }} />
                <div className="bg-blue-500" style={{ width: `${(inRoom / totalToday) * 100}%` }} />
                <div className="bg-green-500" style={{ width: `${(finished / totalToday) * 100}%` }} />
              </>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
            <Legend swatch="bg-amber-400" label="Waiting" value={waiting} />
            <Legend swatch="bg-blue-500" label="With the doctor" value={inRoom} />
            <Legend swatch="bg-green-500" label="Finished" value={finished} />
            <Legend label="Still to prescribe" value={toWrite} />
            <Legend label="New" value={num(day?.fresh)} />
            <Legend label="Follow-up" value={num(day?.followup)} />
            <Legend label="Report showing" value={num(day?.report)} />
            <Legend label="Booked, not arrived" value={booked.length} />
          </div>
      </section>

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

      <div className="grid gap-1.5 lg:grid-cols-3">
        <section className="card p-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Patients</h2>
            <span className="text-xs text-slate-400 tabular-nums">{registered} registered</span>
          </div>
          <ShareBar parts={[
            { n: currentOpen, className: "bg-amber-400" },
            { n: olderOpen, className: "bg-slate-400" },
            { n: writtenPatients, className: "bg-green-500" },
          ]} />
          <div className="mt-1 divide-y divide-slate-100">
            <Metric to="/patients?group=today" label="Current date, no prescription" value={currentOpen} swatch="bg-amber-400" />
            <Metric to="/patients?group=unseen" label="Older, no prescription" value={olderOpen} swatch="bg-slate-400" />
            <Metric to="/patients?group=seen" label="Prescription written" value={writtenPatients} swatch="bg-green-500" />
            <Metric label="Registered today" value={num(book?.registered_today)} />
          </div>
        </section>

        <section className="card p-2.5">
          <h2 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">This month</h2>
          <div className="divide-y divide-slate-100">
            <Metric label="Visits" value={num(month?.visits)} />
            <Metric label="Finished" value={num(month?.finished)} />
            {showMoney && <Metric label="Fees on finished visits" value={money(num(month?.fees))} />}
            <Metric label="Prescriptions finalised" value={num(month?.rx)} />
            <Metric label="Follow-ups" value={num(month?.followup)} />
            <Metric label="Report showing" value={num(month?.report)} />
            <Metric label="Lab reports" value={num(labRows[0]?.n)} />
          </div>
        </section>

        <section className="card p-2.5">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Last 7 days</h2>
          <div className="flex h-28 items-end gap-1.5">
            {days.map((d) => {
              const row = weekRows.find((r) => r.visit_date === d);
              const count = num(row?.n);
              const height = count === 0 ? 2 : Math.max(8, Math.round((count / weekMax) * 96));
              const [y, m, dayNum] = d.split("-").map(Number);
              const name = new Date(y!, (m ?? 1) - 1, dayNum).toLocaleDateString("en-GB", { weekday: "short" });
              return (
                <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-slate-500">{count}</span>
                  <div className={`w-full rounded-sm ${d === date ? "bg-brand-600" : "bg-brand-200"}`} style={{ height }} title={showMoney ? `${d}: ${count} visits, ${money(num(row?.fee))}` : `${d}: ${count} visits`} />
                  <span className="text-[10px] text-slate-400">{name}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function Legend({ label, value, swatch }: { label: string; value: number; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
        {swatch && <span className={`h-2 w-2 shrink-0 rounded-full ${swatch}`} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-medium tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function ShareBar({ parts }: { parts: { n: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
      {total > 0 && parts.map((p, i) => <div key={i} className={p.className} style={{ width: `${(p.n / total) * 100}%` }} />)}
    </div>
  );
}

function Metric({ label, value, to, swatch }: { label: string; value: string | number; to?: string; swatch?: string }) {
  const row = (
    <div className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
        {swatch && <span className={`h-2 w-2 shrink-0 rounded-full ${swatch}`} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-medium tabular-nums text-slate-900">{value}</span>
    </div>
  );
  if (!to) return row;
  return <Link to={to} className="-mx-1 block rounded px-1 hover:bg-slate-50">{row}</Link>;
}
