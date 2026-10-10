import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { syncSinceDate } from "@/lib/sync-window";
import { assertTenantWritable, TenantAccessError } from "@/lib/tenant-access";

export const runtime = "nodejs";

/** Short-lived JWT for the PowerSync service; tenant_id + sync_since drive the sync streams. */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await assertTenantWritable(session.tenantId);
  } catch (e) {
    if (e instanceof TenantAccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const secret = Buffer.from(process.env.POWERSYNC_JWT_SECRET ?? "", "base64url");
  if (secret.length < 32) return NextResponse.json({ error: "POWERSYNC_JWT_SECRET not configured" }, { status: 500 });
  const sync_since = syncSinceDate();
  const token = await new SignJWT({
    tenant_id: session.tenantId,
    role: session.tenantRole,
    sync_since,
  })
    .setProtectedHeader({ alg: "HS256", kid: process.env.POWERSYNC_JWT_KID ?? "powersync-dev" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setAudience("rxpad")
    .setExpirationTime("30m")
    .sign(secret);
  return NextResponse.json({
    token,
    endpoint: process.env.POWERSYNC_URL ?? "http://localhost:8080",
    syncSince: sync_since,
  });
}
