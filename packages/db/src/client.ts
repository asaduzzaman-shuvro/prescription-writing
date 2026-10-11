import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type DbConnection } from "./connection";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/** Open a postgres.js client from a URL or from discrete host/user/password/database fields. */
export function openSql(connection: DbConnection, opts: { max?: number; onnotice?: () => void } = {}) {
  const settings = {
    max: opts.max ?? 10,
    prepare: false as const,
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
