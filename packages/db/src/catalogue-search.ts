import { sql } from "drizzle-orm";
import type { Db } from "./client";

export interface ProductHit {
  id: string;
  brandName: string;
  genericText: string;
  strengthText: string | null;
  formName: string | null;
  formLabel: string | null;
  defaultRoute: string | null;
  defaultUnit: string | null;
  companyName: string | null;
  isAntibiotic: boolean;
  score: number;
}

let trigram: boolean | undefined;

/** Shared cPanel has no pg_trgm. Those servers match the start of the name only. */
async function hasTrigram(db: Pick<Db, "execute">): Promise<boolean> {
  if (trigram !== undefined) return trigram;
  const found = await db.execute(sql`select 1 as ok from pg_extension where extname = 'pg_trgm' limit 1`);
  const rows = Array.isArray(found) ? found : ((found as { rows?: unknown[] }).rows ?? []);
  trigram = rows.length > 0;
  return trigram;
}

/**
 * Medicine autocomplete over brand and generic names.
 * Ranking: brand prefix, then generic prefix. With pg_trgm, a fuzzy match ranks below those.
 * Inactive products are excluded.
 */
export async function searchProducts(db: Pick<Db, "execute">, q: string, limit = 20): Promise<ProductHit[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const prefix = term.replace(/[\\%_]/g, "\\$&") + "%";
  const fuzzy = await hasTrigram(db);
  const match = fuzzy
    ? sql`lower(p.brand_name) like ${prefix}
              or lower(p.generic_text) like ${prefix}
              or lower(p.brand_name) % ${term}
              or lower(p.generic_text) % ${term}`
    : sql`lower(p.brand_name) like ${prefix} or lower(p.generic_text) like ${prefix}`;
  const score = fuzzy
    ? sql`case when lower(p.brand_name) like ${prefix} then 3
                  when lower(p.generic_text) like ${prefix} then 2
                  else greatest(similarity(lower(p.brand_name), ${term}), similarity(lower(p.generic_text), ${term}))
             end`
    : sql`case when lower(p.brand_name) like ${prefix} then 2 else 1 end`;
  const rows = await db.execute(sql`
    with hits as (
      select p.id, ${score} as score
        from brand_product p
       where p.is_active
         and (${match})
       order by score desc
       limit ${limit * 3}
    )
    select p.id, p.brand_name as "brandName", p.generic_text as "genericText", p.strength_text as "strengthText",
           f.name as "formName", f.short_label as "formLabel", f.default_route as "defaultRoute",
           f.default_unit as "defaultUnit", c.name as "companyName",
           exists (select 1 from product_ingredient pi join generic g on g.id = pi.generic_id
                    where pi.product_id = p.id and g.is_antibiotic) as "isAntibiotic",
           h.score::float as score
      from hits h
      join brand_product p on p.id = h.id
      left join dosage_form f on f.id = p.form_id
      left join company c on c.id = p.company_id
     order by h.score desc, length(p.brand_name), p.brand_name, p.strength_text
     limit ${limit}`);
  return rows as unknown as ProductHit[];
}
