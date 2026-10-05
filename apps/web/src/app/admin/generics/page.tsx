import { s } from "@rx/db";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader, Pager } from "@/components/ui";
import { ownerDb } from "@/lib/db";

export const metadata = { title: "Generics" };
const SIZE = 50;

export default async function GenericsPage({ searchParams }: { searchParams: Promise<{ q?: string; abx?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const rows = await ownerDb
    .select({
      id: s.generic.id,
      name: s.generic.name,
      isAntibiotic: s.generic.isAntibiotic,
      awareGroup: s.generic.awareGroup,
      isActive: s.generic.isActive,
      brands: sql<number>`(select count(distinct product_id)::int from product_ingredient pi where pi.generic_id = ${s.generic.id})`,
      classes: sql<string>`(select string_agg(dc.name, ', ') from generic_drug_class gdc join drug_class dc on dc.id = gdc.drug_class_id where gdc.generic_id = ${s.generic.id})`,
    })
    .from(s.generic)
    .where(and(sp.q ? ilike(s.generic.name, `%${sp.q}%`) : undefined, sp.abx ? eq(s.generic.isAntibiotic, true) : undefined))
    .orderBy(asc(s.generic.name))
    .limit(SIZE + 1)
    .offset((page - 1) * SIZE);
  return (
    <>
      <PageHeader title="Generics" subtitle="Ingredients, drug classes, antibiotic stewardship and dose limits" />
      <form className="mb-3 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search generic" className="input max-w-xs" />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="abx" value="1" defaultChecked={!!sp.abx} /> Antibiotics only</label>
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Generic</th><th>Class</th><th>Antibiotic</th><th>Brands</th></tr></thead>
          <tbody>
            {rows.slice(0, SIZE).map((g) => (
              <tr key={g.id} className={g.isActive ? "" : "opacity-50"}>
                <td><Link className="font-medium text-brand-700 hover:underline" href={`/admin/generics/${g.id}`}>{g.name}</Link></td>
                <td className="text-slate-600">{g.classes}</td>
                <td>{g.isAntibiotic && <span className="badge bg-red-50 text-red-700">ABX{g.awareGroup ? ` · ${g.awareGroup}` : ""}</span>}</td>
                <td className="tabular-nums">{g.brands}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasNext={rows.length > SIZE} base={`/admin/generics?q=${encodeURIComponent(sp.q ?? "")}${sp.abx ? "&abx=1" : ""}`} />
    </>
  );
}
