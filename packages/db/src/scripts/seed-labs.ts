/**
 * Writes the curated lab test catalogue into the database (platform rows). Safe for production: it's our own
 * curated data, not the MedEx-derived dev seed. Idempotent; re-run after the catalogue in @rx/core changes.
 *
 *   pnpm db:seed:labs            (DB_* or DATABASE_URL, else the local dev database)
 */
import { createDb } from "../client";
import { ownerConnection } from "../connection";
import { DEV_DATABASE_URL } from "../dev-urls";
import { seedLabCatalogue } from "../seed/lab-catalogue";

const db = createDb(ownerConnection(DEV_DATABASE_URL), { max: 2 });
console.log("lab catalogue:", await seedLabCatalogue(db));
await db.$client.end();
