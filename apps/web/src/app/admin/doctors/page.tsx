import { s } from "@rx/db";
import { asc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { connection } from "next/server";

export const metadata = { title: "Doctors & chambers" };
const SIZE = 50;

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  await connection();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const unverified = sp.filter === "unverified";
  const rows = await ownerDb
    .select({
      tenantId: s.tenant.id,
      tenantName: s.tenant.name,
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
    .where(unverified ? isNull(s.doctorProfile.bmdcVerifiedAt) : undefined)
    .orderBy(asc(s.doctorProfile.nameEn), asc(s.doctorProfile.userId))
    .limit(SIZE + 1)
    .offset((page - 1) * SIZE);
  const shown = rows.slice(0, SIZE);
  const today = new Date().toISOString().slice(0, 10);
  const base = unverified ? "/admin/doctors?filter=unverified" : "/admin/doctors";
  return (
    <>
      <PageHeader title="Doctors & chambers" subtitle="Onboarding, BMDC verification and chamber status" actions={<Link href="/admin/doctors/new" className="btn-primary">+ Onboard doctor</Link>} />
      <div className="mb-2 flex gap-3 text-sm">
        <Link href="/admin/doctors" className="underline">All</Link>
        <Link href="/admin/doctors?filter=unverified" className="underline">BMDC unverified</Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Doctor</th><th>Chamber / tenant</th><th>BMDC</th><th>Verification</th><th>Specialty</th><th>Final Rx</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const expired = r.bmdcExpiry && r.bmdcExpiry < today;
              return (
                <tr key={r.userId}>
                  <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/doctors/${r.tenantId}`}>{r.nameEn}</Link></td>
                  <td>{r.tenantName}</td>
                  <td>{r.bmdcNumber}{r.bmdcExpiry && <div className={`text-xs ${expired ? "text-red-600" : "text-slate-500"}`}>{expired ? "Expired " : "Valid to "}{r.bmdcExpiry}</div>}</td>
                  <td>{r.verifiedAt ? <span className="badge bg-green-50 text-green-700">Verified</span> : <span className="badge bg-amber-50 text-amber-800">Pending</span>}</td>
                  <td>{r.specialty}</td>
                  <td className="tabular-nums">{r.rxCount}</td>
                  <td>{r.status}</td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} className="text-slate-500">No doctors on this page.</td></tr>}
          </tbody>
        </table>
      </div>
      {(page > 1 || rows.length > SIZE) && <Pager page={page} hasNext={rows.length > SIZE} base={base} />}
    </>
  );
}
