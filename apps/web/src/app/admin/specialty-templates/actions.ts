"use server";

import { validateTemplateSchema } from "@rx/core";
import { s } from "@rx/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

/** Publishing always creates a new version; encounters keep pointing at the version they used. */
export async function publishTemplate(_prev: unknown, form: FormData) {
  const session = await requireAdmin();
  const specialtyCode = String(form.get("specialtyCode") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const raw = String(form.get("schema") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  const errors = validateTemplateSchema(parsed);
  if (errors.length) return { errors };
  if (!specialtyCode || !name) return { errors: ["Specialty and name are required"] };
  const [vr] = (await ownerDb.execute(
    sql`select coalesce(max(version), 0) + 1 as v from specialty_template where specialty_code = ${specialtyCode} and name = ${name}`,
  )) as unknown as { v: number }[];
  const v = Number(vr?.v ?? 1);
  const [row] = await ownerDb.transaction(async (tx) => {
    // Only the newest version is active (clients sync active templates).
    await tx.update(s.specialtyTemplate).set({ isActive: false, updatedAt: new Date() }).where(and(eq(s.specialtyTemplate.specialtyCode, specialtyCode), eq(s.specialtyTemplate.name, name)));
    return tx.insert(s.specialtyTemplate).values({ specialtyCode, name, version: v, schema: JSON.stringify(parsed), source: "admin", updatedBy: session.userId }).returning({ id: s.specialtyTemplate.id });
  });
  await audit({ actorUserId: session.userId, action: "specialty_template.publish", entity: "specialty_template", entityId: row!.id, after: { specialtyCode, name, version: v } });
  revalidatePath("/admin/specialty-templates");
  redirect(`/admin/specialty-templates/${row!.id}?published=${v}`);
}

/** Add a specialty (e.g. "ophthalmology"); its pick-lists and exam template are added separately. */
export async function createSpecialty(form: FormData) {
  const session = await requireAdmin();
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const nameBn = String(form.get("nameBn") ?? "").trim() || null;
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(code) || !name) redirect("/admin/specialty-templates?error=specialty");
  const rows = await ownerDb.insert(s.specialty).values({ code, name, nameBn }).onConflictDoNothing().returning({ code: s.specialty.code });
  if (!rows.length) redirect("/admin/specialty-templates?error=exists");
  await audit({ actorUserId: session.userId, action: "specialty.create", entity: "specialty", entityId: code, after: { code, name, nameBn } });
  revalidatePath("/admin/specialty-templates");
  redirect("/admin/specialty-templates?added=" + code);
}
