import { s } from "@rx/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { connection } from "next/server";
import { Empty, PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { ComplaintReviewActions } from "./review-actions";

export const metadata = { title: "Doctor C/C lines" };
const SIZE = 50;

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Not shared" },
  { key: "approved", label: "Shared" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const DONE: Record<string, string> = {
  shared: "Shared: every doctor gets the line on their next sync.",
  replaced: "Replaced: every doctor now sees the new text instead of the original.",
  rejected: "Not shared: the line stays private to the doctor, who sees your note.",
};

function filterHref(filter: Filter) {
  return filter === "pending" ? "/admin/complaint-requests" : `/admin/complaint-requests?status=${filter}`;
}

const original = alias(s.complaint, "original");
const doctorSpecialty = alias(s.specialty, "doctor_specialty");

export default async function ComplaintRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; done?: string }> }) {
  await connection();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filter: Filter = FILTERS.some((f) => f.key === sp.status) ? (sp.status as Filter) : "pending";
  const dc = s.doctorComplaint;
  // A line the doctor removed is no longer waiting for review.
  const where = filter === "all" ? undefined : filter === "pending" ? and(eq(dc.status, "pending"), eq(dc.isActive, true)) : eq(dc.status, filter);

  const [rows, counts] = await Promise.all([
    ownerDb
      .select({
        id: dc.id,
        name: dc.name,
        nameBn: dc.nameBn,
        isActive: dc.isActive,
        status: dc.status,
        reviewNote: dc.reviewNote,
        original: original.name,
        doctor: sql<string>`coalesce(${s.doctorProfile.nameEn}, ${s.appUser.name})`,
        specialtyCode: doctorSpecialty.code,
        specialtyName: doctorSpecialty.name,
        clinic: s.tenant.name,
        updatedAt: dc.updatedAt,
      })
      .from(dc)
      .innerJoin(s.appUser, eq(s.appUser.id, dc.ownerUserId))
      .innerJoin(s.tenant, eq(s.tenant.id, dc.tenantId))
      .leftJoin(s.doctorProfile, eq(s.doctorProfile.userId, dc.ownerUserId))
      .leftJoin(doctorSpecialty, eq(doctorSpecialty.code, s.doctorProfile.specialtyCode))
      .leftJoin(original, eq(original.id, dc.replacesComplaintId))
      .where(where)
      .orderBy(filter === "pending" ? dc.updatedAt : desc(dc.updatedAt))
      .limit(SIZE + 1)
      .offset((page - 1) * SIZE),
    ownerDb
      .select({
        status: dc.status,
        n: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${dc.isActive})::int`,
      })
      .from(dc)
      .groupBy(dc.status),
  ]);
  const countOf = (k: Filter) =>
    k === "all" ? counts.reduce((a, c) => a + c.n, 0) : k === "pending" ? (counts.find((c) => c.status === k)?.active ?? 0) : (counts.find((c) => c.status === k)?.n ?? 0);

  return (
    <>
      <PageHeader
        title="Doctor C/C lines"
        subtitle="Chief-complaint lines doctors added or edited, like “Fever for 3 days”. Only the doctor sees one until you share it with all doctors."
      />
      {sp.done && DONE[sp.done] && <div className="mb-3 rounded-md bg-green-50 p-2 text-sm text-green-800">{DONE[sp.done]}</div>}
      <nav className="mb-2 flex flex-wrap gap-1.5" aria-label="Status">
        {FILTERS.map((f) => (
          <Link key={f.key} href={filterHref(f.key)} className={f.key === filter ? "btn-primary" : "btn-secondary"} aria-current={f.key === filter ? "page" : undefined}>
            {f.label} <span className="tabular-nums opacity-75">{countOf(f.key)}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>No {filter === "all" ? "" : FILTERS.find((f) => f.key === filter)!.label.toLowerCase()} C/C lines.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table" data-testid="complaint-requests">
            <thead>
              <tr>
                <th>C/C line</th>
                <th>Doctor</th>
                <th>Updated</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SIZE).map((r) => (
                <tr key={r.id} data-testid={`complaint-request-${r.name}`}>
                  <td>
                    <div className="font-medium">
                      {r.name} {r.nameBn && <span className="text-xs font-normal text-slate-500">{r.nameBn}</span>}
                    </div>
                    {r.original && <div className="text-xs text-slate-500">Edit of shared “{r.original}”</div>}
                  </td>
                  <td>
                    {r.doctor}
                    <div className="text-xs text-slate-500">
                      {r.clinic}
                      {r.specialtyName ? ` · ${r.specialtyName}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{r.updatedAt.toLocaleDateString("en-GB")}</td>
                  <td>
                    <span className={`badge ${r.status === "pending" ? "bg-amber-50 text-amber-800" : r.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {r.status === "rejected" ? "not shared" : r.status === "approved" ? "shared" : "pending"}
                    </span>
                    {!r.isActive && <span className="badge ml-1 bg-slate-100 text-slate-500">removed by doctor</span>}
                    {r.reviewNote && <div className="text-xs text-slate-500">{r.reviewNote}</div>}
                  </td>
                  <td>
                    {r.status !== "approved" && r.isActive && (
                      <ComplaintReviewActions
                        request={{
                          id: r.id,
                          name: r.name,
                          nameBn: r.nameBn,
                          original: r.original,
                          doctorSpecialty: r.specialtyCode && r.specialtyName ? { code: r.specialtyCode, name: r.specialtyName } : null,
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} hasNext={rows.length > SIZE} base={filterHref(filter)} />
    </>
  );
}
