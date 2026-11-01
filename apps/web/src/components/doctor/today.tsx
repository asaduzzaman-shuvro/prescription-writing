"use client";

import { useQuery } from "@powersync/react";
import {
  Activity,
  Banknote,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Stethoscope,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors, useMyProfile } from "@/lib/doctor/hooks";
import { Link } from "@/lib/doctor/router";
import { today } from "@/lib/doctor/util";
import { useAppointments, useCheckIn } from "./bookings";
import { ActiveChamberSelector } from "./active-chamber";

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

function dayLabel(d: string) {
  const [y, m, dayNum] = d.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, dayNum).toLocaleDateString("en-GB", { weekday: "short" });
}

function DonutChart({
  segments,
  size = 108,
  centerValue,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  centerValue: string | number;
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 32;
  const stroke = 9;
  const cx = size / 2;
  const cy = size / 2;
  const circum = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((seg, i) => {
              const len = (seg.value / total) * circum;
              const el = (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${circum - len}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                />
              );
              offset += len;
              return el;
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-lg font-bold tabular-nums text-slate-900">{centerValue}</span>
        <span className="text-[9px] font-medium text-slate-500">{centerLabel}</span>
      </div>
    </div>
  );
}

function WeekVisitChart({
  days,
  weekRows,
  todayDate,
}: {
  days: string[];
  weekRows: { visit_date: string; n: number; fee: number }[];
  todayDate: string;
}) {
  const counts = days.map((d) => num(weekRows.find((r) => r.visit_date === d)?.n));
  const max = Math.max(1, ...counts);
  const w = 400;
  const h = 112;
  const padX = 28;
  const padY = 20;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const step = days.length > 1 ? innerW / (days.length - 1) : 0;

  const coords = counts.map((c, i) => {
    const x = padX + i * step;
    const y = padY + innerH - (c / max) * innerH;
    return { x, y, c, d: days[i]! };
  });

  const line = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const area =
    coords.length > 0
      ? `M ${coords[0]!.x} ${padY + innerH} L ${coords.map((p) => `${p.x} ${p.y}`).join(" L ")} L ${coords[coords.length - 1]!.x} ${padY + innerH} Z`
      : "";

  return (
    <div className="w-full" data-testid="dashboard-week-chart">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label="Visits in the last seven days">
        <defs>
          <linearGradient id="visit-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#13877d" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#13877d" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={padY + innerH * (1 - t)}
            y2={padY + innerH * (1 - t)}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}
        {area && <path d={area} fill="url(#visit-area-fill)" />}
        {coords.length > 1 && (
          <polyline fill="none" stroke="#0f6f67" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={line} />
        )}
        {coords.map((p) => (
          <g key={p.d}>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.d === todayDate ? 5 : 4}
              fill={p.d === todayDate ? "#0f6f67" : "#fff"}
              stroke="#0f6f67"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
        {coords.map((p) => (
          <div key={p.d} className={p.d === todayDate ? "font-semibold text-brand-700" : ""}>
            <div className="tabular-nums text-slate-700">{p.c}</div>
            <div>{dayLabel(p.d)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekFeesChart({
  days,
  weekRows,
  todayDate,
}: {
  days: string[];
  weekRows: { visit_date: string; n: number; fee: number }[];
  todayDate: string;
}) {
  const fees = days.map((d) => num(weekRows.find((r) => r.visit_date === d)?.fee));
  const max = Math.max(1, ...fees);

  return (
    <div className="flex h-24 items-end gap-1" data-testid="dashboard-fees-chart">
      {days.map((d) => {
        const fee = num(weekRows.find((r) => r.visit_date === d)?.fee);
        const height = fee === 0 ? 4 : Math.max(10, Math.round((fee / max) * 100));
        return (
          <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[9px] tabular-nums text-slate-500">{fee > 0 ? money(fee) : "—"}</span>
            <div
              className={`w-full rounded-t-lg transition-all ${d === todayDate ? "bg-emerald-600 shadow-sm" : "bg-emerald-200/90"}`}
              style={{ height }}
              title={`${d}: ${money(fee)}`}
            />
            <span className={`text-[10px] ${d === todayDate ? "font-semibold text-emerald-800" : "text-slate-400"}`}>{dayLabel(d)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone: "amber" | "blue" | "green" | "brand";
}) {
  const tones = {
    amber: {
      blob: "from-amber-500/20 to-amber-500/5",
      icon: "from-amber-500/15 to-amber-500/5 text-amber-700 ring-amber-200/60",
    },
    blue: {
      blob: "from-blue-500/20 to-blue-500/5",
      icon: "from-blue-500/15 to-blue-500/5 text-blue-700 ring-blue-200/60",
    },
    green: {
      blob: "from-emerald-500/20 to-emerald-500/5",
      icon: "from-emerald-500/15 to-emerald-500/5 text-emerald-700 ring-emerald-200/60",
    },
    brand: {
      blob: "from-brand-500/20 to-brand-500/5",
      icon: "from-brand-500/15 to-brand-500/5 text-brand-700 ring-brand-200/60",
    },
  };
  const t = tones[tone];
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm ring-1 ring-slate-900/5">
      <div className={`absolute -top-5 -right-5 h-14 w-14 rounded-full bg-gradient-to-br ${t.blob} opacity-80`} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums text-slate-900">{value}</p>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ring-1 ring-inset ${t.icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export function Today() {
  const session = useSession();
  const { current: chamber } = useChambers();
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

  const { data: appts } = useAppointments(date, chamber?.id ?? null);
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
  const fresh = num(day?.fresh);
  const followup = num(day?.followup);
  const report = num(day?.report);
  const book = people[0];
  const registered = num(book?.registered);
  const currentOpen = num(book?.current_open);
  const olderOpen = num(book?.older_open);
  const writtenPatients = num(book?.written);
  const month = monthRows[0];
  const weekVisitTotal = days.reduce((s, d) => s + num(weekRows.find((r) => r.visit_date === d)?.n), 0);

  const queueSegments = [
    { value: waiting, color: "#fbbf24" },
    { value: inRoom, color: "#3b82f6" },
    { value: finished, color: "#10b981" },
  ];
  const visitTypeSegments = [
    { value: fresh, color: "#0f6f67" },
    { value: followup, color: "#6366f1" },
    { value: report, color: "#e85a8a" },
  ];
  const patientSegments = [
    { value: currentOpen, color: "#fbbf24" },
    { value: olderOpen, color: "#94a3b8" },
    { value: writtenPatients, color: "#10b981" },
  ];

  return (
    <div className="w-full space-y-3">
      {bmdcExpired && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-alert ring-1 ring-red-100">
          Your BMDC registration expired on {profile!.bmdc_expiry}. Please renew it and inform the RxPad admin.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-brand-600 uppercase">Overview</p>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500">
            {profile?.specialty_code ? `${profile.specialty_code.replace(/_/g, " ")} · ` : ""}
            {date}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ActiveChamberSelector />
          {!isDoctor && doctors.length > 1 && (
            <select className="input h-8 w-auto rounded-lg" value={effectiveDoctor} onChange={(e) => setDoctorId(e.target.value)} aria-label="Doctor">
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name_en}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="dashboard-stats">
        <StatCard label="Waiting" value={waiting} tone="amber" icon={<Users className="h-4 w-4" />} />
        <StatCard label="With the doctor" value={inRoom} tone="blue" icon={<Stethoscope className="h-4 w-4" />} />
        <StatCard label="Prescription written" value={writtenToday} tone="green" icon={<FileText className="h-4 w-4" />} />
        <StatCard
          label={showMoney ? "Fees recorded" : "Visits today"}
          value={showMoney ? money(feesToday) : totalToday}
          tone="brand"
          icon={showMoney ? <Banknote className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-2 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 xl:col-span-6">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-900">Today&apos;s queue</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{totalToday} visits</span>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
            <DonutChart segments={queueSegments} centerValue={totalToday} centerLabel="total today" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <ShareBar
                parts={[
                  { n: waiting, className: "bg-amber-400" },
                  { n: inRoom, className: "bg-blue-500" },
                  { n: finished, className: "bg-emerald-500" },
                ]}
              />
              <div className="grid gap-1 sm:grid-cols-2">
                <Legend swatch="bg-amber-400" label="Waiting" value={waiting} />
                <Legend swatch="bg-blue-500" label="With the doctor" value={inRoom} />
                <Legend swatch="bg-emerald-500" label="Finished" value={finished} />
                <Legend label="Still to prescribe" value={toWrite} />
                <Legend label="New" value={fresh} />
                <Legend label="Follow-up" value={followup} />
                <Legend label="Report showing" value={report} />
                <Legend label="Booked, not arrived" value={booked.length} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 xl:col-span-3">
          <h2 className="mb-1.5 text-xs font-semibold text-slate-900">Visit mix today</h2>
          <DonutChart
            segments={visitTypeSegments}
            centerValue={fresh + followup + report}
            centerLabel="typed visits"
          />
          <div className="mt-1.5 space-y-0.5">
            <Legend swatch="bg-brand-600" label="New" value={fresh} />
            <Legend swatch="bg-indigo-500" label="Follow-up" value={followup} />
            <Legend swatch="bg-sakura-500" label="Report showing" value={report} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 xl:col-span-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-900">This month</h2>
            <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MonthTile label="Visits" value={num(month?.visits)} />
            <MonthTile label="Finished" value={num(month?.finished)} />
            {showMoney && <MonthTile label="Fees" value={money(num(month?.fees))} accent="emerald" />}
            <MonthTile label="Rx finalised" value={num(month?.rx)} accent="brand" />
            <MonthTile label="Follow-ups" value={num(month?.followup)} />
            <MonthTile label="Lab reports" value={num(labRows[0]?.n)} />
          </div>
        </section>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600" aria-hidden />
              <h2 className="text-xs font-semibold text-slate-900">Visits — last 7 days</h2>
            </div>
            <span className="text-xs font-medium tabular-nums text-slate-500">{weekVisitTotal} total</span>
          </div>
          <WeekVisitChart days={days} weekRows={weekRows} todayDate={date} />
        </section>

        <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              <h2 className="text-xs font-semibold text-slate-900">{showMoney ? "Fees — last 7 days" : "Activity — last 7 days"}</h2>
            </div>
          </div>
          {showMoney ? (
            <WeekFeesChart days={days} weekRows={weekRows} todayDate={date} />
          ) : (
            <WeekVisitChart days={days} weekRows={weekRows} todayDate={date} />
          )}
        </section>
      </div>

      {booked.length > 0 && (
        <div className="rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/80 to-white p-2.5 shadow-sm ring-1 ring-blue-100">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            <ClipboardCheck className="h-4 w-4 text-blue-600" />
            Booked — not arrived ({booked.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {booked.map((a) => (
              <button
                key={a.id}
                onClick={() => checkIn(a)}
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                data-testid="booked-chip"
              >
                <b className="tabular-nums">#{a.serial_no}</b> {a.name}{" "}
                <span className="text-xs font-medium text-blue-700">check in</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Patient registry</h2>
            <p className="text-xs text-slate-500">{registered} registered in this chamber</p>
          </div>
          <DonutChart segments={patientSegments} centerValue={registered} centerLabel="patients" size={96} />
        </div>
        <ShareBar
          parts={[
            { n: currentOpen, className: "bg-amber-400" },
            { n: olderOpen, className: "bg-slate-400" },
            { n: writtenPatients, className: "bg-emerald-500" },
          ]}
        />
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { to: "/patients?group=today" as const, label: "Current date, no prescription", value: currentOpen, swatch: "bg-amber-400" },
            { to: "/patients?group=unseen" as const, label: "Older, no prescription", value: olderOpen, swatch: "bg-slate-400" },
            { to: "/patients?group=seen" as const, label: "Prescription written", value: writtenPatients, swatch: "bg-emerald-500" },
            { label: "Registered today", value: num(book?.registered_today) },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border border-slate-200/80 bg-slate-50/50 px-2.5 py-1 ring-1 ring-slate-900/5">
              <Metric to={m.to} label={m.label} value={m.value} swatch={m.swatch} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MonthTile({
  label,
  value,
  accent = "slate",
}: {
  label: string;
  value: string | number;
  accent?: "slate" | "brand" | "emerald";
}) {
  const accents = {
    slate: "border-slate-200/80 bg-slate-50/50",
    brand: "border-brand-200/60 bg-brand-50/40",
    emerald: "border-emerald-200/60 bg-emerald-50/40",
  };
  return (
    <div className={`rounded-lg border px-2 py-1.5 ${accents[accent]}`}>
      <p className="text-[9px] font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-px text-base font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Legend({ label, value, swatch }: { label: string; value: number; swatch?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-1 py-0.5">
      <span className="flex min-w-0 items-center gap-1 text-xs text-slate-600">
        {swatch && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function ShareBar({ parts }: { parts: { n: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0);
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80 ring-inset" aria-hidden>
      {total > 0 && parts.map((p, i) => <div key={i} className={p.className} style={{ width: `${(p.n / total) * 100}%` }} />)}
    </div>
  );
}

function Metric({ label, value, to, swatch }: { label: string; value: string | number; to?: string; swatch?: string }) {
  const row = (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
        {swatch && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  );
  if (!to) return row;
  return (
    <Link to={to} className="-mx-1 block rounded-lg px-1 transition hover:bg-slate-50">
      {row}
    </Link>
  );
}
