"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { CalendarDays, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { backfillMissingPatientCodes, startVisit } from "@/lib/doctor/data";
import {
  allPatientsFilterWhere,
  allPatientsListGroupSql,
  allPatientsSerialSqlEmbedded,
  ORDER_BY_SERIAL_ASC,
  WRITTEN_RX,
  type AllPatientsListGroup,
} from "@/lib/doctor/chamber-filter";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, patientSearchClause, today } from "@/lib/doctor/util";
import { ListPager } from "@/components/list-pager";
import { AllPatientsInsights } from "./all-patients-insights";
import type { PatientHit } from "./patient-search";

const PAGE = 20;

type Row = PatientHit & { serial_no: number | null; registered: string | null };

type AllPatientsTableProps = {
  filterChamberId: string | null;
  filterDateFrom: string | null;
  filterDateTo: string | null;
  listGroup: AllPatientsListGroup;
  term: string;
  page: number;
  isDoctor: boolean;
  onPage: (page: number) => void;
  onVisit: (patientId: string) => void;
  activeShort: string;
};

function AllPatientsTable({
  filterChamberId,
  filterDateFrom,
  filterDateTo,
  listGroup,
  term,
  page,
  isDoctor,
  onPage,
  onVisit,
  activeShort,
}: AllPatientsTableProps) {
  const { sql: filterSql, params: filterParams } = allPatientsFilterWhere(filterChamberId, filterDateFrom, filterDateTo);
  const groupSql = allPatientsListGroupSql(listGroup);
  const { sql: searchSql, params: searchParams } = patientSearchClause(term);
  const searching = searchSql.length > 0;
  const from = filterDateFrom?.trim() || null;
  const to = filterDateTo?.trim() || null;
  const serialSql = allPatientsSerialSqlEmbedded(from, to, filterChamberId, today());
  const listParams = [...filterParams, ...searchParams, PAGE, page * PAGE];
  const queryKey = `${filterChamberId ?? ""}|${from ?? ""}|${to ?? ""}|${listGroup}|${term}|${page}`;

  return (
    <AllPatientsTableInner
      key={queryKey}
      filterSql={filterSql}
      groupSql={groupSql}
      searchSql={searchSql}
      serialSql={serialSql}
      listParams={listParams}
      filterParams={filterParams}
      searchParams={searchParams}
      searching={searching}
      term={term}
      page={page}
      listGroup={listGroup}
      isDoctor={isDoctor}
      onPage={onPage}
      onVisit={onVisit}
      activeShort={activeShort}
    />
  );
}

