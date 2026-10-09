/**
 * Writes the curated lab test catalogue into the database (platform rows). Safe for production: it's our own
 * curated data, not the MedEx-derived dev seed. Idempotent; re-run after the catalogue in @rx/core changes.
 *
 *   pnpm db:seed:labs            (DATABASE_URL, else the local dev database)
 */
import { createDb } from "../client";
import { DEV_DATABASE_URL } from "../dev-urls";
import { seedLabCatalogue } from "../seed/lab-catalogue";

const db = createDb(process.env.DATABASE_URL ?? DEV_DATABASE_URL, { max: 2 });
console.log("lab catalogue:", await seedLabCatalogue(db));
await db.$client.end();
