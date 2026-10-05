import { s } from "@rx/db";
import { desc, isNull, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Admin" };

export default async function AdminDashboard() {
  const count = (t: PgTable, where?: SQL) =>
    ownerDb.select({ n: sql<number>`count(*)::int` }).from(t).where(where).then((r) => r[0]!.n);
  const [products, active, generics, companies, tenants, unverified, jobs] = await Promise.all([
    count(s.brandProduct),
    count(s.brandProduct, sql`${s.brandProduct.isActive}`),
    count(s.generic),
    count(s.company),
    count(s.tenant),
    count(s.doctorProfile, isNull(s.doctorProfile.bmdcVerifiedAt)),
    ownerDb.select().from(s.importJob).orderBy(desc(s.importJob.createdAt)).limit(5),
  ]);
  const devSeed = await ownerDb
    .select({ n: sql<number>`count(*)::int` })
    .from(s.brandProduct)
    .where(sql`${s.brandProduct.source} like 'medex-%'`)
    .then((r) => r[0]!.n);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Medicine catalogue and chamber overview" />
      {devSeed > 0 && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{devSeed.toLocaleString()}</b> products come from the MedEx-derived Kaggle dev seed. This data must be
          replaced by licensed or DGDA data before production.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Products" value={products.toLocaleString()} href="/admin/medicines" />
        <Stat label="Active" value={active.toLocaleString()} />
        <Stat label="Generics" value={generics.toLocaleString()} href="/admin/generics" />
        <Stat label="Companies" value={companies} href="/admin/companies" />
        <Stat label="Chambers" value={tenants} href="/admin/doctors" />
        <Stat label="BMDC unverified" value={unverified} href="/admin/doctors?filter=unverified" />
      </div>
      <h2 className="mb-2 mt-8 font-semibold">Recent imports</h2>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>When</th><th>File</th><th>Source</th><th>Result</th></tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const sm = j.summary as Record<string, number>;
              return (
                <tr key={j.id}>
                  <td>{j.createdAt.toLocaleString("en-GB")}</td>
                  <td>{j.filename}</td>
                  <td><code className="text-xs">{j.source}</code></td>
                  <td className="text-xs">+{sm.inserted ?? 0} new · {sm.updated ?? 0} updated · {sm.conflict ?? 0} conflicts</td>
                </tr>
              );
            })}
            {!jobs.length && (
              <tr><td colSpan={4} className="text-slate-500">No imports yet. <Link className="text-brand-600 underline" href="/admin/import">Import a CSV</Link></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
