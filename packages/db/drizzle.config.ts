import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://rx:rx@localhost:5433/rx" },
  casing: "snake_case",
});
