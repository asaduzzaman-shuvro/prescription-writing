"use server";

import { hashPassword, s } from "@rx/db";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { invalidateTenantBrief } from "@/lib/tenant-access";
import { ownerDb } from "@/lib/db";
import { clearSakuraEnvTokenCache } from "@/lib/sakura/server";
import { requireAdmin } from "@/lib/session";

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const Onboard = z.object({
  tenantName: z.string().trim().min(1),
  kind: z.enum(["solo", "clinic"]),
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  nameEn: z.string().trim().min(1),
  nameBn: z.string().trim().optional(),
  bmdcNumber: z.string().trim().min(3, "BMDC number is required"),
  bmdcExpiry: z.string().trim().optional(),
  specialtyCode: z.string().min(1),
  chamberName: z.string().trim().min(1),
  chamberAddress: z.string().trim().min(1),
});

export async function onboardDoctor(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const parsed = Onboard.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;
  const exists = await ownerDb.select({ id: s.appUser.id }).from(s.appUser).where(eq(sql`lower(${s.appUser.email})`, d.email));
  if (exists[0]) return { error: "A user with this email already exists" };
  const bmdcClash = await ownerDb.select({ id: s.doctorProfile.userId }).from(s.doctorProfile).where(eq(sql`upper(${s.doctorProfile.bmdcNumber})`, d.bmdcNumber.toUpperCase()));
  if (bmdcClash[0]) return { error: "This BMDC number is already registered" };
  const tenantId = await ownerDb.transaction(async (tx) => {
    const [t] = await tx.insert(s.tenant).values({ name: d.tenantName, kind: d.kind, status: "pending" }).returning({ id: s.tenant.id });
    const [u] = await tx.insert(s.appUser).values({ email: d.email, name: d.name, phone: d.phone || null, passwordHash: await hashPassword(d.password) }).returning({ id: s.appUser.id });
    await tx.insert(s.membership).values({ tenantId: t!.id, userId: u!.id, role: "doctor" });
    await tx.insert(s.doctorProfile).values({
      userId: u!.id,
      tenantId: t!.id,
      nameEn: d.nameEn,
      nameBn: d.nameBn || null,
      degreesEn: list(form.get("degreesEn")),
      degreesBn: list(form.get("degreesBn")),
      designation: String(form.get("designation") ?? "") || null,
      institution: String(form.get("institution") ?? "") || null,
      specialtyCode: d.specialtyCode,
      bmdcNumber: d.bmdcNumber,
      bmdcExpiry: d.bmdcExpiry || null,
    });
    await tx.insert(s.chamber).values({ tenantId: t!.id, doctorUserId: u!.id, name: d.chamberName, address: d.chamberAddress, printSettings: {} });
    return t!.id;
  });
  await audit({ actorUserId: session.userId, tenantId, action: "tenant.onboard", entity: "tenant", entityId: tenantId, after: { ...d, password: undefined } });
  redirect(`/admin/doctors/${tenantId}`);
}

export async function verifyBmdc(form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const userId = String(form.get("userId"));
  const verified = form.get("verified") === "1";
  const [p] = await ownerDb
    .update(s.doctorProfile)
    .set({ bmdcVerifiedAt: verified ? new Date() : null, bmdcVerifiedBy: verified ? session.userId : null, updatedAt: new Date() })
    .where(eq(s.doctorProfile.userId, userId))
    .returning();
  await audit({ actorUserId: session.userId, tenantId: p?.tenantId, action: verified ? "doctor.bmdc.verify" : "doctor.bmdc.unverify", entity: "doctor_profile", entityId: userId, after: { bmdcNumber: p?.bmdcNumber } });
  revalidatePath("/admin/doctors");
  revalidatePath(`/admin/doctors/${p?.tenantId}`);
}

export async function setTenantStatus(form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const tenantId = String(form.get("tenantId"));
  const status = z.enum(["pending", "active", "suspended"]).parse(form.get("status"));
  await ownerDb.update(s.tenant).set({ status, updatedAt: new Date() }).where(eq(s.tenant.id, tenantId));
  invalidateTenantBrief(tenantId);
  await audit({ actorUserId: session.userId, tenantId, action: "tenant.status", entity: "tenant", entityId: tenantId, after: { status } });
  revalidatePath(`/admin/doctors/${tenantId}`);
  revalidatePath("/admin/doctors");
}

