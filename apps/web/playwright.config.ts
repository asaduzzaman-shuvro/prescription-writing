import { defineConfig } from "@playwright/test";

/**
 * E2E tests run against a production build (the offline test needs the service worker, which is
 * disabled in `next dev`). Requires the dev infrastructure (Postgres + PowerSync) and the dev seed.
 *   pnpm build && pnpm e2e
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", viewport: { width: 1360, height: 950 } },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start --port 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 120_000 },
});
