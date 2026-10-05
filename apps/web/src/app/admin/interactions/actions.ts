"use server";

import { s } from "@rx/db";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function searchGenericOptions(q: string) {
  await requireAdmin();
  if (q.trim().length < 2) return [];
  return ownerDb.select({ id: s.generic.id, name: s.generic.name }).from(s.generic).where(and(ilike(s.generic.name, `%${q.trim()}%`), eq(s.generic.isActive, true))).orderBy(asc(sql`length(${s.generic.name})`)).limit(15);
}

const Input = z.object({
  a: z.string().uuid(),
  b: z.string().uuid(),
  severity: z.enum(["minor", "moderate", "major", "contraindicated"]),
  effect: z.string().trim().min(3),
  management: z.string().trim().optional(),
  reviewedBy: z.string().trim().min(2, "Record who reviewed this (pharmacist / clinician)"),
});

export async function saveInteraction(input: z.input<typeof Input>): Promise<{ error?: string }> {
  const session = await requireAdmin();
  const p = Input.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message };
  if (p.data.a === p.data.b) return { error: "Pick two different generics" };
  // Store each pair once, ordered (matches the CHECK constraint and the client lookup).
  const [genericA, genericB] = [p.data.a, p.data.b].sort();
  const values = { genericA: genericA!, genericB: genericB!, severity: p.data.severity, effect: p.data.effect, management: p.data.management || null, reviewedBy: p.data.reviewedBy, source: "admin", updatedBy: session.userId, updatedAt: new Date(), isActive: true };
  const [row] = await ownerDb
    .insert(s.genericInteraction)
    .values(values)
    .onConflictDoUpdate({ target: [s.genericInteraction.genericA, s.genericInteraction.genericB], set: values })
    .returning({ id: s.genericInteraction.id });
  await audit({ actorUserId: session.userId, action: "catalogue.interaction.save", entity: "generic_interaction", entityId: row!.id, after: values });
  revalidatePath("/admin/interactions");
  return {};
}

export async function toggleInteraction(form: FormData) {
  const session = await requireAdmin();
  const id = String(form.get("id"));
  await ownerDb.update(s.genericInteraction).set({ isActive: sql`not ${s.genericInteraction.isActive}`, updatedAt: new Date(), updatedBy: session.userId }).where(eq(s.genericInteraction.id, id));
  await audit({ actorUserId: session.userId, action: "catalogue.interaction.toggle", entity: "generic_interaction", entityId: id });
  revalidatePath("/admin/interactions");
}
