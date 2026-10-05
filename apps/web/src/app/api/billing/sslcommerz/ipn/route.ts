import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/billing";
import { ownerDb } from "@/lib/db";
import { validate } from "@/lib/sslcommerz";

export const runtime = "nodejs";

/** Instant Payment Notification from SSLCommerz (server-to-server). */
export async function POST(req: Request) {
  const form = await req.formData();
  const valId = String(form.get("val_id") ?? "");
  const tranId = String(form.get("tran_id") ?? "");
  if (!valId || !tranId) return NextResponse.json({ error: "missing ids" }, { status: 400 });
  const [p] = await ownerDb.select().from(s.subscriptionPayment).where(eq(s.subscriptionPayment.tranId, tranId));
  if (!p) return NextResponse.json({ error: "unknown tran_id" }, { status: 404 });
  const v = await validate(valId);
  const valid = (v.status === "VALID" || v.status === "VALIDATED") && v.tran_id === tranId && v.currency === "BDT" && Number(v.amount) >= Number(p.amount);
  if (!valid) {
    await ownerDb.update(s.subscriptionPayment).set({ status: "failed", gatewayPayload: v }).where(eq(s.subscriptionPayment.id, p.id));
    return NextResponse.json({ ok: false });
  }
  await settlePayment(p.id, { gatewayRef: v.bank_tran_id ?? valId, payload: v });
  return NextResponse.json({ ok: true });
}
