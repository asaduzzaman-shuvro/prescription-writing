import { s } from "@rx/db";
import { asc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/ui";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Companies" };

async function addCompany(form: FormData) {
  "use server";
  const session = await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const [c] = await ownerDb.insert(s.company).values({ name, source: "admin", updatedBy: session.userId }).onConflictDoNothing().returning({ id: s.company.id });
  if (c) await audit({ actorUserId: session.userId, action: "catalogue.company.create", entity: "company", entityId: c.id, after: { name } });
  revalidatePath("/admin/companies");
}

async function toggleCompany(form: FormData) {
  "use server";
  const session = await requireAdmin();
  const id = String(form.get("id"));
  const [c] = await ownerDb.update(s.company).set({ isActive: sql`not ${s.company.isActive}`, updatedAt: new Date(), updatedBy: session.userId }).where(eq(s.company.id, id)).returning();
  await audit({ actorUserId: session.userId, action: "catalogue.company.toggle", entity: "company", entityId: id, after: { isActive: c?.isActive } });
  revalidatePath("/admin/companies");
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const rows = await ownerDb
    .select({
      id: s.company.id,
      name: s.company.name,
      isActive: s.company.isActive,
      products: sql<number>`(select count(*)::int from brand_product p where p.company_id = ${s.company.id})`,
    })
    .from(s.company)
    .where(q ? ilike(s.company.name, `%${q}%`) : undefined)
    .orderBy(asc(s.company.name));
  return (
    <>
      <PageHeader title="Companies" subtitle={`${rows.length} manufacturers / marketers`} />
      <div className="mb-3 flex flex-wrap gap-4">
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className="input" /><button className="btn-secondary">Search</button></form>
        <form action={addCompany} className="flex gap-2"><input name="name" placeholder="New company name" className="input" required /><button className="btn-primary">Add</button></form>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Company</th><th>Products</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={c.isActive ? "" : "opacity-50"}>
                <td>{c.name}</td>
                <td className="tabular-nums">{c.products}</td>
                <td>{c.isActive ? "Active" : "Inactive"}</td>
                <td><form action={toggleCompany}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost text-xs">{c.isActive ? "Deactivate" : "Activate"}</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
