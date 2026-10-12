/**
 * Create the project tables on the cPanel Postgres database and load the curated data
 * (pick-lists, lab catalogue, exam templates).
 *
 *   pnpm db:migrate:cpanel -- --host <remote host>
 *
 * Shared cPanel usually refuses PostgreSQL on the public IP. Open an SSH tunnel, then:
 *   ssh -N -L 5433:127.0.0.1:5432 <cpanel-user>@<server>
 *   pnpm db:migrate:cpanel -- --host 127.0.0.1 --port 5433
 *
 * Uses apps/web/.env.production. Does not copy the MedEx medicine catalogue or the
 * local demo logins (admin@rx.local / doctor@rx.local).
 *
 * Over SSH on the server itself: pnpm db:migrate:cpanel -- --on-server
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openSql } from "../client";
import { ownerConnection } from "../connection";
import { DEV_DATABASE_URL } from "../dev-urls";
import { loadEnvFile } from "../env-file";
import { seedCurated } from "../seed/curated";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, "../../../../apps/web/.env.production");
const hostFlag = process.argv.indexOf("--host");
const remoteHost = hostFlag >= 0 ? process.argv[hostFlag + 1] : undefined;
const portFlag = process.argv.indexOf("--port");
const portArg = portFlag >= 0 ? process.argv[portFlag + 1] : undefined;
const onServer = process.argv.includes("--on-server");

loadEnvFile(envFile);
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_APP;
if (remoteHost) process.env.DB_HOST = remoteHost;
if (portArg) process.env.DB_PORT = portArg;

const host = process.env.DB_HOST?.trim() ?? "";
const port = Number(process.env.DB_PORT || 5432);
if (!host || !process.env.DB_USER?.trim() || !process.env.DB_PASSWORD || !process.env.DB_NAME?.trim()) {
  console.error(`${envFile} must set DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME.`);
  process.exit(1);
}
if (!Number.isInteger(port) || port <= 0) {
  console.error(`--port must be a positive integer, got "${portArg ?? ""}".`);
  process.exit(1);
}
// 127.0.0.1:5432 is this PC's own Postgres. A tunnel uses another local port.
if (["localhost", "127.0.0.1", "::1"].includes(host) && port === 5432 && !onServer) {
  console.error(
    "127.0.0.1:5432 is this PC, not cPanel.\n" +
      "Leave this tunnel open in another window:\n" +
      "  ssh -N -L 5433:127.0.0.1:5432 <cpanel-user>@<server>\n" +
      "Then run:\n" +
      "  pnpm db:migrate:cpanel -- --host 127.0.0.1 --port 5433",
  );
  process.exit(1);
}

console.log(`cPanel database: ${process.env.DB_USER}@${host}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME}`);
const connection = ownerConnection(DEV_DATABASE_URL);
const client = openSql(connection, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: join(here, "../../migrations") });
  console.log("tables: migrations applied");
  const { createDb } = await import("../client");
  const db = createDb(connection, { max: 2 });
  await seedCurated(db);
  await db.$client.end();
  console.log("curated data loaded. Medicine catalogue and demo logins were not copied.");
} finally {
  await client.end();
}
