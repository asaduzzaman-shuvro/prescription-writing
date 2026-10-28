"use server";

import { searchProducts, s } from "@rx/db";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { clearCompanyOptionCache } from "@/lib/catalogue";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// Approving a request as a new product goes through saveProduct (../medicines/actions.ts) with its requestId.

const Uuid = z.string().uuid();

/** Catalogue products to merge a request into. */
export async function searchMergeTargets(q: string) {
  await requireAdmin();
  const hits = await searchProducts(ownerDb, q, 15);
  return hits.map((h) => ({
    id: h.id,
    name: [h.formLabel, h.brandName, h.strengthText, `— ${h.genericText}`, h.companyName ? `(${h.companyName})` : null].filter(Boolean).join(" "),
  }));
}

/** The doctor's medicine is already in the catalogue: point the request at that product. */
export async function mergeRequest(requestId: string, productId: string): Promise<{ error?: string }> {
  const session = await requireAdmin();
  if (!Uuid.safeParse(requestId).success || !Uuid.safeParse(productId).success) return { error: "Invalid input" };
  const [product] = await ownerDb
    .select({ id: s.brandProduct.id, isActive: s.brandProduct.isActive })
    .from(s.brandProduct)
    .where(eq(s.brandProduct.id, productId));
  if (!product?.isActive) return { error: "Choose an active catalogue medicine" };
  const updated = await ownerDb
    .update(s.customMedicine)
    .set({ status: "approved", approvedProductId: productId, reviewNote: null, reviewedBy: session.userId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.customMedicine.id, requestId), ne(s.customMedicine.status, "approved")))
    .returning({ tenantId: s.customMedicine.tenantId });
  if (!updated[0]) return { error: "This request is already approved" };
  await audit({
    actorUserId: session.userId,
    tenantId: updated[0].tenantId,
    action: "catalogue.custom_medicine.merge",
    entity: "custom_medicine",
    entityId: requestId,
    after: { productId },
  });
  revalidatePath("/admin/medicine-requests");
  redirect("/admin/medicine-requests?done=merged");
}

/** Not approved: the medicine stays private to the doctor, who sees the note. It can still be approved later. */
export async function rejectRequest(requestId: string, note: string): Promise<{ error?: string }> {
  const session = await requireAdmin();
  if (!Uuid.safeParse(requestId).success) return { error: "Invalid input" };
  const reviewNote = note.trim().slice(0, 500) || null;
  const updated = await ownerDb
    .update(s.customMedicine)
    .set({ status: "rejected", reviewNote, reviewedBy: session.userId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.customMedicine.id, requestId), ne(s.customMedicine.status, "approved")))
    .returning({ tenantId: s.customMedicine.tenantId });
  if (!updated[0]) return { error: "This request is already approved" };
  await audit({
    actorUserId: session.userId,
    tenantId: updated[0].tenantId,
    action: "catalogue.custom_medicine.reject",
    entity: "custom_medicine",
    entityId: requestId,
    after: { reviewNote },
  });
  revalidatePath("/admin/medicine-requests");
  redirect("/admin/medicine-requests?done=rejected");
}

/** Adds the company a doctor typed in, so the request can be approved with it. */
export async function createRequestCompany(formData: FormData) {
  const session = await requireAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!Uuid.safeParse(requestId).success || !name) return;
  const [c] = await ownerDb.insert(s.company).values({ name, source: "admin", updatedBy: session.userId }).onConflictDoNothing().returning({ id: s.company.id });
  if (c) await audit({ actorUserId: session.userId, action: "catalogue.company.create", entity: "company", entityId: c.id, after: { name } });
  clearCompanyOptionCache();
  revalidatePath(`/admin/medicine-requests/${requestId}`);
}
