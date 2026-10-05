import { defineConfig } from "vitest/config";

// Unit tests only; browser flows live in e2e/ and run with Playwright (`pnpm e2e`).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], passWithNoTests: true },
});
