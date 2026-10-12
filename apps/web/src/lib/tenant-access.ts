import "server-only";
import { s } from "@rx/db";
import { eq } from "drizzle-orm";
import { ownerDb } from "./db";

export class TenantAccessError extends Error {
  constructor(
    message: string,
    readonly status: 402 | 403 = 403,
  ) {
    super(message);
    this.name = "TenantAccessError";
  }
}

export interface TenantBrief {
  status: string;
  plan: string;
  planExpiresAt: string | null;
  name: string;
}

const BRIEF_TTL_MS = 15_000;
const briefs = new Map<string, TenantBrief & { at: number }>();

export function invalidateTenantBrief(tenantId: string) {
  briefs.delete(tenantId);
}

/** Chamber name, plan and status. Reused for a few seconds so page loads and sync polls share one lookup. */
export async function tenantBrief(tenantId: string): Promise<TenantBrief | null> {
  const hit = briefs.get(tenantId);
  if (hit && Date.now() - hit.at < BRIEF_TTL_MS) return hit;
  const [t] = await ownerDb
    .select({ status: s.tenant.status, plan: s.tenant.plan, planExpiresAt: s.tenant.planExpiresAt, name: s.tenant.name })
    .from(s.tenant)
    .where(eq(s.tenant.id, tenantId));
  if (!t) return null;
  const brief = { status: t.status, plan: t.plan, planExpiresAt: t.planExpiresAt, name: t.name, at: Date.now() };
  briefs.set(tenantId, brief);
  if (briefs.size > 500) {
    const oldest = briefs.keys().next().value;
    if (oldest) briefs.delete(oldest);
  }
  return brief;
}

/** Suspended chambers and expired paid plans cannot sync or send SMS. Trial (null expiry) is allowed. */
export async function assertTenantWritable(tenantId: string): Promise<void> {
  const t = await tenantBrief(tenantId);
  if (!t) throw new TenantAccessError("Chamber not found", 403);
  if (t.status === "suspended") throw new TenantAccessError("This chamber is suspended. Contact support.", 403);
  if (t.planExpiresAt) {
    const end = new Date(`${t.planExpiresAt}T23:59:59`);
    if (end.getTime() < Date.now()) {
      throw new TenantAccessError("Subscription expired. Renew under Billing to keep syncing and SMS.", 402);
    }
  }
}
