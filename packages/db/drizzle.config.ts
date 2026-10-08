import { defineConfig } from "drizzle-kit";
import { DEV_DATABASE_URL } from "./src/dev-urls";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? DEV_DATABASE_URL },
  casing: "snake_case",
});