function AllPatientsTableInner({
  filterSql,
  groupSql,
  searchSql,
  serialSql,
  listParams,
  filterParams,
  searchParams,
  searching,
  term,
  page,
  listGroup,
  isDoctor,
  onPage,
  onVisit,
  activeShort,
}: {
  filterSql: string;
  groupSql: string;
  searchSql: string;
  serialSql: string;
  listParams: (string | number)[];
  filterParams: string[];
  searchParams: string[];
  searching: boolean;
  term: string;
  page: number;
  listGroup: AllPatientsListGroup;
  isDoctor: boolean;
  onPage: (page: number) => void;
  onVisit: (patientId: string) => void;
  activeShort: string;
}) {
  const { data: rows } = useQuery<Row>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code,
            substr(p.created_at, 1, 10) AS registered,
            (SELECT MAX(visit_date) FROM encounter e WHERE e.patient_id = p.id AND e.status <> 'cancelled') AS last_visit,
            ${serialSql}
       FROM patient p
      WHERE p.deleted_at IS NULL AND (${filterSql}) AND (${groupSql}) ${searchSql}
      ORDER BY ${ORDER_BY_SERIAL_ASC}
      LIMIT ? OFFSET ?`,
    listParams,
  );
  const { data: matched } = useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM patient p WHERE p.deleted_at IS NULL AND (${filterSql}) AND (${groupSql}) ${searchSql}`,
    [...filterParams, ...searchParams],
  );
  const listTotal = Number(matched[0]?.n ?? 0);

  const emptyMessage =
    listGroup === "seen"
      ? searching
        ? "No seen patients match your search."
        : "No seen patients in this filter."
      : listGroup === "unseen"
        ? searching
          ? "No unseen patients match your search."
          : "No unseen patients in this filter."
        : searching
          ? "No patients match your search."
          : "No patients match these filters.";

  return (
    <>
      <p className="text-[11px] text-slate-500">
        Showing <span className="font-medium text-slate-700">{listTotal}</span> {activeShort.toLowerCase()} patient
        {listTotal === 1 ? "" : "s"}
        {searching ? (
          <>
            {" "}
            matching <span className="font-medium text-slate-700">“{term}”</span>
          </>
        ) : null}
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" data-testid="all-patients-table">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-14">SI No</th>
                <th>ID</th>
                <th>Name</th>
                <th>Age / sex</th>
                <th>Mobile</th>
                <th>Registered</th>
                <th>Last visit</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80">
                  <td className="tabular-nums font-semibold text-slate-800">{p.serial_no ?? "—"}</td>
                  <td className="text-xs tabular-nums text-slate-500">{p.code ?? "pending"}</td>
                  <td>
                    <Link to={`/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="text-slate-700">
                    {ageLabel(p.dob)}
                    {p.sex ? ` · ${p.sex[0]!.toUpperCase()}` : ""}
                  </td>
                  <td className="tabular-nums text-slate-700">{p.mobile || "—"}</td>
                  <td className="tabular-nums text-slate-600">{p.registered ?? "—"}</td>
                  <td className="tabular-nums text-slate-600">{p.last_visit ?? "—"}</td>
                  <td className="text-right">
                    <button type="button" className="btn-primary h-7 px-2 text-xs" onClick={() => void onVisit(p.id)}>
                      {isDoctor ? "Open Rx" : "Queue"}
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-slate-500">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ListPager page={page} total={listTotal} size={PAGE} onPage={onPage} />
      </div>
    </>
  );
}

function AllPatientsListTabs({
  filterSql,
  filterParams,
  listGroup,
  onSelectGroup,
  activeHint,
}: {
  filterSql: string;
  filterParams: string[];
  listGroup: AllPatientsListGroup;
  onSelectGroup: (g: AllPatientsListGroup) => void;
  activeHint: string;
}) {
  const { data: split } = useQuery<{ all_n: number; seen_n: number; unseen_n: number }>(
    `SELECT count(*) AS all_n,
            sum(CASE WHEN (${WRITTEN_RX}) THEN 1 ELSE 0 END) AS seen_n,
            sum(CASE WHEN NOT (${WRITTEN_RX}) THEN 1 ELSE 0 END) AS unseen_n
       FROM patient p
      WHERE p.deleted_at IS NULL AND (${filterSql})`,
    filterParams,
  );
  const all_n = Number(split[0]?.all_n ?? 0);
  const seen_n = Number(split[0]?.seen_n ?? 0);
  const unseen_n = Number(split[0]?.unseen_n ?? 0);
  const listTabs: { id: AllPatientsListGroup; short: string; n: number }[] = [
    { id: "all", short: "All", n: all_n },
    { id: "seen", short: "Seen", n: seen_n },
    { id: "unseen", short: "Unseen", n: unseen_n },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <nav className="flex flex-wrap gap-1" aria-label="All patients list" data-testid="all-patients-tabs">
        {listTabs.map((t) => {
          const on = listGroup === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                on
                  ? "border-brand-200 bg-brand-50 text-brand-800 shadow-sm"
                  : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900"
              }`}
              aria-pressed={on}
              data-testid={`all-patients-tab-${t.id}`}
              onClick={() => onSelectGroup(t.id)}
            >
              {t.short}
              <span className={`ml-1.5 tabular-nums ${on ? "text-brand-600" : "text-slate-400"}`}>{t.n}</span>
            </button>
          );
        })}
      </nav>
      <p className="mt-1.5 text-[11px] text-slate-500">{activeHint}</p>
    </section>
  );
}

