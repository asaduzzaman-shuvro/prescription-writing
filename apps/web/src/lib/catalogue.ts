import "server-only";
import { s } from "@rx/db";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { ownerDb } from "./db";

export const PAGE_SIZE = 50;

const OPTION_TTL_MS = 60_000;
let formCache: { at: number; rows: { id: string; name: string }[] } | null = null;
let companyCache: { at: number; rows: { id: string; name: string }[] } | null = null;

export function clearCompanyOptionCache() {
  companyCache = null;
}

export async function listProducts(opts: { q?: string; status?: string; page: number }) {
  const q = opts.q?.trim();
  const needle = q ? q.toLowerCase().replace(/[\\%_]/g, "\\$&") : "";
  const where = and(
    q
      ? or(
          sql`lower(${s.brandProduct.brandName}) like ${needle + "%"}`,
          sql`lower(${s.brandProduct.genericText}) like ${"%" + needle + "%"}`,
          eq(s.brandProduct.darNumber, q),
        )
      : undefined,
    opts.status === "inactive" ? eq(s.brandProduct.isActive, false) : opts.status === "all" ? undefined : eq(s.brandProduct.isActive, true),
  );
  const rows = await ownerDb
    .select({
      id: s.brandProduct.id,
      brandName: s.brandProduct.brandName,
      strengthText: s.brandProduct.strengthText,
      genericText: s.brandProduct.genericText,
      darNumber: s.brandProduct.darNumber,
      isActive: s.brandProduct.isActive,
      source: s.brandProduct.source,
      form: s.dosageForm.name,
      company: s.company.name,
    })
    .from(s.brandProduct)
    .leftJoin(s.dosageForm, eq(s.dosageForm.id, s.brandProduct.formId))
    .leftJoin(s.company, eq(s.company.id, s.brandProduct.companyId))
    .where(where)
    .orderBy(asc(sql`lower(${s.brandProduct.brandName})`), asc(s.brandProduct.strengthText))
    .limit(PAGE_SIZE + 1)
    .offset((opts.page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}

export async function getProduct(id: string) {
  const [p] = await ownerDb.select().from(s.brandProduct).where(eq(s.brandProduct.id, id));
  if (!p) return null;
  const ingredients = await ownerDb
    .select({
      position: s.productIngredient.position,
      genericId: s.productIngredient.genericId,
      genericName: s.generic.name,
      strengthValue: s.productIngredient.strengthValue,
      strengthUnit: s.productIngredient.strengthUnit,
      basis: s.productIngredient.basis,
    })
    .from(s.productIngredient)
    .innerJoin(s.generic, eq(s.generic.id, s.productIngredient.genericId))
    .where(eq(s.productIngredient.productId, id))
    .orderBy(asc(s.productIngredient.position));
  const packs = await ownerDb.select().from(s.productPack).where(eq(s.productPack.productId, id));
  return { ...p, ingredients, packs };
}

export async function formOptions() {
  if (formCache && Date.now() - formCache.at < OPTION_TTL_MS) return formCache.rows;
  const rows = await ownerDb
    .select({ id: s.dosageForm.id, name: s.dosageForm.name })
    .from(s.dosageForm)
    .where(eq(s.dosageForm.isActive, true))
    .orderBy(asc(s.dosageForm.name));
  formCache = { at: Date.now(), rows };
  return rows;
}

export async function companyOptions() {
  if (companyCache && Date.now() - companyCache.at < OPTION_TTL_MS) return companyCache.rows;
  const rows = await ownerDb
    .select({ id: s.company.id, name: s.company.name })
    .from(s.company)
    .where(eq(s.company.isActive, true))
    .orderBy(asc(s.company.name));
  companyCache = { at: Date.now(), rows };
  return rows;
}

export async function genericNamesByIds(ids: string[]) {
  if (!ids.length) return [];
  return ownerDb.select({ id: s.generic.id, name: s.generic.name }).from(s.generic).where(inArray(s.generic.id, ids));
}
