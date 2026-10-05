import "server-only";
import { s } from "@rx/db";
import { eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { audit } from "./audit";
import { ownerDb } from "./db";

export const PLANS = {
  starter: { name: "Starter", monthly: 700, smsIncluded: 0 },
  pro: { name: "Pro", monthly: 1500, smsIncluded: 200 },
} as const;
export type PlanKey = keyof typeof PLANS;

/** Yearly = 10 months' price. */
export function planPrice(plan: PlanKey, months: number): number {
  const m = PLANS[plan].monthly;
  return months >= 12 ? Math.round((m * 10 * months) / 12) : m * months;
}

export const newTranId = () => `RX${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;

/** Mark a payment paid and extend the tenant's plan from max(today, current expiry). Idempotent per payment. */
export async function settlePayment(paymentId: string, opts: { gatewayRef?: string; payload?: unknown; actorUserId?: string | null }) {
  return ownerDb.transaction(async (tx) => {
    const [p] = await tx.select().from(s.subscriptionPayment).where(eq(s.subscriptionPayment.id, paymentId)).for("update");
    if (!p) throw new Error("payment not found");
    if (p.status === "paid") return p;
    await tx
      .update(s.subscriptionPayment)
      .set({ status: "paid", paidAt: new Date(), gatewayRef: opts.gatewayRef ?? p.gatewayRef, gatewayPayload: opts.payload ?? p.gatewayPayload })
      .where(eq(s.subscriptionPayment.id, paymentId));
    const included = PLANS[p.plan as PlanKey]?.smsIncluded ?? 0;
    await tx.execute(sql`
      update tenant set plan = ${p.plan}, status = 'active', updated_at = now(),
             sms_credits = sms_credits + ${included * p.months},
             plan_expires_at = (greatest(coalesce(plan_expires_at, current_date), current_date) + make_interval(months => ${p.months}))::date
       where id = ${p.tenantId}::uuid`);
    await audit({ actorUserId: opts.actorUserId ?? null, tenantId: p.tenantId, action: "billing.payment.paid", entity: "subscription_payment", entityId: p.id, after: { plan: p.plan, months: p.months, amount: p.amount, method: p.method } });
    return p;
  });
}
