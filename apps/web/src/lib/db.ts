import "server-only";
import { appConnection, createDb, DEV_DATABASE_URL, DEV_DATABASE_URL_APP, ownerConnection, type Db } from "@rx/db";

const g = globalThis as unknown as { __rxOwnerDb?: Db; __rxAppDb?: Db };

/** Owner connection: platform admin + server jobs. Never use for clinic-user requests. */
export const ownerDb: Db = (g.__rxOwnerDb ??= createDb(ownerConnection(DEV_DATABASE_URL)));

/** RLS connection (rx_app role): always wrap queries in withTenant(). */
export const appDb: Db = (g.__rxAppDb ??= createDb(appConnection(DEV_DATABASE_URL_APP)));
