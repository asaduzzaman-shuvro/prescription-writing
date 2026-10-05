import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/** Short-lived JWT for the PowerSync service; tenant_id drives the per-tenant sync stream. */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const secret = Buffer.from(process.env.POWERSYNC_JWT_SECRET ?? "", "base64url");
  if (secret.length < 32) return NextResponse.json({ error: "POWERSYNC_JWT_SECRET not configured" }, { status: 500 });
  const token = await new SignJWT({ tenant_id: session.tenantId, role: session.tenantRole })
    .setProtectedHeader({ alg: "HS256", kid: process.env.POWERSYNC_JWT_KID ?? "powersync-dev" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setAudience("rxpad")
    .setExpirationTime("30m")
    .sign(secret);
  return NextResponse.json({ token, endpoint: process.env.POWERSYNC_URL ?? "http://localhost:8080" });
}
