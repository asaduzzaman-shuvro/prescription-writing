import { s } from "@rx/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PLANS, planPrice } from "@/lib/billing";
import { ownerDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { sslczConfigured } from "@/lib/sslcommerz";

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [t] = await ownerDb.select({ plan: s.tenant.plan, planExpiresAt: s.tenant.planExpiresAt, smsCredits: s.tenant.smsCredits }).from(s.tenant).where(eq(s.tenant.id, session.tenantId));
  const payments = await ownerDb
    .select({ createdAt: s.subscriptionPayment.createdAt, plan: s.subscriptionPayment.plan, months: s.subscriptionPayment.months, amount: s.subscriptionPayment.amount, method: s.subscriptionPayment.method, status: s.subscriptionPayment.status })
    .from(s.subscriptionPayment).where(eq(s.subscriptionPayment.tenantId, session.tenantId)).orderBy(desc(s.subscriptionPayment.createdAt)).limit(12);
  const prices = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { name: v.name, monthly: v.monthly, yearly: planPrice(k as keyof typeof PLANS, 12) }]));
  return NextResponse.json({ ...t, payments, prices, online: sslczConfigured() });
}
