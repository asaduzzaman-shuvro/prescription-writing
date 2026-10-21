import { s } from "@rx/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ownerDb } from "@/lib/db";
import { tenantAccessMessage } from "@/lib/tenant-access";
import { createSession, getSession } from "@/lib/session";

export const runtime = "nodejs";

const Body = z.object({ tenantId: z.string().uuid() });

/** Switch the signed-in user's active clinic membership (same account, different tenant). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const [m] = await ownerDb
    .select({ role: s.membership.role, status: s.tenant.status, name: s.tenant.name })
    .from(s.membership)
    .innerJoin(s.tenant, eq(s.tenant.id, s.membership.tenantId))
    .where(and(eq(s.membership.userId, session.userId), eq(s.membership.tenantId, parsed.data.tenantId)));
  if (!m) return NextResponse.json({ error: "not a member of that chamber" }, { status: 403 });
  const blocked = tenantAccessMessage(m.status);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });

  await createSession({
    userId: session.userId,
    name: session.name,
    email: session.email,
    platformRole: session.platformRole,
    tenantId: parsed.data.tenantId,
    tenantRole: m.role,
  });
  await audit({
    actorUserId: session.userId,
    tenantId: parsed.data.tenantId,
    action: "auth.switch_chamber",
    entity: "tenant",
    entityId: parsed.data.tenantId,
  });
  return NextResponse.json({ ok: true, tenantId: parsed.data.tenantId, name: m.name, role: m.role });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const rows = await ownerDb
    .select({
      tenantId: s.membership.tenantId,
      role: s.membership.role,
      name: s.tenant.name,
      status: s.tenant.status,
    })
    .from(s.membership)
    .innerJoin(s.tenant, eq(s.tenant.id, s.membership.tenantId))
    .where(eq(s.membership.userId, session.userId));
  return NextResponse.json({
    currentTenantId: session.tenantId,
    chambers: rows
      .filter((r) => r.status === "active")
      .map((r) => ({ tenantId: r.tenantId, name: r.name, role: r.role, current: r.tenantId === session.tenantId })),
  });
}
