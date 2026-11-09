"use server";

import { doctorComplaintProblem } from "@rx/core";
import { s } from "@rx/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

const Uuid = z.string().uuid();
const PATH = "/admin/complaint-requests";

export interface ShareInput {
  name: string;
  nameBn: string;
  /** null = all specialties. */
  specialtyCode: string | null;
}

function clean(input: { name: string; nameBn: string }) {
  const name = input.name.trim();
  const nameBn = input.nameBn.trim() || null;
  return { name, nameBn, problem: doctorComplaintProblem({ name, name_bn: nameBn }) };
}

/**
 * Shares a doctor's line with every doctor: it becomes a shared complaint under the request's own id (so sharing it
 * again after the doctor changed it updates the same shared line). The doctor's line takes the shared text, so they
 * see it once.
 */
export async function shareComplaint(requestId: string, input: ShareInput): Promise<{ error?: string }> {
  const session = await requireAdmin();
  if (!Uuid.safeParse(requestId).success) return { error: "Invalid input" };
  const { name, nameBn, problem } = clean(input);
  if (problem) return { error: problem };
  const specialtyCode = input.specialtyCode || null;
  if (specialtyCode) {
    const [sp] = await ownerDb.select({ code: s.specialty.code }).from(s.specialty).where(eq(s.specialty.code, specialtyCode));
    if (!sp) return { error: "Unknown specialty" };
  }
  const tenantId = await ownerDb.transaction(async (tx) => {
    const [r] = await tx
      .select({ tenantId: s.doctorComplaint.tenantId, status: s.doctorComplaint.status })
      .from(s.doctorComplaint)
      .where(eq(s.doctorComplaint.id, requestId))
      .for("update");
    if (!r || r.status === "approved") return null;
    const [{ next } = { next: 0 }] = await tx
      .select({ next: sql<number>`coalesce(max(${s.complaint.sortOrder}), 0) + 1` })
      .from(s.complaint);
    await tx
      .insert(s.complaint)
      .values({ id: requestId, name, nameBn, specialtyCode, sortOrder: next, source: "doctor", sourceRef: requestId, updatedBy: session.userId })
      .onConflictDoUpdate({
        target: s.complaint.id,
        set: { name, nameBn, specialtyCode, isActive: true, updatedAt: new Date(), updatedBy: session.userId },
      });
    await tx
      .update(s.doctorComplaint)
      .set({ name, nameBn, status: "approved", approvedComplaintId: requestId, reviewNote: null, reviewedBy: session.userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.doctorComplaint.id, requestId));
    return r.tenantId;
  });
  if (!tenantId) return { error: "This line is already shared, or no longer exists" };
  await audit({
    actorUserId: session.userId,
    tenantId,
    action: "catalogue.doctor_complaint.share",
    entity: "doctor_complaint",
    entityId: requestId,
    after: { specialtyCode },
  });
  revalidatePath(PATH);
  redirect(`${PATH}?done=shared`);
}

/** The doctor's edit of a shared line replaces that line for everyone (e.g. "Fever" → "Fever for 3 days"). */
export async function replaceOriginal(requestId: string, input: { name: string; nameBn: string }): Promise<{ error?: string }> {
  const session = await requireAdmin();
  if (!Uuid.safeParse(requestId).success) return { error: "Invalid input" };
  const { name, nameBn, problem } = clean(input);
  if (problem) return { error: problem };
  const result = await ownerDb.transaction(async (tx) => {
    const [r] = await tx
      .select({ tenantId: s.doctorComplaint.tenantId, status: s.doctorComplaint.status, replaces: s.doctorComplaint.replacesComplaintId })
      .from(s.doctorComplaint)
      .where(eq(s.doctorComplaint.id, requestId))
      .for("update");
    if (!r || r.status === "approved") return { error: "This line is already shared, or no longer exists" };
    if (!r.replaces) return { error: "This line is not an edit of a shared line" };
    // source admin: the curated seed never rewrites it.
    const updated = await tx
      .update(s.complaint)
      .set({ name, nameBn, source: "admin", isActive: true, updatedAt: new Date(), updatedBy: session.userId })
      .where(eq(s.complaint.id, r.replaces))
      .returning({ id: s.complaint.id });
    if (!updated[0]) return { error: "The shared line no longer exists" };
    await tx
      .update(s.doctorComplaint)
      .set({ name, nameBn, status: "approved", approvedComplaintId: r.replaces, reviewNote: null, reviewedBy: session.userId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(s.doctorComplaint.id, requestId));
    return { tenantId: r.tenantId, complaintId: r.replaces };
  });
  if ("error" in result) return { error: result.error };
  await audit({
    actorUserId: session.userId,
    tenantId: result.tenantId,
    action: "catalogue.doctor_complaint.replace",
    entity: "doctor_complaint",
    entityId: requestId,
    after: { complaintId: result.complaintId },
  });
  revalidatePath(PATH);
  redirect(`${PATH}?done=replaced`);
}

/** Not shared: the line stays private to the doctor, who can keep using it and sees the note. */
export async function rejectComplaint(requestId: string, note: string): Promise<{ error?: string }> {
  const session = await requireAdmin();
  if (!Uuid.safeParse(requestId).success) return { error: "Invalid input" };
  const reviewNote = note.trim().slice(0, 500) || null;
  const updated = await ownerDb
    .update(s.doctorComplaint)
    .set({ status: "rejected", reviewNote, reviewedBy: session.userId, reviewedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.doctorComplaint.id, requestId), ne(s.doctorComplaint.status, "approved")))
    .returning({ tenantId: s.doctorComplaint.tenantId });
  if (!updated[0]) return { error: "This line is already shared" };
  await audit({
    actorUserId: session.userId,
    tenantId: updated[0].tenantId,
    action: "catalogue.doctor_complaint.reject",
    entity: "doctor_complaint",
    entityId: requestId,
    after: { reviewNote },
  });
  revalidatePath(PATH);
  redirect(`${PATH}?done=rejected`);
}