export function AllPatientsScreen() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { chambers, current: chamber } = useChambers();
  const [filterChamberId, setFilterChamberId] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [listGroup, setListGroup] = useState<AllPatientsListGroup>("all");
  const term = q.trim();
  const isDoctor = session.tenantRole === "doctor";

  const filterChamberParam = filterChamberId || null;
  const filterFromParam = filterDateFrom.trim() || null;
  const filterToParam = filterDateTo.trim() || null;
  const { sql: filterSqlForCounts, params: filterParamsForCounts } = allPatientsFilterWhere(
    filterChamberParam,
    filterFromParam,
    filterToParam,
  );
  const countsKey = `${filterChamberParam ?? ""}|${filterFromParam ?? ""}|${filterToParam ?? ""}`;

  const { data: totalRow } = useQuery<{ n: number }>("SELECT count(*) AS n FROM patient WHERE deleted_at IS NULL", []);
  const registeredTotal = Number(totalRow[0]?.n ?? 0);

  useEffect(() => {
    void backfillMissingPatientCodes(db, session.tenantId);
  }, [db, session.tenantId]);

  useEffect(() => {
    setPage(0);
  }, [filterChamberId, filterDateFrom, filterDateTo, term, listGroup]);

  async function visit(patientId: string) {
    const doctorId = isDoctor ? session.userId : doctors[0]?.id;
    if (!doctorId) return alert("No doctor in this chamber yet.");
    const chamberId = filterChamberId || chamber?.id || null;
    const id = await startVisit(db, {
      tenantId: session.tenantId,
      userId: session.userId,
      patientId,
      doctorUserId: doctorId,
      chamberId,
      specialtyCode: doctors.find((d) => d.id === doctorId)?.specialty_code ?? "general",
      asDoctor: isDoctor,
    });
    navigate(`/visit/${id}`);
  }

  function resetFilters() {
    setFilterChamberId("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setQ("");
    setListGroup("all");
    setPage(0);
  }

  const hasDateFilter = Boolean(filterFromParam || filterToParam);
  const chamberName = chambers.find((c) => c.id === filterChamberId)?.name.replace(/\s*\n\s*/g, " ") ?? "All chambers";

  function dateRangeLabel() {
    if (!hasDateFilter) return null;
    if (filterFromParam && filterToParam) {
      return filterFromParam === filterToParam ? filterFromParam : `${filterFromParam} – ${filterToParam}`;
    }
    if (filterFromParam) return `from ${filterFromParam}`;
    return `until ${filterToParam}`;
  }
  const rangeLabel = dateRangeLabel();

  const listTabs: { id: AllPatientsListGroup; short: string; hint: string }[] = [
    { id: "all", short: "All", hint: "Everyone matching chamber and date filters above" },
    { id: "seen", short: "Seen", hint: "Prescription written at least once" },
    { id: "unseen", short: "Unseen", hint: "No prescription written yet" },
  ];
  const activeTab = listTabs.find((t) => t.id === listGroup) ?? listTabs[0]!;

  return (
    <div className="space-y-2" data-testid="all-patients">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900">All patients</h1>
          <p className="text-xs text-slate-500">
            <span className="tabular-nums font-medium text-slate-700">{registeredTotal}</span> registered · offline on this device
          </p>
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="min-w-[10rem] flex-1 text-xs text-slate-600">
            <span className="label mb-0.5 block">Chamber</span>
            <select
              className="input h-8 w-full text-sm"
              value={filterChamberId}
              onChange={(e) => setFilterChamberId(e.target.value)}
              data-testid="all-patients-chamber"
            >
              <option value="">All chambers</option>
              {chambers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.replace(/\s*\n\s*/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[9rem] text-xs text-slate-600">
            <span className="label mb-0.5 flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-slate-400" aria-hidden />
              Start date
            </span>
            <input
              type="date"
              className="input h-8 w-full text-sm"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              data-testid="all-patients-date-from"
            />
          </label>
          <label className="min-w-[9rem] text-xs text-slate-600">
            <span className="label mb-0.5 block">End date</span>
            <input
              type="date"
              className="input h-8 w-full text-sm"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              min={filterDateFrom || undefined}
              data-testid="all-patients-date-to"
            />
          </label>
          <div className="relative min-w-[12rem] flex-[2]">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="input h-8 w-full pl-7 text-sm"
              placeholder="Search name, mobile or ID"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              data-testid="all-patients-search"
            />
          </div>
          <button type="button" className="btn-ghost h-8 gap-1 px-2 text-xs text-slate-600" onClick={resetFilters} data-testid="all-patients-reset">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          {hasDateFilter
            ? `Patients with a visit, booking, or registration ${rangeLabel}${filterChamberParam ? ` at ${chamberName}` : ""}.`
            : filterChamberParam
              ? `Patients linked to ${chamberName} (any date).`
              : "Full patient directory. Narrow by chamber and/or date range above."}
          {term.length >= 2 ? ` · Search “${term}”.` : ""}
        </p>
      </section>

      <AllPatientsInsights
        filterChamberId={filterChamberParam}
        filterDateFrom={filterFromParam}
        filterDateTo={filterToParam}
      />

      <AllPatientsListTabs
        key={countsKey}
        filterSql={filterSqlForCounts}
        filterParams={filterParamsForCounts}
        listGroup={listGroup}
        onSelectGroup={setListGroup}
        activeHint={activeTab.hint}
      />

      <AllPatientsTable
        filterChamberId={filterChamberParam}
        filterDateFrom={filterFromParam}
        filterDateTo={filterToParam}
        listGroup={listGroup}
        term={term}
        page={page}
        isDoctor={isDoctor}
        onPage={setPage}
        onVisit={visit}
        activeShort={activeTab.short}
      />
    </div>
  );
}
