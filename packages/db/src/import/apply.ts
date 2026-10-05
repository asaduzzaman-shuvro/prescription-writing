import { classifyDosageForm } from "@rx/core";
import { eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Db } from "../client";
import { auditLog, brandProduct, company, dosageForm, generic, importJob, productIngredient, productPack } from "../schema";
import { clean, type NormalizedProduct } from "./normalize";
import { genericTextOf, type CatalogueSnapshot, type ImportPlan } from "./plan";

const lower = (s: string) => clean(s).toLowerCase();

function chunks<T>(arr: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Load the in-memory snapshot used by buildPlan(). ~30k products fits comfortably. */
export async function loadSnapshot(db: Db): Promise<CatalogueSnapshot> {
  const [companies, forms, generics, products, packs] = await Promise.all([
    db.select({ id: company.id, name: company.name }).from(company),
    db.select({ id: dosageForm.id, name: dosageForm.name }).from(dosageForm),
    db.select({ id: generic.id, name: generic.name }).from(generic),
    db
      .select({
        id: brandProduct.id,
        brandName: brandProduct.brandName,
        formName: sql<string>`coalesce(${dosageForm.name}, '')`,
        companyName: sql<string>`coalesce(${company.name}, '')`,
        strengthText: brandProduct.strengthText,
        darNumber: brandProduct.darNumber,
        medicineSystem: brandProduct.medicineSystem,
        isActive: brandProduct.isActive,
        genericText: brandProduct.genericText,
      })
      .from(brandProduct)
      .leftJoin(dosageForm, eq(dosageForm.id, brandProduct.formId))
      .leftJoin(company, eq(company.id, brandProduct.companyId)),
    db.select({ productId: productPack.productId, description: productPack.description, mrp: productPack.mrp }).from(productPack),
  ]);
  const packsBy = new Map<string, { description: string; mrp: number | null }[]>();
  for (const p of packs) {
    const list = packsBy.get(p.productId) ?? [];
    list.push({ description: p.description, mrp: p.mrp === null ? null : Number(p.mrp) });
    packsBy.set(p.productId, list);
  }
  return {
    companies: new Map(companies.map((c) => [lower(c.name), c.id])),
    forms: new Map(forms.map((f) => [lower(f.name), f.id])),
    generics: new Map(generics.map((g) => [lower(g.name), g.id])),
    products: products.map((p) => ({ ...p, packs: packsBy.get(p.id) ?? [] })),
  };
}

export interface ApplyOptions {
  source: string;
  filename: string;
  actorUserId?: string;
  /** Price date recorded on imported packs (defaults to today). */
  priceDate?: string;
}

export interface ApplyResult {
  jobId: string;
  inserted: number;
  updated: number;
  skippedConflicts: number;
  createdCompanies: number;
  createdForms: number;
  createdGenerics: number;
}

/** Commit a plan. Conflicts and unchanged rows are skipped. Nothing is ever hard-deleted. */
export async function applyPlan(db: Db, plan: ImportPlan, opts: ApplyOptions): Promise<ApplyResult> {
  const priceDate = opts.priceDate ?? new Date().toISOString().slice(0, 10);
  return db.transaction(async (tx) => {
    const now = new Date();

    // 1. Reference data (companies, forms, generics).
    const companyIds = new Map<string, string>();
    const formIds = new Map<string, string>();
    const genericIds = new Map<string, string>();
    const prov = { source: opts.source, updatedBy: opts.actorUserId ?? null };

    for (const part of chunks(plan.newCompanies)) {
      if (part.length) await tx.insert(company).values(part.map((name) => ({ name, ...prov }))).onConflictDoNothing();
    }
    for (const part of chunks(plan.newForms)) {
      if (part.length)
        await tx
          .insert(dosageForm)
          .values(
            part.map((name) => {
              const d = classifyDosageForm(name);
              return { name, shortLabel: d.shortLabel, defaultRoute: d.route, defaultUnit: d.unit, ...prov };
            }),
          )
          .onConflictDoNothing();
    }
    for (const part of chunks(plan.newGenerics)) {
      if (part.length) await tx.insert(generic).values(part.map((name) => ({ name, ...prov }))).onConflictDoNothing();
    }
    for (const c of await tx.select({ id: company.id, name: company.name }).from(company)) companyIds.set(lower(c.name), c.id);
    for (const f of await tx.select({ id: dosageForm.id, name: dosageForm.name }).from(dosageForm)) formIds.set(lower(f.name), f.id);
    for (const g of await tx.select({ id: generic.id, name: generic.name }).from(generic)) genericIds.set(lower(g.name), g.id);

    const productValues = (p: NormalizedProduct) => ({
      brandName: p.brandName,
      formId: formIds.get(lower(p.dosageForm))!,
      companyId: companyIds.get(lower(p.company))!,
      strengthText: p.strengthText ?? null,
      darNumber: p.darNumber ?? null,
      medicineSystem: p.medicineSystem,
      genericText: genericTextOf(p),
      isActive: p.isActive,
      discontinuedAt: p.isActive ? null : now,
      source: opts.source,
      sourceRef: p.sourceRef ?? null,
      updatedAt: now,
      updatedBy: opts.actorUserId ?? null,
    });

    const childRows = (productId: string, p: NormalizedProduct) => ({
      ingredients: p.ingredients.map((ing, position) => ({
        productId,
        position,
        genericId: genericIds.get(lower(ing.generic))!,
        strengthValue: ing.strengthValue === undefined ? null : String(ing.strengthValue),
        strengthUnit: ing.strengthUnit ?? null,
        basis: ing.basis ?? null,
      })),
      packs: p.packs.map((pk) => ({
        productId,
        description: pk.description,
        packSize: pk.packSize ?? null,
        mrp: pk.mrp === undefined ? null : String(pk.mrp),
        priceDate,
        priceSource: opts.source,
      })),
    });

    // 2. New products.
    const news = plan.rows.filter((r) => r.kind === "new");
    const ingredientRows: ReturnType<typeof childRows>["ingredients"] = [];
    const packRows: ReturnType<typeof childRows>["packs"] = [];
    const productRows = news.map((r) => {
      const id = randomUUID();
      const c = childRows(id, r.product);
      ingredientRows.push(...c.ingredients);
      packRows.push(...c.packs);
      return { id, ...productValues(r.product) };
    });
    for (const part of chunks(productRows)) if (part.length) await tx.insert(brandProduct).values(part);

    // 3. Changed products: update in place, replace ingredients/packs (only when the file has packs).
    const changed = plan.rows.filter((r) => r.kind === "changed");
    for (const r of changed) {
      await tx.update(brandProduct).set(productValues(r.product)).where(eq(brandProduct.id, r.existingId));
      const c = childRows(r.existingId, r.product);
      ingredientRows.push(...c.ingredients);
      if (r.product.packs.length) packRows.push(...c.packs);
    }
    const changedIds = changed.map((r) => r.existingId);
    for (const part of chunks(changedIds)) {
      if (!part.length) continue;
      await tx.delete(productIngredient).where(inArray(productIngredient.productId, part));
      const withPacks = changed.filter((r) => r.product.packs.length && part.includes(r.existingId)).map((r) => r.existingId);
      if (withPacks.length) await tx.delete(productPack).where(inArray(productPack.productId, withPacks));
    }
    for (const part of chunks(ingredientRows)) if (part.length) await tx.insert(productIngredient).values(part);
    for (const part of chunks(packRows)) if (part.length) await tx.insert(productPack).values(part);

    // 4. Job + audit trail.
    const result = {
      inserted: news.length,
      updated: changed.length,
      skippedConflicts: plan.summary.conflict,
      createdCompanies: plan.newCompanies.length,
      createdForms: plan.newForms.length,
      createdGenerics: plan.newGenerics.length,
    };
    const [job] = await tx
      .insert(importJob)
      .values({
        kind: "medicine_csv",
        filename: opts.filename,
        source: opts.source,
        status: "committed",
        summary: { ...plan.summary, ...result },
        createdBy: opts.actorUserId ?? null,
        committedAt: now,
      })
      .returning({ id: importJob.id });
    await tx.insert(auditLog).values({
      actorUserId: opts.actorUserId ?? null,
      action: "catalogue.import",
      entity: "import_job",
      entityId: job!.id,
      after: { filename: opts.filename, source: opts.source, ...result },
    });
    return { jobId: job!.id, ...result };
  });
}
