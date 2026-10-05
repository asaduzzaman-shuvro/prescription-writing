import { sql } from "drizzle-orm";
import type { Db } from "./client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` in a transaction scoped to one tenant. RLS policies read these settings, so any query
 * made through `tx` on the rx_app connection can only see that tenant's rows.
 */
export async function withTenant<T>(
  db: Db,
  ctx: { tenantId: string; userId: string },
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId}, true)`,
    );
    return fn(tx);
  });
}
