import { sql } from "drizzle-orm";
import { ownerDb } from "@/lib/db";
import { getSession } from "@/lib/session";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Full catalogue in the standard import format (round-trips through Import CSV). */
export async function GET() {
  const s = await getSession();
  if (!s?.platformRole) return new Response("Forbidden", { status: 403 });
  const rows = (await ownerDb.execute(sql`
    select p.brand_name, p.generic_text, f.name as form, c.name as company, p.strength_text, p.dar_number,
           p.medicine_system, p.is_active, p.source_ref,
           (select string_agg(pk.description || ': ' || coalesce(pk.mrp::text, ''), '; ' order by pk.description)
              from product_pack pk where pk.product_id = p.id) as packs
      from brand_product p
      left join dosage_form f on f.id = p.form_id
      left join company c on c.id = p.company_id
     order by lower(p.brand_name), p.strength_text`)) as unknown as Record<string, unknown>[];
  const header = "brand_name,generic,dosage_form,company,strength,dar_number,medicine_system,packs,is_active,source_ref";
  const body = rows
    .map((r) =>
      [r.brand_name, r.generic_text, r.form, r.company, r.strength_text, r.dar_number, r.medicine_system, r.packs, r.is_active ? "yes" : "no", r.source_ref]
        .map(csvCell)
        .join(","),
    )
    .join("\n");
  return new Response(`${header}\n${body}\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="catalogue-export.csv"' },
  });
}
