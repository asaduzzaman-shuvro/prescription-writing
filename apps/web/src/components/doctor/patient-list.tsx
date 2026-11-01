"use client";

import { usePowerSync, useQuery } from "@powersync/react";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { startVisit, backfillMissingPatientCodes } from "@/lib/doctor/data";
import { groupCountParams, groupWhere, ORDER_BY_PATIENT_ID_ASC, todaySerialSqlEmbedded, type PatientGroup } from "@/lib/doctor/chamber-filter";
import { useSession } from "@/lib/doctor/context";
import { useChambers, useDoctors } from "@/lib/doctor/hooks";
import { Link, navigate } from "@/lib/doctor/router";
import { ageLabel, patientSearchClause, today } from "@/lib/doctor/util";
import { ListPager } from "@/components/list-pager";
import { ActiveChamberSelector } from "./active-chamber";
import type { PatientHit } from "./patient-search";

type PatientListRow = PatientHit & { serial_no: number | null };

/** Each tab is the whole group, not a shortened slice of the others. */

const PAGE = 50;

function groupFromHash(): PatientGroup {
  if (typeof window === "undefined") return "today";
  const g = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("group");
  return g === "unseen" || g === "seen" ? g : "today";
}

function patientsPath(group: PatientGroup) {
  return group === "today" ? "/patients" : `/patients?group=${group}`;
}

type PatientListTableProps = {
  group: PatientGroup;
  chamberId: string | null;
  term: string;
  page: number;
  date: string;
  isDoctor: boolean;
  onPage: (page: number) => void;
  onVisit: (patientId: string) => void;
  activeLabel: string;
  activeShort: string;
};

