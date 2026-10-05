import Link from "next/link";
import { PageHeader, Pager } from "@/components/ui";
import { listProducts } from "@/lib/catalogue";

export const metadata = { title: "Medicines" };

export default async function MedicinesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const { rows, hasNext } = await listProducts({ q: sp.q, status: sp.status, page });
  const base = `/admin/medicines?q=${encodeURIComponent(sp.q ?? "")}&status=${sp.status ?? "active"}`;
  return (
    <>
      <PageHeader
        title="Medicines"
        subtitle="Brand products in the shared catalogue"
        actions={<Link href="/admin/medicines/new" className="btn-primary">+ Add medicine</Link>}
      />
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Brand prefix, generic or DAR no." className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? "active"} className="input w-auto">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Brand</th><th>Form</th><th>Strength</th><th>Generic</th><th>Company</th><th>DAR</th><th>Source</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.isActive ? "" : "opacity-50"}>
                <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/medicines/${r.id}`}>{r.brandName}</Link></td>
                <td>{r.form}</td>
                <td>{r.strengthText}</td>
                <td>{r.genericText}</td>
                <td>{r.company}</td>
                <td className="text-xs">{r.darNumber ?? <span className="text-slate-400">—</span>}</td>
                <td><code className="text-xs text-slate-500">{r.source}</code></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="text-slate-500">No medicines found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasNext={hasNext} base={base} />
    </>
  );
}
