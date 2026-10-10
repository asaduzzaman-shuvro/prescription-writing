import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";

/** Status, or begin setup when `?setup=1` (issues a fresh secret until confirmed). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const [user] = await ownerDb
    .select({ totpEnabledAt: s.appUser.totpEnabledAt, email: s.appUser.email, totpSecret: s.appUser.totpSecret })
    .from(s.appUser)
    .where(eq(s.appUser.id, session.userId));
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (user.totpEnabledAt) return NextResponse.json({ enabled: true });

  const setup = new URL(req.url).searchParams.get("setup") === "1";
  if (!setup) return NextResponse.json({ enabled: false });

  const secret = generateTotpSecret();
  await ownerDb.update(s.appUser).set({ totpSecret: secret, totpEnabledAt: null }).where(eq(s.appUser.id, session.userId));
  const url = totpOtpauthUrl({ secret, email: user.email });
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 200 });
  return NextResponse.json({ enabled: false, secret, otpauthUrl: url, qrDataUrl });
}

const Enable = z.object({ code: z.string().min(6).max(8), action: z.literal("enable") });
const Disable = z.object({ code: z.string().min(6).max(8), action: z.literal("disable") });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const enable = Enable.safeParse(body);
  const disable = Disable.safeParse(body);
  if (!enable.success && !disable.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const [user] = await ownerDb.select().from(s.appUser).where(eq(s.appUser.id, session.userId));
  if (!user?.totpSecret) return NextResponse.json({ error: "Start setup first" }, { status: 400 });

  if (enable.success) {
    if (!verifyTotp(user.totpSecret, enable.data.code)) return NextResponse.json({ error: "Wrong code" }, { status: 400 });
    await ownerDb.update(s.appUser).set({ totpEnabledAt: new Date() }).where(eq(s.appUser.id, session.userId));
    await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "auth.mfa.enable", entity: "app_user", entityId: session.userId });
    return NextResponse.json({ ok: true, enabled: true });
  }

  if (!user.totpEnabledAt) return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  if (!verifyTotp(user.totpSecret, disable.data!.code)) return NextResponse.json({ error: "Wrong code" }, { status: 400 });
  await ownerDb.update(s.appUser).set({ totpSecret: null, totpEnabledAt: null }).where(eq(s.appUser.id, session.userId));
  await audit({ actorUserId: session.userId, tenantId: session.tenantId, action: "auth.mfa.disable", entity: "app_user", entityId: session.userId });
  return NextResponse.json({ ok: true, enabled: false });
}