/** Remount when search/tab/chamber/page changes — PowerSync watch can ignore updateSettings on SQL edits. */
function PatientListTable({ group, chamberId, term, page, date, isDoctor, onPage, onVisit, activeLabel, activeShort }: PatientListTableProps) {
  const { sql: searchSql, params: searchParams } = patientSearchClause(term);
  const searching = searchSql.length > 0;
  const groupSql = groupWhere(group, date, chamberId);
  const groupParams = groupCountParams(group, date, chamberId);
  const serialSql = todaySerialSqlEmbedded(date, chamberId);
  const listParams = [...groupParams, ...searchParams, PAGE, page * PAGE];
  const { data: patientRows } = useQuery<PatientListRow>(
    `SELECT p.id, p.name, p.dob, p.sex, p.mobile, p.code,
            (SELECT MAX(visit_date) FROM encounter e WHERE e.patient_id = p.id AND e.status <> 'cancelled') AS last_visit,
            ${serialSql}
       FROM patient p
      WHERE p.deleted_at IS NULL AND ${groupSql} ${searchSql}
      ORDER BY ${ORDER_BY_PATIENT_ID_ASC}
      LIMIT ? OFFSET ?`,
    listParams,
  );
  const { data: matched } = useQuery<{ n: number }>(
    `SELECT count(*) AS n FROM patient p WHERE p.deleted_at IS NULL AND ${groupSql} ${searchSql}`,
    [...groupParams, ...searchParams],
  );
  const listTotal = Number(matched[0]?.n ?? 0);

  return (
    <>
      <p className="text-[11px] text-slate-500">
        Showing <span className="font-medium text-slate-700">{listTotal}</span> in {activeShort.toLowerCase()}
      </p>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-14">SI No</th>
                <th>ID</th>
                <th>Name</th>
                <th>Age / sex</th>
                <th>Mobile</th>
                <th>Last visit</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {patientRows.map((p) => (
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
                  <td className="tabular-nums text-slate-600">{p.last_visit ?? "—"}</td>
                  <td className="text-right">
                    <button type="button" className="btn-primary h-7 px-2 text-xs" onClick={() => void onVisit(p.id)}>
                      {isDoctor ? "Open Rx" : "Queue"}
                    </button>
                  </td>
                </tr>
              ))}
              {!patientRows.length && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-slate-500">
                    {searching ? `No match in ${activeLabel.toLowerCase()}.` : `No one in ${activeLabel.toLowerCase()}.`}
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

export function PatientList() {
  const db = usePowerSync();
  const session = useSession();
  const doctors = useDoctors();
  const { current: chamber } = useChambers();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState<PatientGroup>(groupFromHash);
  const date = today();
  const term = q.trim();
  const { sql: searchSql } = patientSearchClause(term);
  const searching = searchSql.length > 0;
  const chamberId = chamber?.id ?? null;
  const todayWhere = groupWhere("today", date, chamberId);
  const unseenWhere = groupWhere("unseen", date, chamberId);
  const seenWhere = groupWhere("seen", date, chamberId);
  const todayParams = groupCountParams("today", date, chamberId);
  const unseenParams = groupCountParams("unseen", date, chamberId);
  const seenParams = groupCountParams("seen", date, chamberId);
  const { data: counts } = useQuery<{ today_n: number; unseen_n: number; seen_n: number; n: number }>(
    `SELECT
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${todayWhere}) AS today_n,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${unseenWhere}) AS unseen_n,
        (SELECT count(*) FROM patient p WHERE p.deleted_at IS NULL AND ${seenWhere}) AS seen_n,
        (SELECT count(*) FROM patient WHERE deleted_at IS NULL) AS n`,
    [...todayParams, ...unseenParams, ...seenParams],
  );
  const tally = counts[0];
  const isDoctor = session.tenantRole === "doctor";
  const tabs: { id: PatientGroup; label: string; short: string; hint: string; n: number }[] = [
    { id: "today", label: "Current date", short: "Today", hint: chamber?.name ? `Today at this chamber (${date}), no prescription yet` : `Visiting today (${date}), no prescription yet`, n: tally?.today_n ?? 0 },
    { id: "unseen", label: "Unseen patients", short: "Unseen", hint: "Older patients without a prescription yet", n: tally?.unseen_n ?? 0 },
    { id: "seen", label: "Seen patients", short: "Seen", hint: "Patients with a prescription written", n: tally?.seen_n ?? 0 },
  ];
  const active = tabs.find((t) => t.id === group) ?? tabs[0]!;
  const listQueryKey = `${group}|${chamberId ?? ""}|${term}|${page}`;

  useEffect(() => {
    const sync = () => setGroup(groupFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    void backfillMissingPatientCodes(db, session.tenantId);
  }, [db, session.tenantId]);

  useEffect(() => {
    setPage(0);
  }, [chamberId, group, term]);

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

  function selectGroup(id: PatientGroup) {
    setGroup(id);
    setPage(0);
    navigate(patientsPath(id));
  }

  return (
    <div className="space-y-2">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900">Patients</h1>
          <p className="text-xs text-slate-500">
            <span className="tabular-nums font-medium text-slate-700">{tally?.n ?? 0}</span> registered · offline on this device
            {searching ? (
              <>
                <span className="mx-1.5 text-slate-300">·</span>
                Search <span className="font-medium text-slate-700">“{term}”</span>
              </>
            ) : null}
          </p>
        </div>
        <ActiveChamberSelector className="shrink-0 sm:ml-2" />
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <nav className="flex flex-wrap gap-1" aria-label="Patient groups" data-testid="patient-groups">
            {tabs.map((t) => {
              const on = group === t.id;
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
                  data-testid={`patient-tab-${t.id}`}
                  onClick={() => selectGroup(t.id)}
                >
                  {t.short}
                  <span className={`ml-1.5 tabular-nums ${on ? "text-brand-600" : "text-slate-400"}`}>{t.n}</span>
                </button>
              );
            })}
          </nav>
          <div className="relative w-full min-w-0 lg:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="input h-8 w-full pl-7 text-sm"
              placeholder="Search name, mobile or ID"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              data-testid="patient-list-search"
              autoFocus
            />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">{active.hint}</p>
      </section>

      <PatientListTable
        key={listQueryKey}
        group={group}
        chamberId={chamberId}
        term={term}
        page={page}
        date={date}
        isDoctor={isDoctor}
        onPage={setPage}
        onVisit={visit}
        activeLabel={active.label}
        activeShort={active.short}
      />
    </div>
  );
}
