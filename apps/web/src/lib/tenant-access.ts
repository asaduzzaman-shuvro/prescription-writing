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

/** Suspended chambers and expired paid plans cannot sync or send SMS. Trial (null expiry) is allowed. */
export async function assertTenantWritable(tenantId: string): Promise<void> {
  const [t] = await ownerDb
    .select({ status: s.tenant.status, planExpiresAt: s.tenant.planExpiresAt })
    .from(s.tenant)
    .where(eq(s.tenant.id, tenantId));
  if (!t) throw new TenantAccessError("Chamber not found", 403);
  if (t.status === "suspended") throw new TenantAccessError("This chamber is suspended. Contact support.", 403);
  if (t.planExpiresAt) {
    const end = new Date(`${t.planExpiresAt}T23:59:59`);
    if (end.getTime() < Date.now()) {
      throw new TenantAccessError("Subscription expired. Renew under Billing to keep syncing and SMS.", 402);
    }
  }
}
