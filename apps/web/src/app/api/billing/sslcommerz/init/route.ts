import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { newTranId, planPrice, PLANS, type PlanKey } from "@/lib/billing";
import { ownerDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { initSession, sslczConfigured } from "@/lib/sslcommerz";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tenantId || !["doctor", "clinic_admin"].includes(session.tenantRole ?? "")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!sslczConfigured()) return NextResponse.json({ error: "Online payment is not configured yet. Pay by bKash/bank and RxPad support will record it." }, { status: 503 });
  const body = z.object({ plan: z.enum(Object.keys(PLANS) as [PlanKey]), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const amount = planPrice(body.data.plan, body.data.months);
  const tranId = newTranId();
  await ownerDb.insert(s.subscriptionPayment).values({ tenantId: session.tenantId, plan: body.data.plan, months: body.data.months, amount: String(amount), method: "sslcommerz", tranId, recordedBy: session.userId });
  const [u] = await ownerDb.select({ phone: s.appUser.phone }).from(s.appUser).where(eq(s.appUser.id, session.userId));
  try {
    const r = await initSession({
      tranId, amount, productName: `RxPad ${PLANS[body.data.plan].name} × ${body.data.months} month(s)`,
      customer: { name: session.name, email: session.email, phone: u?.phone ?? "" }, baseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
    });
    return NextResponse.json({ url: r.GatewayPageURL });
  } catch (e) {
    await ownerDb.update(s.subscriptionPayment).set({ status: "failed", gatewayPayload: { error: (e as Error).message } }).where(eq(s.subscriptionPayment.tranId, tranId));
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
