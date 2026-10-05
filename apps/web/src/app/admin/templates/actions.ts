"use server";

import type { RxItem } from "@rx/core";
import { s, searchProducts } from "@rx/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export async function findProducts(q: string) {
  await requireAdmin();
  return searchProducts(ownerDb, q, 15);
}

export interface SharedTemplateInput {
  id?: string;
  name: string;
  specialtyCode: string | null;
  chiefComplaints: string[];
  investigations: string[];
  diagnoses: string[];
  advice: string[];
  items: RxItem[];
  isActive: boolean;
}

export async function saveSharedTemplate(input: SharedTemplateInput): Promise<{ error?: string }> {
  const session = await requireAdmin();
  if (!input.name.trim()) return { error: "Name is required" };
  if (!input.items.length && !input.advice.length) return { error: "Add medicines or advice" };
  const payload = {
    chiefComplaints: input.chiefComplaints,
    investigations: input.investigations,
    diagnoses: input.diagnoses,
    advice: input.advice,
    items: input.items,
  };
  const id = input.id ?? randomUUID();
  if (input.id) {
    await ownerDb
      .update(s.rxTemplate)
      .set({ name: input.name.trim(), specialtyCode: input.specialtyCode, payload, isActive: input.isActive, updatedAt: new Date() })
      .where(eq(s.rxTemplate.id, input.id));
  } else {
    await ownerDb.insert(s.rxTemplate).values({ id, tenantId: null, ownerUserId: null, name: input.name.trim(), specialtyCode: input.specialtyCode, payload, isActive: input.isActive });
  }
  await audit({ actorUserId: session.userId, action: input.id ? "template.shared.update" : "template.shared.create", entity: "rx_template", entityId: id, after: { name: input.name, items: input.items.length } });
  revalidatePath("/admin/templates");
  redirect("/admin/templates");
}
