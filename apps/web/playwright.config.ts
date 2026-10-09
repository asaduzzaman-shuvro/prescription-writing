import { defineConfig } from "@playwright/test";

/**
 * E2E tests run against a production build (the offline test needs the service worker, which is
 * disabled in `next dev`). The server they start uses the e2e database and its PowerSync (:8081), never the dev
 * ones; set those up once with scripts/e2e-db.sh.
 *   pnpm build && pnpm e2e
 * With E2E_BASE_URL the tests use that server, and whatever database it was started with.
 */
const E2E_ENV = {
  DATABASE_URL: "postgres://prescription_service:prescription_service@localhost:5432/prescription_service_e2e",
  DATABASE_URL_APP: "postgres://rx_app:rx_app@localhost:5432/prescription_service_e2e",
  POWERSYNC_URL: "http://localhost:8081",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", viewport: { width: 1360, height: 950 } },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start --port 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 120_000, env: E2E_ENV },
});
