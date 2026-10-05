import "server-only";
import { s, withTenant } from "@rx/db";
import { and, eq, sql } from "drizzle-orm";
import { appDb, ownerDb } from "./db";
import { sendSms, smsSegments, toBdMsisdn } from "./sms";

/** Charge credits, send, and log. Credits are only consumed for successful sends. */
export async function sendTenantSms(opts: { tenantId: string; userId: string | null; to: string; body: string; prescriptionId?: string | null }) {
  const msisdn = toBdMsisdn(opts.to);
  if (!msisdn) return { ok: false as const, error: "Invalid Bangladeshi mobile number" };
  const segments = smsSegments(opts.body);
  const [t] = await ownerDb.select({ credits: s.tenant.smsCredits }).from(s.tenant).where(eq(s.tenant.id, opts.tenantId));
  if ((t?.credits ?? 0) < segments) return { ok: false as const, error: "Not enough SMS credit. Ask RxPad support to top up." };
  const res = await sendSms(msisdn, opts.body);
  await ownerDb.transaction(async (tx) => {
    if (res.ok) await tx.update(s.tenant).set({ smsCredits: sql`${s.tenant.smsCredits} - ${segments}` }).where(eq(s.tenant.id, opts.tenantId));
    await tx.insert(s.smsLog).values({
      tenantId: opts.tenantId, prescriptionId: opts.prescriptionId ?? null, toNumber: msisdn, body: opts.body, provider: res.provider,
      status: res.ok ? "sent" : "failed", providerRef: res.ref ?? null, error: res.error ?? null, segments, sentBy: opts.userId,
    });
  });
  return res.ok ? { ok: true as const, segments } : { ok: false as const, error: res.error ?? "SMS failed" };
}

export async function smsCountForPrescription(tenantId: string, userId: string, prescriptionId: string) {
  const rows = await withTenant(appDb, { tenantId, userId }, (tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(s.smsLog).where(and(eq(s.smsLog.prescriptionId, prescriptionId), eq(s.smsLog.status, "sent"))),
  );
  return rows[0]?.n ?? 0;
}
