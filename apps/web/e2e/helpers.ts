import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit], button");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Doctor/assistant app: wait until the first PowerSync download completed and nothing is pending. */
export async function waitSynced(page: Page) {
  await expect(page.getByTestId("first-sync")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
}

export async function registerPatient(page: Page, p: { name: string; age: string; sex: "Male" | "Female"; mobile: string }) {
  await page.goto("/doctor#/patients/new");
  await page.getByTestId("patient-name").fill(p.name);
  await page.getByTestId("patient-age").fill(p.age);
  await page.getByRole("button", { name: p.sex, exact: true }).click();
  await page.getByTestId("patient-mobile").fill(p.mobile);
  await page.getByTestId("patient-consent").check();
  await page.getByTestId("patient-save-visit").click();
}

/** Visit UI: open the Reports tab (lab reports entry). */
export async function openVisitReports(page: Page) {
  await page.getByTestId("visit-tab-reports").click();
  await expect(page.getByTestId("lab-reports")).toBeVisible();
}

export async function addMedicine(page: Page, query: string, shortcut: string) {
  const items = page.getByTestId("rx-item");
  const before = await items.count();
  const search = page.getByTestId("med-search");
  await search.fill(query);
  await expect(page.getByTestId("med-results").locator("button").first()).toBeVisible();
  await search.press("Enter");
  await expect(items).toHaveCount(before + 1);
  const sc = page.getByTestId("rx-shortcut").nth(before);
  await sc.fill(shortcut);
  await sc.press("Enter");
}

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
export const mobile = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
