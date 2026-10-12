import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type DbConnection } from "./connection";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/** Open a postgres.js client from a URL or from discrete host/user/password/database fields. */
export function openSql(connection: DbConnection, opts: { max?: number; onnotice?: () => void } = {}) {
  const settings = {
    max: opts.max ?? 10,
    // Prepared statements break transaction-mode poolers. Parsing cost is small next to a remote round trip.
    prepare: false as const,
    // Shared hosts drop idle TCP sessions. The next query then hangs until the dead socket times out,
    // which is instant on localhost and many seconds in production. Close idle sockets ourselves,
    // and probe sooner so a live connection is not killed by a NAT timeout.
    idle_timeout: 20,
    connect_timeout: 10,
    keep_alive: 10,
    max_lifetime: 60 * 30,
    ...(opts.onnotice ? { onnotice: opts.onnotice } : {}),
  };
  return typeof connection === "string" ? postgres(connection, settings) : postgres({ ...connection, ...settings });
}

/**
 * Create a Drizzle client.
 * - Owner connection: migrations, platform admin, server jobs (`DB_*` or `DATABASE_URL`).
 * - App connection: `rx_app`, subject to row-level security; use it with `withTenant()` for
 *   anything a clinic user triggers (`DB_APP_*`, else the owner fields, else `DATABASE_URL_APP`).
 */
export function createDb(connection: DbConnection, opts: { max?: number } = {}) {
  const client = openSql(connection, opts);
  return drizzle(client, { schema, casing: "snake_case" });
}

export { schema };
