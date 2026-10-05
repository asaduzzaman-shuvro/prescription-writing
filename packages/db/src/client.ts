import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Create a Drizzle client.
 * - `DATABASE_URL` connects as the owner role (migrations, platform admin, server jobs).
 * - `DATABASE_URL_APP` connects as `rx_app`, which is subject to row-level security; use it with
 *   `withTenant()` for anything a clinic user triggers.
 */
export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { max: opts.max ?? 10, prepare: false });
  return drizzle(client, { schema, casing: "snake_case" });
}

export { schema };
