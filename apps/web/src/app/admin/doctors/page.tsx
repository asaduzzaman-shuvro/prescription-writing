import { s } from "@rx/db";
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { connection } from "next/server";
import { DoctorsList, type DoctorListRow } from "./doctors-list";

export const metadata = { title: "Doctors & chambers" };
const SIZE = 50;

const STATUS_FILTERS = [
  { key: "", label: "All" },
  { key: "unverified", label: "BMDC unverified" },
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "suspended", label: "Inactive" },
] as const;

function filterHref(filter: string, page?: number) {
  const q = new URLSearchParams();
  if (filter) q.set("filter", filter);
  if (page && page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/admin/doctors?${s}` : "/admin/doctors";
}

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  await connection();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const filter = sp.filter ?? "";
  const unverified = filter === "unverified";
  const statusFilter = filter === "active" || filter === "pending" || filter === "suspended" ? filter : null;

  const whereParts: SQL[] = [];
  if (unverified) whereParts.push(isNull(s.doctorProfile.bmdcVerifiedAt));
  if (statusFilter) whereParts.push(eq(s.tenant.status, statusFilter));
  const whereClause = whereParts.length ? and(...whereParts) : undefined;

  const rows = await ownerDb
    .select({
      tenantId: s.tenant.id,
      tenantName: s.tenant.name,
      chamberName: sql<string | null>`(
        select c.name from chamber c
         where c.tenant_id = ${s.doctorProfile.tenantId}
           and c.doctor_user_id = ${s.doctorProfile.userId}
         order by c.created_at
         limit 1
      )`,
      status: s.tenant.status,
      userId: s.doctorProfile.userId,
      nameEn: s.doctorProfile.nameEn,
      bmdcNumber: s.doctorProfile.bmdcNumber,
      bmdcExpiry: s.doctorProfile.bmdcExpiry,
      verifiedAt: s.doctorProfile.bmdcVerifiedAt,
      specialty: s.doctorProfile.specialtyCode,
      rxCount: sql<number>`(select count(*)::int from prescription p where p.doctor_user_id = ${s.doctorProfile.userId} and p.status = 'final')`,
    })
    .from(s.doctorProfile)
    .innerJoin(s.tenant, eq(s.tenant.id, s.doctorProfile.tenantId))
    .where(whereClause)
    .orderBy(asc(s.doctorProfile.nameEn), asc(s.doctorProfile.userId))
    .limit(SIZE + 1)
    .offset((page - 1) * SIZE);

  const shown: DoctorListRow[] = rows.slice(0, SIZE).map((r) => ({
    tenantId: r.tenantId,
    chamberName: r.chamberName ?? r.tenantName,
    status: r.status,
    userId: r.userId,
    nameEn: r.nameEn,
    bmdcNumber: r.bmdcNumber,
    bmdcExpiry: r.bmdcExpiry,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
    specialty: r.specialty,
    rxCount: r.rxCount,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const base = filterHref(filter);

  return (
    <>
      <PageHeader
        title="Doctors & chambers"
        subtitle="Verify BMDC, control account status (only Active can sign in), and manage chambers"
        actions={
          <Link href="/admin/doctors/new" className="btn-primary">
            + Onboard doctor
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const on = (f.key || "") === (filter || "");
          return (
            <Link
              key={f.key || "all"}
              href={filterHref(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                on ? "bg-brand-700 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>
      <DoctorsList rows={shown} today={today} />
      {(page > 1 || rows.length > SIZE) && <Pager page={page} hasNext={rows.length > SIZE} base={base} />}
    </>
  );
}