export async function saveDoctorProfile(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const userId = String(form.get("userId"));
  const [before] = await ownerDb.select().from(s.doctorProfile).where(eq(s.doctorProfile.userId, userId));
  if (!before) return { error: "Not found" };
  const bmdcNumber = String(form.get("bmdcNumber") ?? "").trim();
  const values = {
    nameEn: String(form.get("nameEn") ?? "").trim() || before.nameEn,
    nameBn: String(form.get("nameBn") ?? "").trim() || null,
    degreesEn: list(form.get("degreesEn")),
    degreesBn: list(form.get("degreesBn")),
    designation: String(form.get("designation") ?? "").trim() || null,
    institution: String(form.get("institution") ?? "").trim() || null,
    specialtyCode: String(form.get("specialtyCode") ?? before.specialtyCode),
    specialtyLabel: String(form.get("specialtyLabel") ?? "").trim() || null,
    bmdcNumber: bmdcNumber || before.bmdcNumber,
    bmdcExpiry: String(form.get("bmdcExpiry") ?? "") || null,
    updatedAt: new Date(),
  };
  // Changing BMDC number or degrees invalidates the previous verification.
  const reverify = values.bmdcNumber !== before.bmdcNumber || values.degreesEn.join() !== before.degreesEn.join();
  await ownerDb
    .update(s.doctorProfile)
    .set({ ...values, ...(reverify ? { bmdcVerifiedAt: null, bmdcVerifiedBy: null } : {}) })
    .where(eq(s.doctorProfile.userId, userId));
  await audit({ actorUserId: session.userId, tenantId: before.tenantId, action: "doctor.profile.update", entity: "doctor_profile", entityId: userId, before, after: values });
  revalidatePath(`/admin/doctors/${before.tenantId}`);
  return { ok: true, reverify };
}

export async function addMember(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const tenantId = String(form.get("tenantId"));
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = z.enum(["clinic_admin", "doctor", "assistant"]).parse(form.get("role"));
  if (!email || !name || password.length < 8) return { error: "Name, email and an 8+ character password are required" };
  const [existing] = await ownerDb.select({ id: s.appUser.id }).from(s.appUser).where(eq(sql`lower(${s.appUser.email})`, email));
  const userId =
    existing?.id ??
    (await ownerDb.insert(s.appUser).values({ email, name, passwordHash: await hashPassword(password) }).returning({ id: s.appUser.id }))[0]!.id;
  const [dup] = await ownerDb.select().from(s.membership).where(and(eq(s.membership.tenantId, tenantId), eq(s.membership.userId, userId)));
  if (dup) return { error: "Already a member" };
  await ownerDb.insert(s.membership).values({ tenantId, userId, role });
  await audit({ actorUserId: session.userId, tenantId, action: "tenant.member.add", entity: "membership", entityId: userId, after: { email, role } });
  revalidatePath(`/admin/doctors/${tenantId}`);
  return { ok: true };
}

export async function resetPassword(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const userId = String(form.get("userId"));
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "At least 8 characters" };
  await ownerDb.update(s.appUser).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(s.appUser.id, userId));
  await audit({ actorUserId: session.userId, action: "user.password.reset", entity: "app_user", entityId: userId });
  return { ok: true };
}

const ManualPayment = z.object({
  tenantId: z.string().uuid(),
  plan: z.enum(["starter", "pro"]),
  months: z.coerce.number().int().min(1).max(36),
  amount: z.coerce.number().positive(),
  method: z.enum(["bkash", "nagad", "cash", "bank"]),
  reference: z.string().trim().min(3, "Enter the bKash/Nagad TrxID or bank reference"),
});

/** Record an offline payment (bKash/Nagad send-money, cash, bank) and extend the plan. */
export async function recordPayment(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const p = ManualPayment.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const { newTranId, settlePayment } = await import("@/lib/billing");
  const [row] = await ownerDb
    .insert(s.subscriptionPayment)
    .values({ tenantId: p.data.tenantId, plan: p.data.plan, months: p.data.months, amount: String(p.data.amount), method: p.data.method, tranId: newTranId(), gatewayRef: p.data.reference, recordedBy: session.userId })
    .returning({ id: s.subscriptionPayment.id });
  await settlePayment(row!.id, { gatewayRef: p.data.reference, actorUserId: session.userId });
  revalidatePath(`/admin/doctors/${p.data.tenantId}`);
  return { ok: true };
}

