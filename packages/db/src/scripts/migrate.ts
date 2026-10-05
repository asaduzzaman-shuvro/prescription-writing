import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://rx:rx@localhost:5433/rx";
const client = postgres(url, { max: 1, onnotice: () => {} });
const here = dirname(fileURLToPath(import.meta.url));
await migrate(drizzle(client), { migrationsFolder: join(here, "../../migrations") });
console.log("migrations applied");
await client.end();
