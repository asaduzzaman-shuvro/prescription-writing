import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { pullSnapshot } from "@/lib/sync-pull";
import { assertTenantWritable, TenantAccessError } from "@/lib/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the chamber into the browser when PowerSync is not configured. */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await assertTenantWritable(session.tenantId);
    const body = await pullSnapshot(session.tenantId, session.userId);
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof TenantAccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("sync pull failed", e);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
