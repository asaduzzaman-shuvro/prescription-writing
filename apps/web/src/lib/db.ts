import "server-only";
import { createDb, type Db } from "@rx/db";

const g = globalThis as unknown as { __rxOwnerDb?: Db; __rxAppDb?: Db };

/** Owner connection: platform admin + server jobs. Never use for clinic-user requests. */
export const ownerDb: Db = (g.__rxOwnerDb ??= createDb(process.env.DATABASE_URL ?? "postgres://rx:rx@localhost:5433/rx"));

/** RLS connection (rx_app role): always wrap queries in withTenant(). */
export const appDb: Db = (g.__rxAppDb ??= createDb(
  process.env.DATABASE_URL_APP ?? "postgres://rx_app:rx_app@localhost:5433/rx",
));
