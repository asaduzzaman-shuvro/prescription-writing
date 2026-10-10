import "server-only";
import { s, withTenant } from "@rx/db";
import { and, eq, sql } from "drizzle-orm";
import { appDb, ownerDb } from "./db";
import { sendSms, smsSegments, toBdMsisdn } from "./sms";
import { assertTenantWritable, TenantAccessError } from "./tenant-access";

/** Charge credits, send, and log. Credits are reserved under a row lock before send; refunded on failure. */
export async function sendTenantSms(opts: { tenantId: string; userId: string | null; to: string; body: string; prescriptionId?: string | null }) {
  const msisdn = toBdMsisdn(opts.to);
  if (!msisdn) return { ok: false as const, error: "Invalid Bangladeshi mobile number" };
  try {
    await assertTenantWritable(opts.tenantId);
  } catch (e) {
    if (e instanceof TenantAccessError) return { ok: false as const, error: e.message };
    throw e;
  }
  const segments = smsSegments(opts.body);

  const reserved = await ownerDb.transaction(async (tx) => {
    const [t] = await tx.select({ credits: s.tenant.smsCredits }).from(s.tenant).where(eq(s.tenant.id, opts.tenantId)).for("update");
    if ((t?.credits ?? 0) < segments) return null;
    await tx.update(s.tenant).set({ smsCredits: sql`${s.tenant.smsCredits} - ${segments}` }).where(eq(s.tenant.id, opts.tenantId));
    return true;
  });
  if (!reserved) return { ok: false as const, error: "Not enough SMS credit. Ask RxPad support to top up." };

  const res = await sendSms(msisdn, opts.body);
  if (!res.ok) {
    await ownerDb.update(s.tenant).set({ smsCredits: sql`${s.tenant.smsCredits} + ${segments}` }).where(eq(s.tenant.id, opts.tenantId));
  }
  await ownerDb.insert(s.smsLog).values({
    tenantId: opts.tenantId,
    prescriptionId: opts.prescriptionId ?? null,
    toNumber: msisdn,
    body: opts.body,
    provider: res.provider,
    status: res.ok ? "sent" : "failed",
    providerRef: res.ref ?? null,
    error: res.error ?? null,
    segments,
    sentBy: opts.userId,
  });
  return res.ok ? { ok: true as const, segments } : { ok: false as const, error: res.error ?? "SMS failed" };
}

export async function smsCountForPrescription(tenantId: string, userId: string, prescriptionId: string) {
  const rows = await withTenant(appDb, { tenantId, userId }, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(s.smsLog).where(and(eq(s.smsLog.prescriptionId, prescriptionId), eq(s.smsLog.status, "sent"))),
  );
  return rows[0]?.n ?? 0;
}
