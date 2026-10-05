import { s, withTenant } from "@rx/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { appDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { sendTenantSms, smsCountForPrescription } from "@/lib/sms-send";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Sign in again" }, { status: 401 });
  const body = z.object({ prescriptionId: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const ctx = { tenantId: session.tenantId, userId: session.userId };
  const data = await withTenant(appDb, ctx, async (tx) => {
    const [rx] = await tx.select().from(s.prescription).where(eq(s.prescription.id, body.data.prescriptionId));
    if (!rx) return null;
    const [p] = await tx.select({ name: s.patient.name, mobile: s.patient.mobile }).from(s.patient).where(eq(s.patient.id, rx.patientId));
    const [d] = await tx.select({ nameBn: s.doctorProfile.nameBn, nameEn: s.doctorProfile.nameEn }).from(s.doctorProfile).where(eq(s.doctorProfile.userId, rx.doctorUserId));
    return { rx, p, d };
  });
  if (!data?.rx || data.rx.status !== "final" || !data.rx.verifyToken) return NextResponse.json({ error: "Prescription not synced or not final yet" }, { status: 409 });
  if (!data.p?.mobile) return NextResponse.json({ error: "Patient has no mobile number" }, { status: 422 });
  if ((await smsCountForPrescription(session.tenantId, session.userId, data.rx.id)) >= 3) return NextResponse.json({ error: "Already sent 3 times" }, { status: 429 });
  const url = `${process.env.PUBLIC_BASE_URL ?? "http://localhost:3000"}/v/${data.rx.verifyToken}`;
  const text = `${data.d?.nameBn ?? data.d?.nameEn ?? "ডাক্তার"} এর প্রেসক্রিপশন: ${url}`;
  const res = await sendTenantSms({ ...ctx, to: data.p.mobile, body: text, prescriptionId: data.rx.id });
  return res.ok ? NextResponse.json({ ok: true, segments: res.segments }) : NextResponse.json({ error: res.error }, { status: 422 });
}
