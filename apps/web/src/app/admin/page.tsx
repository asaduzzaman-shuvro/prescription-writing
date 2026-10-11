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
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader title="Dashboard" subtitle="Medicine catalogue and chamber overview" />
      {devSeed > 0 && (
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">
          <b>{devSeed.toLocaleString()}</b> products come from the MedEx-derived Kaggle dev seed. This data must be
          replaced by licensed or DGDA data before production.
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Products" value={products.toLocaleString()} href="/admin/medicines" accent="border-l-4 border-l-brand-500" />
        <Stat label="Active" value={active.toLocaleString()} accent="border-l-4 border-l-green-500" />
        <Stat label="Generics" value={generics.toLocaleString()} href="/admin/generics" accent="border-l-4 border-l-brand-500" />
        <Stat label="Companies" value={companies.toLocaleString()} href="/admin/companies" accent="border-l-4 border-l-brand-500" />
        <Stat label="Chambers" value={tenants.toLocaleString()} href="/admin/doctors" accent="border-l-4 border-l-blue-500" />
        <Stat label="BMDC unverified" value={unverified.toLocaleString()} href="/admin/doctors?filter=unverified" accent="border-l-4 border-l-amber-500" />
      </div>
      <div className="mt-3 grid min-h-0 flex-1 items-stretch gap-1.5 lg:grid-cols-3">
        <div className="card flex min-h-0 flex-col overflow-hidden lg:col-span-2">
          <div className="border-b border-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-700">Recent imports</div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="table">
              <thead>
                <tr><th>When</th><th>File</th><th>Source</th><th>Result</th></tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const sm = j.summary as Record<string, number>;
                  return (
                    <tr key={j.id}>
                      <td className="whitespace-nowrap">{j.createdAt.toLocaleString("en-GB")}</td>
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
        </div>
        <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-1 lg:grid-rows-3">
          <Link href="/admin/import" className="card flex flex-col justify-center px-3 py-2.5 hover:border-brand-300">
            <div className="text-sm font-medium text-slate-900">Import catalogue</div>
            <p className="mt-0.5 text-xs text-slate-500">Load a licensed CSV into the medicine list.</p>
          </Link>
          <Link href="/admin/medicines/new" className="card flex flex-col justify-center px-3 py-2.5 hover:border-brand-300">
            <div className="text-sm font-medium text-slate-900">Add a medicine</div>
            <p className="mt-0.5 text-xs text-slate-500">Create one brand product by hand.</p>
          </Link>
          <Link href="/admin/doctors/new" className="card flex flex-col justify-center px-3 py-2.5 hover:border-brand-300">
            <div className="text-sm font-medium text-slate-900">Onboard a chamber</div>
            <p className="mt-0.5 text-xs text-slate-500">Create a clinic and its first doctor login.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
