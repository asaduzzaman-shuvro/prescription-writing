"use server";

import { s } from "@rx/db";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

const ProductInput = z.object({
  id: z.string().uuid().optional(),
  brandName: z.string().trim().min(1, "Brand name is required"),
  formId: z.string().uuid("Choose a dosage form"),
  companyId: z.string().uuid("Choose a company"),
  strengthText: z.string().trim().optional(),
  darNumber: z.string().trim().optional(),
  medicineSystem: z.enum(["allopathic", "herbal", "ayurvedic", "unani", "homeopathic"]),
  isActive: z.boolean(),
  ingredients: z
    .array(
      z.object({
        genericId: z.string().uuid(),
        strengthValue: z.string().trim().optional(),
        strengthUnit: z.string().trim().optional(),
        basis: z.string().trim().optional(),
      }),
    )
    .min(1, "Add at least one generic"),
  packs: z.array(
    z.object({
      description: z.string().trim().min(1),
      packSize: z.string().trim().optional(),
      mrp: z.string().trim().optional(),
      govtFixed: z.boolean().default(false),
    }),
  ),
});

export type ProductInputT = z.infer<typeof ProductInput>;

export async function saveProduct(input: ProductInputT): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const parsed = ProductInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const dar = d.darNumber || null;
  if (dar) {
    const clash = await ownerDb
      .select({ id: s.brandProduct.id, brandName: s.brandProduct.brandName })
      .from(s.brandProduct)
      .where(eq(s.brandProduct.darNumber, dar));
    if (clash[0] && clash[0].id !== d.id) return { error: `DAR ${dar} is already used by ${clash[0].brandName}` };
  }
  const generics = await ownerDb
    .select({ id: s.generic.id, name: s.generic.name })
    .from(s.generic)
    .where(inArray(s.generic.id, d.ingredients.map((i) => i.genericId)));
  const nameOf = new Map(generics.map((g) => [g.id, g.name]));
  const genericText = d.ingredients.map((i) => nameOf.get(i.genericId) ?? "").join(" + ");
  const today = new Date().toISOString().slice(0, 10);

  const id = await ownerDb.transaction(async (tx) => {
    const before = d.id ? (await tx.select().from(s.brandProduct).where(eq(s.brandProduct.id, d.id)))[0] : undefined;
    const values = {
      brandName: d.brandName,
      formId: d.formId,
      companyId: d.companyId,
      strengthText: d.strengthText || null,
      darNumber: dar,
      medicineSystem: d.medicineSystem,
      isActive: d.isActive,
      discontinuedAt: d.isActive ? null : (before?.discontinuedAt ?? new Date()),
      genericText,
      updatedAt: new Date(),
      updatedBy: session.userId,
    };
    let productId = d.id;
    if (productId) {
      await tx.update(s.brandProduct).set(values).where(eq(s.brandProduct.id, productId));
    } else {
      const [row] = await tx.insert(s.brandProduct).values({ ...values, source: "admin" }).returning({ id: s.brandProduct.id });
      productId = row!.id;
    }
    await tx.delete(s.productIngredient).where(eq(s.productIngredient.productId, productId));
    await tx.insert(s.productIngredient).values(
      d.ingredients.map((i, position) => ({
        productId: productId!,
        position,
        genericId: i.genericId,
        strengthValue: i.strengthValue || null,
        strengthUnit: i.strengthUnit || null,
        basis: i.basis || null,
      })),
    );
    await tx.delete(s.productPack).where(eq(s.productPack.productId, productId));
    if (d.packs.length)
      await tx.insert(s.productPack).values(
        d.packs.map((p) => ({
          productId: productId!,
          description: p.description,
          packSize: p.packSize || null,
          mrp: p.mrp || null,
          govtFixed: p.govtFixed,
          priceDate: today,
          priceSource: "admin",
        })),
      );
    await audit({
      actorUserId: session.userId,
      action: d.id ? "catalogue.product.update" : "catalogue.product.create",
      entity: "brand_product",
      entityId: productId,
      before: before ?? null,
      after: { ...values, ingredients: d.ingredients, packs: d.packs },
    });
    return productId;
  });
  revalidatePath("/admin/medicines");
  redirect(`/admin/medicines/${id}?saved=1`);
}

/** Autocomplete for the generic picker. */
export async function searchGenerics(q: string) {
  await requireAdmin();
  if (q.trim().length < 2) return [];
  return ownerDb
    .select({ id: s.generic.id, name: s.generic.name })
    .from(s.generic)
    .where(and(ilike(s.generic.name, `%${q.trim()}%`), eq(s.generic.isActive, true)))
    .orderBy(asc(sql`length(${s.generic.name})`))
    .limit(15);
}

/** Create a generic inline from the product form. */
export async function createGeneric(name: string) {
  const session = await requireAdmin();
  const clean = name.trim();
  if (!clean) return { error: "Name required" };
  const existing = await ownerDb.select({ id: s.generic.id, name: s.generic.name }).from(s.generic).where(eq(sql`lower(${s.generic.name})`, clean.toLowerCase()));
  if (existing[0]) return existing[0];
  const [g] = await ownerDb.insert(s.generic).values({ name: clean, source: "admin", updatedBy: session.userId }).returning({ id: s.generic.id, name: s.generic.name });
  await audit({ actorUserId: session.userId, action: "catalogue.generic.create", entity: "generic", entityId: g!.id, after: { name: clean } });
  return g!;
}
