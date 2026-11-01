"use client";

import { useQuery } from "@powersync/react";
import { Banknote, Users } from "lucide-react";
import { allPatientsFilterWhere, WRITTEN_RX } from "@/lib/doctor/chamber-filter";
import { today } from "@/lib/doctor/util";

function num(v: unknown) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function money(v: number) {
  return `৳${v.toLocaleString("en-IN")}`;
}

function effectiveRange(dateFrom: string | null, dateTo: string | null) {
  const from = dateFrom?.trim() || null;
  const to = dateTo?.trim() || null;
  if (from || to) {
    let start = from ?? to!;
    let end = to ?? from!;
    if (start > end) [start, end] = [end, start];
    return { start, end, fromFilter: true as const };
  }
  const end = today();
  const d = new Date(`${end}T12:00:00`);
  d.setDate(d.getDate() - 6);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start, end, fromFilter: false as const };
}

function daysInclusive(start: string, end: string) {
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out.length > 62 ? out.slice(-62) : out;
}

function shortDay(d: string) {
  const [y, m, dayNum] = d.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, dayNum).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function DonutChart({
  segments,
  size = 100,
  centerValue,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  centerValue: string | number;
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 30;
  const stroke = 8;
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
        <span className="text-base font-bold tabular-nums text-slate-900">{centerValue}</span>
        <span className="text-[9px] font-medium text-slate-500">{centerLabel}</span>
      </div>
    </div>
  );
}

export function AllPatientsInsights({
  filterChamberId,
  filterDateFrom,
  filterDateTo,
}: {
  filterChamberId: string | null;
  filterDateFrom: string | null;
  filterDateTo: string | null;
}) {
  const { sql: filterSql, params: filterParams } = allPatientsFilterWhere(filterChamberId, filterDateFrom, filterDateTo);
  const { start, end, fromFilter } = effectiveRange(filterDateFrom, filterDateTo);
  const days = daysInclusive(start, end);
  const chamberEnc = filterChamberId ? "AND e.chamber_id = ?" : "";
  const feeParams = filterChamberId ? [start, end, filterChamberId] : [start, end];
  const queryKey = `${filterChamberId ?? ""}|${start}|${end}|${filterSql}`;

  return (
    <AllPatientsInsightsInner
      key={queryKey}
      filterSql={filterSql}
      filterParams={filterParams}
      start={start}
      end={end}
      fromFilter={fromFilter}
      days={days}
      chamberEnc={chamberEnc}
      feeParams={feeParams}
    />
  );
}

function AllPatientsInsightsInner({
  filterSql,
  filterParams,
  start,
  end,
  fromFilter,
  days,
  chamberEnc,
  feeParams,
}: {
  filterSql: string;
  filterParams: string[];
  start: string;
  end: string;
  fromFilter: boolean;
  days: string[];
  chamberEnc: string;
  feeParams: string[];
}) {
  const { data: patientSplit } = useQuery<{ seen_n: number; unseen_n: number }>(
    `SELECT
        sum(CASE WHEN (${WRITTEN_RX}) THEN 1 ELSE 0 END) AS seen_n,
        sum(CASE WHEN NOT (${WRITTEN_RX}) THEN 1 ELSE 0 END) AS unseen_n
       FROM patient p
      WHERE p.deleted_at IS NULL AND (${filterSql})`,
    filterParams,
  );
  const { data: feeTotal } = useQuery<{ total: number }>(
    `SELECT coalesce(sum(coalesce(e.fee, 0)), 0) AS total
       FROM encounter e
      WHERE e.status <> 'cancelled'
        AND e.visit_date >= ? AND e.visit_date <= ?
        ${chamberEnc}`,
    feeParams,
  );
  const { data: feeRows } = useQuery<{ visit_date: string; fee: number }>(
    `SELECT e.visit_date, coalesce(sum(coalesce(e.fee, 0)), 0) AS fee
       FROM encounter e
      WHERE e.status <> 'cancelled'
        AND e.visit_date >= ? AND e.visit_date <= ?
        ${chamberEnc}
      GROUP BY e.visit_date`,
    feeParams,
  );

  const seen = num(patientSplit[0]?.seen_n);
  const unseen = num(patientSplit[0]?.unseen_n);
  const totalPatients = seen + unseen;
  const totalFee = num(feeTotal[0]?.total);
  const feesByDay = days.map((d) => num(feeRows.find((r) => r.visit_date === d)?.fee));
  const maxFee = Math.max(1, ...feesByDay);
  const periodHint = fromFilter ? `${shortDay(start)} – ${shortDay(end)}` : `Last 7 days · ${shortDay(start)} – ${shortDay(end)}`;

  return (
    <section
      className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm lg:grid-cols-3"
      data-testid="all-patients-insights"
    >
      <div className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50/50 p-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Users className="h-3.5 w-3.5 text-brand-600" aria-hidden />
          Seen vs unseen
        </div>
        <p className="text-[10px] text-slate-500">In your filtered patient list · prescription written = seen</p>
        <DonutChart
          segments={[
            { value: seen, color: "#0f6f67" },
            { value: unseen, color: "#f59e0b" },
          ]}
          centerValue={totalPatients}
          centerLabel="patients"
        />
        <ul className="flex justify-center gap-3 text-[11px] text-slate-600">
          <li>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-700" aria-hidden />
            Seen <span className="font-semibold tabular-nums text-slate-900">{seen}</span>
          </li>
          <li>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Unseen <span className="font-semibold tabular-nums text-slate-900">{unseen}</span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col justify-between rounded-md border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
            <Banknote className="h-3.5 w-3.5" aria-hidden />
            Fees collected (৳)
          </div>
          <p className="mt-0.5 text-[10px] text-emerald-800/80">{periodHint}</p>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-900" data-testid="all-patients-fees-total">
          {money(totalFee)}
        </p>
        <p className="text-[10px] text-slate-500">From visit fees on this device · chamber filter applies</p>
      </div>

      <div className="flex flex-col gap-1 rounded-md border border-slate-100 p-2 lg:col-span-1">
        <p className="text-xs font-semibold text-slate-800">Fees by day</p>
        <p className="text-[10px] text-slate-500">{periodHint}</p>
        <div className="mt-1 flex h-24 items-end gap-0.5" data-testid="all-patients-fees-chart">
          {days.map((d, i) => {
            const fee = feesByDay[i] ?? 0;
            const height = fee === 0 ? 4 : Math.max(10, Math.round((fee / maxFee) * 100));
            return (
              <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                <span className="hidden text-[8px] tabular-nums text-slate-500 sm:inline">{fee > 0 ? money(fee) : "—"}</span>
                <div
                  className="w-full rounded-t bg-emerald-500/85 transition-all hover:bg-emerald-600"
                  style={{ height }}
                  title={`${d}: ${money(fee)}`}
                />
                <span className="truncate text-[8px] text-slate-400">{shortDay(d)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