export async function deleteDoctorChamber(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const tenantId = String(form.get("tenantId"));
  const userId = String(form.get("userId"));
  const [profile] = await ownerDb.select().from(s.doctorProfile).where(and(eq(s.doctorProfile.tenantId, tenantId), eq(s.doctorProfile.userId, userId)));
  if (!profile) return { error: "Doctor not found" };
  const [counts] = await ownerDb.execute<{ patients: number; rx: number }>(sql`
    select (select count(*)::int from patient where tenant_id = ${tenantId}) as patients,
           (select count(*)::int from prescription where tenant_id = ${tenantId}) as rx
  `);
  const row = (Array.isArray(counts) ? counts[0] : counts) as { patients: number; rx: number } | undefined;
  if ((row?.patients ?? 0) > 0 || (row?.rx ?? 0) > 0) {
    return { error: "This chamber has patients or prescriptions. Set status to Inactive instead of deleting." };
  }
  await ownerDb.transaction(async (tx) => {
    await tx.delete(s.appointment).where(eq(s.appointment.tenantId, tenantId));
    await tx.delete(s.smsLog).where(eq(s.smsLog.tenantId, tenantId));
    await tx.delete(s.chamber).where(eq(s.chamber.tenantId, tenantId));
    await tx.delete(s.doctorProfile).where(eq(s.doctorProfile.tenantId, tenantId));
    await tx.delete(s.membership).where(eq(s.membership.tenantId, tenantId));
    await tx.delete(s.subscriptionPayment).where(eq(s.subscriptionPayment.tenantId, tenantId));
    await tx.delete(s.rxTemplate).where(eq(s.rxTemplate.tenantId, tenantId));
    await tx.delete(s.auditLog).where(eq(s.auditLog.tenantId, tenantId));
    await tx.delete(s.tenant).where(eq(s.tenant.id, tenantId));
  });
  invalidateTenantBrief(tenantId);
  await audit({
    actorUserId: session.userId,
    tenantId,
    action: "tenant.delete",
    entity: "tenant",
    entityId: tenantId,
    before: { name: profile.nameEn, userId },
  });
  revalidatePath("/admin/doctors");
  return { ok: true };
}

export async function addSmsCredits(form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const tenantId = String(form.get("tenantId"));
  const credits = Math.trunc(Number(form.get("credits")));
  if (!credits) return;
  await ownerDb.update(s.tenant).set({ smsCredits: sql`greatest(0, ${s.tenant.smsCredits} + ${credits})`, updatedAt: new Date() }).where(eq(s.tenant.id, tenantId));
  await audit({ actorUserId: session.userId, tenantId, action: "billing.sms_credits", entity: "tenant", entityId: tenantId, after: { credits } });
  revalidatePath(`/admin/doctors/${tenantId}`);
}

const SakuraCreds = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().min(8, "Sakura phone is required"),
  password: z.string().min(1, "Sakura password is required"),
});

/** Save or replace this doctor's Sakura Web phone + password (admin-managed). */
export async function saveSakuraCredentials(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const parsed = SakuraCreds.safeParse({
    userId: form.get("userId"),
    phone: form.get("phone"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { userId, phone, password } = parsed.data;
  const [before] = await ownerDb
    .select({
      tenantId: s.doctorProfile.tenantId,
      sakuraPhone: s.doctorProfile.sakuraPhone,
    })
    .from(s.doctorProfile)
    .where(eq(s.doctorProfile.userId, userId));
  if (!before) return { error: "Doctor not found" };
  await ownerDb
    .update(s.doctorProfile)
    .set({ sakuraPhone: phone, sakuraPassword: password, updatedAt: new Date() })
    .where(eq(s.doctorProfile.userId, userId));
  clearSakuraEnvTokenCache(userId);
  await audit({
    actorUserId: session.userId,
    tenantId: before.tenantId,
    action: before.sakuraPhone ? "doctor.sakura.update" : "doctor.sakura.add",
    entity: "doctor_profile",
    entityId: userId,
    after: { sakuraPhone: phone, sakuraPassword: "[set]" },
  });
  revalidatePath("/admin/doctors");
  revalidatePath(`/admin/doctors/${before.tenantId}`);
  return { ok: true };
}

/** Clear Sakura Web credentials for this doctor. */
export async function deleteSakuraCredentials(_prev: unknown, form: FormData) {
  const session = await requireAdmin({ superOnly: true });
  const userId = String(form.get("userId") ?? "");
  if (!z.string().uuid().safeParse(userId).success) return { error: "Invalid doctor" };
  const [before] = await ownerDb
    .select({
      tenantId: s.doctorProfile.tenantId,
      sakuraPhone: s.doctorProfile.sakuraPhone,
    })
    .from(s.doctorProfile)
    .where(eq(s.doctorProfile.userId, userId));
  if (!before) return { error: "Doctor not found" };
  await ownerDb
    .update(s.doctorProfile)
    .set({ sakuraPhone: null, sakuraPassword: null, updatedAt: new Date() })
    .where(eq(s.doctorProfile.userId, userId));
  clearSakuraEnvTokenCache(userId);
  await audit({
    actorUserId: session.userId,
    tenantId: before.tenantId,
    action: "doctor.sakura.delete",
    entity: "doctor_profile",
    entityId: userId,
    before: { sakuraPhone: before.sakuraPhone },
  });
  revalidatePath("/admin/doctors");
  revalidatePath(`/admin/doctors/${before.tenantId}`);
  return { ok: true };
}
