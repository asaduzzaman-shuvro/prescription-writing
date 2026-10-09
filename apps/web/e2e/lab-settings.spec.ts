import { expect, test, type Page } from "@playwright/test";
import { labRowId } from "@rx/core";
import { login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

// Tests no other spec uses: the clinic's changes stay in the e2e database between runs.
const CALCIUM = "17861-6";
const MAGNESIUM = "19123-9";

async function openLabSettings(page: Page) {
  await page.goto("/doctor#/settings");
  await page.getByTestId("settings-lab").click();
  await expect(page.getByTestId(`lab-settings-test-${CALCIUM}`)).toBeVisible();
}

const upload = (page: Page, table: string, id: string, data: Record<string, unknown>, op = "PUT") =>
  page.request.post("/api/sync/upload", { data: { batch: [{ op, table, id, data }] } }).then((r) => r.json() as Promise<{ applied: number; rejected: { reason: string }[] }>);

async function tenantOf(page: Page): Promise<string> {
  const token = (await page.context().cookies()).find((c) => c.name === "rx_session")!.value;
  return (JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as { tenantId: string }).tenantId;
}

/**
 * Calcium and magnesium as the platform has them, and the clinic's own test hidden. Written straight to the server
 * (the clinic rows' ids are derived), so it doesn't depend on what this device has synced or uploaded yet.
 */
async function restore(page: Page, ownTest?: string) {
  const tenantId = await tenantOf(page);
  for (const code of [CALCIUM, MAGNESIUM]) {
    const body = await upload(page, "lab_test", labRowId(tenantId, "lab_test", code), { code, name: null, short: null, unit: null, spec: "{}", is_active: 1 });
    expect(body).toEqual({ applied: 1, rejected: [] });
  }
  if (ownTest) {
    expect(await upload(page, "lab_test", labRowId(tenantId, "lab_test", ownTest), { is_active: 0 }, "PATCH")).toEqual({ applied: 1, rejected: [] });
    expect(await upload(page, "lab_panel", labRowId(tenantId, "lab_panel", ownTest), { is_active: 0 }, "PATCH")).toEqual({ applied: 1, rejected: [] });
  }
}

/** A clinic lab report of the minerals panel for the patient; returns its request id. */
async function mineralsReport(page: Page, phone: string, calcium: string, expectFlag: string) {
  await page.getByRole("navigation").getByRole("link", { name: "Lab", exact: true }).click();
  await page.getByRole("link", { name: "+ New lab report" }).click();
  await page.getByTestId("patient-search").fill(phone);
  await page.getByRole("button", { name: "Select" }).click();
  await page.getByTestId("lab-pick-minerals").click();
  const panel = page.getByTestId("lab-panel-minerals");
  await panel.getByTestId(`lab-in-${CALCIUM}`).fill(calcium);
  await expect(panel.getByTestId(`lab-in-flag-${CALCIUM}`)).toHaveText(expectFlag);
  await page.getByTestId("lab-save-print").click();
  await expect(page).toHaveURL(/#\/lab\/[0-9a-f-]{36}\/print/);
  return /#\/lab\/([0-9a-f-]{36})\/print/.exec(page.url())![1]!;
}

const calciumRow = (page: Page) => page.frameLocator("[data-testid=lab-print-frame]").locator("tr").filter({ hasText: "Calcium" });

test("the clinic heads its lab reports, changes a range, hides a test and adds its own; old reports keep their range", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await restore(page);
  await openLabSettings(page);
  for (const code of [CALCIUM, MAGNESIUM]) {
    await expect(page.getByTestId(`lab-settings-status-${code}`)).toHaveText("");
    await expect(page.getByTestId(`lab-settings-hide-${code}`)).toHaveText("Hide");
  }

  // The report heading and a signatory.
  await page.getByTestId("lab-profile-name").fill("RxPad E2E Diagnostics");
  if (!(await page.getByTestId("lab-signatory-name-0").count())) await page.getByTestId("lab-signatory-add").click();
  await page.getByTestId("lab-signatory-name-0").fill("Dr. E2E Pathologist");
  await page.getByTestId("lab-signatory-degrees-0").fill("MBBS, M.Phil (Pathology)");
  await page.getByTestId("lab-profile-save").click();
  await expect(page.getByTestId("lab-profile")).toContainText("Saved");

  // A report under the platform's range: 9.5 mg/dL is normal (8.5–10.5).
  const phone = mobile();
  await registerPatient(page, { name: `E2E Lab Settings ${uniq()}`, age: "40", sex: "Female", mobile: phone });
  await expect(page).toHaveURL(/#\/visit\//);
  const before = await mineralsReport(page, phone, "9.5", "");
  const frame = page.frameLocator("[data-testid=lab-print-frame]");
  await expect(frame.locator(".sheet").first()).toContainText("RxPad E2E Diagnostics");
  await expect(frame.locator(".sheet").first()).toContainText("Dr. E2E Pathologist");
  await expect(calciumRow(page)).toContainText("8.5–10.5");

  // The clinic's machine reads lower: its range for calcium, and magnesium it doesn't do.
  await openLabSettings(page);
  await page.getByTestId(`lab-settings-edit-${CALCIUM}`).click();
  await page.getByTestId("lab-edit-low").fill("8");
  await page.getByTestId("lab-edit-high").fill("9");
  await page.getByTestId("lab-edit-save").click();
  await expect(page.getByTestId(`lab-settings-status-${CALCIUM}`)).toHaveText("Changed");
  await expect(page.getByTestId(`lab-settings-ref-${CALCIUM}`)).toHaveText("8–9");
  await page.getByTestId(`lab-settings-hide-${MAGNESIUM}`).click();
  await expect(page.getByTestId(`lab-settings-status-${MAGNESIUM}`)).toHaveText("Hidden");

  // A clinic's own test, reported on its own.
  const id = uniq();
  await page.getByTestId("lab-settings-add").click();
  await page.getByTestId("lab-new-name").fill(`E2E zinc ${id}`);
  await page.getByTestId("lab-new-short").fill("Zinc");
  await page.getByTestId("lab-new-unit").fill("µg/dL");
  await page.getByTestId("lab-new-low").fill("70");
  await page.getByTestId("lab-new-high").fill("120");
  await page.getByTestId("lab-new-save").click();
  const zinc = `x-e2e-zinc-${id}`;
  await expect(page.getByTestId(`lab-settings-status-${zinc}`)).toHaveText("Clinic's own");

  // New results use the clinic's range; magnesium is no longer offered; the clinic's test is.
  const after = await mineralsReport(page, phone, "9.5", "H");
  expect(after).not.toBe(before);
  await expect(calciumRow(page)).toContainText("8–9");
  await expect(page.frameLocator("[data-testid=lab-print-frame]").locator("tr.abn").filter({ hasText: "Calcium" })).toContainText("9.5 H");
  await page.getByRole("navigation").getByRole("link", { name: "Lab", exact: true }).click();
  await page.getByRole("link", { name: "+ New lab report" }).click();
  await expect(page.getByTestId(`lab-pick-${zinc}`)).toBeVisible();
  await page.getByTestId("lab-pick-minerals").click();
  await expect(page.getByTestId("lab-panel-minerals").getByTestId(`lab-in-${MAGNESIUM}`)).toHaveCount(0);

  // The earlier report still prints the range it was saved with.
  await page.goto(`/doctor#/lab/${before}/print`);
  await expect(calciumRow(page)).toContainText("8.5–10.5");
  await expect(calciumRow(page)).not.toContainText("H");

  // The server took every change.
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  await expect(page.getByTestId("sync-rejected")).toHaveCount(0);

  // Put back (on the server: this browser closes next), and the device follows.
  await restore(page, zinc);
  await openLabSettings(page);
  await expect(page.getByTestId(`lab-settings-status-${CALCIUM}`)).toHaveText("", { timeout: 30_000 });
  await expect(page.getByTestId(`lab-settings-status-${zinc}`)).toHaveText("Hidden", { timeout: 30_000 });
});

test("lab settings are for the doctor and clinic admin", async ({ page }) => {
  await login(page, "assistant@rx.local", "assist123");
  await waitSynced(page);
  await page.goto("/doctor#/settings/lab");
  await expect(page.getByTestId("lab-settings")).toContainText("Only a doctor or the clinic admin");
  await expect(page.getByTestId("lab-catalogue-settings")).toHaveCount(0);
});

test("the platform admin adds and edits a catalogue test; codes are checked", async ({ page }) => {
  await login(page, "admin@rx.local", "admin123");
  const code = `bd-e2e-${uniq()}`;
  await page.goto("/admin/lab-catalogue/tests/new");
  await page.getByTestId("admin-lab-code").fill(code);
  await page.getByTestId("admin-lab-name").fill("E2E test");
  await page.getByLabel("Short name (printed)").fill("E2E");
  // Inactive, so it never reaches a clinic.
  await page.getByLabel("Active").uncheck();
  await page.getByTestId("admin-lab-spec").fill("{ not json");
  await page.getByTestId("admin-lab-save").click();
  await expect(page.getByTestId("admin-lab-error")).toContainText("Spec is not valid JSON");

  await page.getByTestId("admin-lab-code").fill(code);
  await page.getByTestId("admin-lab-name").fill("E2E test");
  await page.getByLabel("Short name (printed)").fill("E2E");
  await page.getByLabel("Active").uncheck();
  await page.getByTestId("admin-lab-spec").fill('{"range": {"low": 1, "high": 2}, "unknown": 1}');
  await page.getByTestId("admin-lab-save").click();
  await expect(page).toHaveURL(new RegExp(`/admin/lab-catalogue/tests/${code}\\?saved=1`));
  // Unknown spec keys are dropped.
  await expect(page.getByTestId("admin-lab-spec")).toHaveValue(/"high": 2/);
  await expect(page.getByTestId("admin-lab-spec")).not.toHaveValue(/unknown/);

  await page.getByTestId("admin-lab-unit").fill("mg/L");
  await page.getByTestId("admin-lab-save").click();
  await expect(page.getByTestId("admin-lab-unit")).toHaveValue("mg/L");
  await page.goto(`/admin/lab-catalogue?q=${code}`);
  await expect(page.getByTestId("admin-lab-tests")).toContainText("admin · inactive");

  // A code already in the catalogue can't be added again.
  await page.goto("/admin/lab-catalogue/tests/new");
  await page.getByTestId("admin-lab-code").fill(code);
  await page.getByTestId("admin-lab-name").fill("Again");
  await page.getByLabel("Short name (printed)").fill("Again");
  await page.getByTestId("admin-lab-save").click();
  await expect(page.getByTestId("admin-lab-error")).toHaveText(`${code} already exists`);
});
