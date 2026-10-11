import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openSql } from "../client";
import { ownerConnection } from "../connection";
import { DEV_DATABASE_URL } from "../dev-urls";

const client = openSql(ownerConnection(DEV_DATABASE_URL), { max: 1, onnotice: () => {} });
const here = dirname(fileURLToPath(import.meta.url));
await migrate(drizzle(client), { migrationsFolder: join(here, "../../migrations") });
console.log("migrations applied");
await client.end();
