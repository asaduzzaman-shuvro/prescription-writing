import { s } from "@rx/db";
import { asc, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Doctors & chambers" };

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
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
    .where(filter === "unverified" ? isNull(s.doctorProfile.bmdcVerifiedAt) : undefined)
    .orderBy(asc(s.doctorProfile.nameEn));
  const today = new Date().toISOString().slice(0, 10);
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
            {rows.map((r) => {
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
          </tbody>
        </table>
      </div>
    </>
  );
}
