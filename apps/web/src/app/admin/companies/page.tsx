import { s } from "@rx/db";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PageHeader, Pager } from "@/components/ui";
import { audit } from "@/lib/audit";
import { clearCompanyOptionCache } from "@/lib/catalogue";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { connection } from "next/server";

export const metadata = { title: "Companies" };
const SIZE = 50;

async function addCompany(form: FormData) {
  "use server";
  const session = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const [c] = await ownerDb.insert(s.company).values({ name, source: "admin", updatedBy: session.userId }).onConflictDoNothing().returning({ id: s.company.id });
  if (c) await audit({ actorUserId: session.userId, action: "catalogue.company.create", entity: "company", entityId: c.id, after: { name } });
  clearCompanyOptionCache();
  revalidatePath("/admin/companies");
}

async function toggleCompany(form: FormData) {
  "use server";
  const session = await requireAdmin();
  const id = String(form.get("id"));
  const [c] = await ownerDb.update(s.company).set({ isActive: sql`not ${s.company.isActive}`, updatedAt: new Date(), updatedBy: session.userId }).where(eq(s.company.id, id)).returning();
  await audit({ actorUserId: session.userId, action: "catalogue.company.toggle", entity: "company", entityId: id, after: { isActive: c?.isActive } });
  clearCompanyOptionCache();
  revalidatePath("/admin/companies");
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await connection();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const q = sp.q?.trim();
  const rows = await ownerDb
    .select({
      id: s.company.id,
      name: s.company.name,
      isActive: s.company.isActive,
      products: sql<number>`count(${s.brandProduct.id})::int`,
    })
    .from(s.company)
    .leftJoin(s.brandProduct, eq(s.brandProduct.companyId, s.company.id))
    .where(q ? ilike(s.company.name, `%${q}%`) : undefined)
    .groupBy(s.company.id, s.company.name, s.company.isActive)
    .orderBy(asc(s.company.name), asc(s.company.id))
    .limit(SIZE + 1)
    .offset((page - 1) * SIZE);
  const shown = rows.slice(0, SIZE);
  return (
    <>
      <PageHeader title="Companies" subtitle="Manufacturers and marketers" />
      <div className="mb-3 flex flex-wrap gap-4">
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="input" /><button className="btn-secondary">Search</button></form>
        <form action={addCompany} className="flex gap-2"><input name="name" placeholder="New company name" className="input" required /><button className="btn-primary">Add</button></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Company</th><th>Products</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={c.isActive ? "" : "opacity-50"}>
                <td>{c.name}</td>
                <td className="tabular-nums">{c.products}</td>
                <td>{c.isActive ? "Active" : "Inactive"}</td>
                <td><form action={toggleCompany}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost text-xs">{c.isActive ? "Deactivate" : "Activate"}</button></form></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className="text-slate-500">No companies on this page.</td></tr>}
          </tbody>
        </table>
      </div>
      {(page > 1 || rows.length > SIZE) && <Pager page={page} hasNext={rows.length > SIZE} base={`/admin/companies?q=${encodeURIComponent(q ?? "")}`} />}
    </>
  );
}
