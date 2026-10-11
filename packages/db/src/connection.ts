/**
 * Database connection from discrete env fields.
 * `DB_HOST` wins over `DATABASE_URL`, so a password can contain `#`, `(`, `~`, and similar
 * characters without URL encoding.
 *
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *   DB_APP_USER, DB_APP_PASSWORD   optional clinic role; defaults to the owner fields
 */

export type DiscreteDb = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type DbConnection = string | DiscreteDb;

function readDiscrete(which: "owner" | "app"): DiscreteDb | undefined {
  const host = process.env.DB_HOST?.trim();
  if (!host) return undefined;

  const user = (
    which === "app" ? (process.env.DB_APP_USER ?? process.env.DB_USER) : process.env.DB_USER
  )?.trim();
  const password = which === "app" ? (process.env.DB_APP_PASSWORD ?? process.env.DB_PASSWORD) : process.env.DB_PASSWORD;
  const database = process.env.DB_NAME?.trim();
  if (!user || password == null || password === "" || !database) {
    throw new Error("DB_HOST is set, so DB_USER, DB_PASSWORD, and DB_NAME are required.");
  }

  const portRaw = process.env.DB_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 5432;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`DB_PORT must be a positive integer, got "${portRaw ?? ""}".`);
  }
  return { host, port, database, user, password };
}

/** Owner role: migrations, platform admin, server jobs. */
export function ownerConnection(fallbackUrl: string): DbConnection {
  return readDiscrete("owner") ?? process.env.DATABASE_URL ?? fallbackUrl;
}

/** Clinic role (`rx_app`): row-level security. Falls back to the owner fields when no app role is set. */
export function appConnection(fallbackUrl: string): DbConnection {
  return readDiscrete("app") ?? process.env.DATABASE_URL_APP ?? fallbackUrl;
}

export function connectionHost(connection: DbConnection): string {
  return typeof connection === "string" ? new URL(connection).hostname : connection.host;
}
