import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { assertTenantWritable, TenantAccessError } from "@/lib/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sync is the app's own pull/upload. This route stays so older pages get a clear mode. */
export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await assertTenantWritable(session.tenantId);
  } catch (e) {
    if (e instanceof TenantAccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ mode: "custom" });
}
