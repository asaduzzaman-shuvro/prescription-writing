import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { pullPart, pullSnapshot, type SyncPart } from "@/lib/sync-pull";
import { assertTenantWritable, TenantAccessError } from "@/lib/tenant-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPart(value: string | null): value is SyncPart {
  return value === "clinic" || value === "catalogue";
}

/** Download the chamber into the browser when PowerSync is not configured. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    await assertTenantWritable(session.tenantId);
    const part = new URL(req.url).searchParams.get("part");
    if (part && !isPart(part)) return NextResponse.json({ error: "bad part" }, { status: 400 });
    if (isPart(part)) {
      const snap = await pullPart(session.tenantId, session.userId, part, req.headers.get("if-none-match"));
      const headers = { "cache-control": "no-store", etag: `"${snap.etag}"` };
      if (snap.unchanged) return new NextResponse(null, { status: 304, headers });
      const body = part === "clinic" ? { clinic: snap.rows } : { catalogue: snap.rows };
      return NextResponse.json(body, { headers });
    }
    const body = await pullSnapshot(session.tenantId, session.userId);
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof TenantAccessError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("sync pull failed", e);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}
