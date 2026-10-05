"use server";

import { s } from "@rx/db";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

const GenericInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  synonyms: z.string(),
  isAntibiotic: z.boolean(),
  awareGroup: z.enum(["access", "watch", "reserve", ""]),
  pregnancyCategory: z.string().trim(),
  paedMaxMgPerKgDay: z.string().trim(),
  adultMaxMgPerDay: z.string().trim(),
  classes: z.string(),
  isActive: z.boolean(),
});

const num = (v: string) => (v && Number.isFinite(Number(v)) ? v : null);

export async function saveGeneric(_prev: unknown, form: FormData) {
  const session = await requireAdmin();
  const parsed = GenericInput.safeParse({
    id: form.get("id"),
    name: form.get("name"),
    synonyms: form.get("synonyms") ?? "",
    isAntibiotic: form.get("isAntibiotic") === "on",
    awareGroup: form.get("awareGroup") ?? "",
    pregnancyCategory: form.get("pregnancyCategory") ?? "",
    paedMaxMgPerKgDay: form.get("paedMaxMgPerKgDay") ?? "",
    adultMaxMgPerDay: form.get("adultMaxMgPerDay") ?? "",
    classes: form.get("classes") ?? "",
    isActive: form.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const [before] = await ownerDb.select().from(s.generic).where(eq(s.generic.id, d.id));
  const values = {
    name: d.name,
    synonyms: d.synonyms.split(",").map((x) => x.trim()).filter(Boolean),
    isAntibiotic: d.isAntibiotic,
    awareGroup: d.awareGroup || null,
    pregnancyCategory: d.pregnancyCategory || null,
    paedMaxMgPerKgDay: num(d.paedMaxMgPerKgDay),
    adultMaxMgPerDay: num(d.adultMaxMgPerDay),
    isActive: d.isActive,
    updatedAt: new Date(),
    updatedBy: session.userId,
  };
  await ownerDb.transaction(async (tx) => {
    await tx.update(s.generic).set(values).where(eq(s.generic.id, d.id));
    // Keep denormalised generic_text on brand products in sync after a rename.
    if (before && before.name !== d.name) {
      await tx.execute(sql`
        update brand_product p set generic_text = sub.txt, updated_at = now()
          from (select pi.product_id, string_agg(g.name, ' + ' order by pi.position) txt
                  from product_ingredient pi join generic g on g.id = pi.generic_id
                 where pi.product_id in (select product_id from product_ingredient where generic_id = ${d.id})
                 group by pi.product_id) sub
         where p.id = sub.product_id`);
    }
    const names = d.classes.split(",").map((x) => x.trim()).filter(Boolean);
    await tx.delete(s.genericDrugClass).where(eq(s.genericDrugClass.genericId, d.id));
    for (const name of names) {
      await tx.insert(s.drugClass).values({ name, source: "admin" }).onConflictDoNothing();
      const [c] = await tx.select({ id: s.drugClass.id }).from(s.drugClass).where(eq(sql`lower(${s.drugClass.name})`, name.toLowerCase()));
      if (c) await tx.insert(s.genericDrugClass).values({ genericId: d.id, drugClassId: c.id }).onConflictDoNothing();
    }
  });
  await audit({ actorUserId: session.userId, action: "catalogue.generic.update", entity: "generic", entityId: d.id, before, after: { ...values, classes: d.classes } });
  revalidatePath(`/admin/generics/${d.id}`);
  return { ok: true };
}
