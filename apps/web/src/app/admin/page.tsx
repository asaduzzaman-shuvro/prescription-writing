import { s } from "@rx/db";
import { desc, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, Stat } from "@/components/ui";
import { ownerDb } from "@/lib/db";
import { connection } from "next/server";

export const metadata = { title: "Admin" };

const DASH_TTL_MS = 30_000;

interface Dash {
  at: number;
  products: number;
  active: number;
  generics: number;
  companies: number;
  tenants: number;
  unverified: number;
  devSeed: number;
  jobs: { id: string; createdAt: Date; filename: string; source: string; summary: unknown }[];
}

let dashCache: Dash | null = null;

async function loadDash(): Promise<Dash> {
  if (dashCache && Date.now() - dashCache.at < DASH_TTL_MS) return dashCache;
  const [counts, jobs] = await Promise.all([
    ownerDb.execute<{
      products: number;
      active: number;
      dev_seed: number;
      generics: number;
      companies: number;
      tenants: number;
      unverified: number;
    }>(sql`
      SELECT p.products, p.active, p.dev_seed,
             (SELECT count(*)::int FROM generic) AS generics,
             (SELECT count(*)::int FROM company) AS companies,
             (SELECT count(*)::int FROM tenant) AS tenants,
             (SELECT count(*)::int FROM doctor_profile WHERE bmdc_verified_at IS NULL) AS unverified
        FROM (
          SELECT count(*)::int AS products,
                 count(*) FILTER (WHERE is_active)::int AS active,
                 count(*) FILTER (WHERE source LIKE 'medex-%')::int AS dev_seed
            FROM brand_product
        ) p
    `),
    ownerDb
      .select({
        id: s.importJob.id,
        createdAt: s.importJob.createdAt,
        filename: s.importJob.filename,
        source: s.importJob.source,
        summary: s.importJob.summary,
      })
      .from(s.importJob)
      .orderBy(desc(s.importJob.createdAt))
      .limit(5),
  ]);
  const row = (Array.isArray(counts) ? counts[0] : undefined) ?? {
    products: 0,
    active: 0,
    dev_seed: 0,
    generics: 0,
    companies: 0,
    tenants: 0,
    unverified: 0,
  };
  const n = (v: unknown) => Number(v) || 0;
  dashCache = {
    at: Date.now(),
    products: n(row.products),
    active: n(row.active),
    generics: n(row.generics),
    companies: n(row.companies),
    tenants: n(row.tenants),
    unverified: n(row.unverified),
    devSeed: n(row.dev_seed),
    jobs,
  };
  return dashCache;
}

export default async function AdminDashboard() {
  await connection();
  const { products, active, generics, companies, tenants, unverified, devSeed, jobs } = await loadDash();

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
