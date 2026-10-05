import { expect, test, type Browser } from "@playwright/test";
import { addMedicine, login, mobile, uniq, waitSynced } from "./helpers";

async function as(browser: Browser, email: string, password: string) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
  const page = await ctx.newPage();
  await login(page, email, password);
  return { ctx, page };
}

test("admin-curated interaction and patient allergy raise alerts in the editor", async ({ browser }) => {
  const admin = await as(browser, "admin@rx.local", "admin123");
  await admin.page.goto("/admin/interactions");
  const pickers = admin.page.locator("input[placeholder^='e.g.']");
  await pickers.nth(0).fill("Ciprofloxacin");
  await admin.page.getByRole("button", { name: "Ciprofloxacin", exact: true }).click();
  await pickers.nth(1).fill("Theophylline");
  await admin.page.getByRole("button", { name: "Theophylline", exact: true }).click();
  await admin.page.getByRole("combobox").selectOption("major");
  await admin.page.getByPlaceholder("Pharmacist name").fill("E2E test (dev data)");
  await admin.page.getByPlaceholder("↑ statin levels — risk of myopathy").fill("↑ theophylline levels — seizures, arrhythmia");
  await admin.page.getByRole("button", { name: "Save interaction" }).click();
  await expect(admin.page.getByText("Saved — doctors receive it on next sync")).toBeVisible();
  await admin.ctx.close();

  const doc = await as(browser, "doctor@rx.local", "doctor123");
  const page = doc.page;
  await waitSynced(page);
  await page.goto("/doctor#/patients/new");
  await page.getByTestId("patient-name").fill(`Alert Patient ${uniq()}`);
  await page.getByTestId("patient-age").fill("52");
  await page.getByTestId("patient-allergies").fill("Amoxicillin");
  await page.getByTestId("patient-consent").check();
  await page.getByTestId("patient-save-visit").click();
  await addMedicine(page, "arofil sr", "1+0+1 af 1m");
  await addMedicine(page, "cipro", "1+0+1 af 7d");
  await expect(page.getByText(/MAJOR interaction with/).first()).toBeVisible({ timeout: 30_000 });
  await addMedicine(page, "moxacil", "1+1+1 af 7d");
  await expect(page.getByText(/Patient is allergic to amoxicillin/)).toBeVisible();
  await doc.ctx.close();
});

test("serial booking → check-in keeps the serial; display, fee and reports", async ({ browser }) => {
  const asst = await as(browser, "assistant@rx.local", "assist123");
  await waitSynced(asst.page);
  const name = `Booked Patient ${uniq()}`;
  await asst.page.goto("/doctor#/bookings");
  await asst.page.getByTestId("book-name").fill(name);
  await asst.page.getByTestId("book-mobile").fill(mobile());
  await asst.page.getByTestId("book-submit").click();
  const msg = await asst.page.getByTestId("book-msg").innerText();
  const serial = msg.match(/#(\d+)/)![1]!;

  await asst.page.goto("/doctor#/");
  await asst.page.getByTestId("booked-chip").filter({ hasText: name }).click();
  await expect(asst.page.getByTestId("patient-name")).toHaveValue(name); // prefilled from the booking
  await asst.page.getByTestId("patient-age").fill("40");
  await asst.page.getByTestId("patient-consent").check();
  await asst.page.getByTestId("patient-save-visit").click();
  await expect(asst.page.getByText(`#${serial}`, { exact: true })).toBeVisible();
  await asst.page.getByTestId("visit-fee").fill("500");
  await asst.page.getByTestId("visit-fee").blur();
  await expect(asst.page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  await asst.ctx.close();

  const doc = await as(browser, "doctor@rx.local", "doctor123");
  const page = doc.page;
  await waitSynced(page);
  await page.getByRole("row", { name: new RegExp(name) }).getByRole("link", { name: "Open" }).click();
  await addMedicine(page, "napa", "1+1+1 af 3d");
  await page.goto("/doctor#/display");
  await expect(page.getByTestId("now-serving")).toHaveText(serial);
  await page.goBack();
  await page.getByTestId("finalize").click();
  await expect(page.frameLocator("[data-testid=print-frame]").locator(".rx-item")).toHaveCount(1);
  await page.goto("/doctor#/reports");
  const stats = page.getByTestId("report-stats");
  await expect(stats).toContainText("Fees collected (৳)");
  const statValue = async (i: number) => Number((await stats.locator("div.card").nth(i).locator("div").nth(1).innerText()).replace(/,/g, "")) || 0;
  await expect.poll(() => statValue(2)).toBeGreaterThanOrEqual(500); // fees (live query)
  await expect.poll(() => statValue(3)).toBeGreaterThanOrEqual(1); // final prescriptions
  await doc.ctx.close();
});

test("SMS is charged against credits; FHIR export; admin records a bKash payment", async ({ browser }) => {
  const doc = await as(browser, "doctor@rx.local", "doctor123");
  const page = doc.page;
  await waitSynced(page);
  await page.goto("/doctor#/patients/new");
  await page.getByTestId("patient-name").fill(`SMS Patient ${uniq()}`);
  await page.getByTestId("patient-age").fill("30");
  await page.getByTestId("patient-mobile").fill(mobile());
  await page.getByTestId("patient-consent").check();
  await page.getByTestId("patient-save-visit").click();
  await addMedicine(page, "napa", "1+1+1 af 3d");
  await page.getByTestId("finalize").click();
  await expect(page.getByTestId("print-frame")).toBeVisible();
  const rxId = new URL(page.url()).hash.split("/")[2]!;

  // The finalised prescription reaches the server via the sync upload queue; poll until it has.
  await expect.poll(async () => (await page.request.get(`/api/fhir/prescription/${rxId}`)).status(), { timeout: 60_000 }).toBe(200);
  const fhir = await page.request.get(`/api/fhir/prescription/${rxId}`);
  expect(fhir.headers()["content-type"]).toContain("application/fhir+json");
  const bundle = await fhir.json();
  expect(bundle.resourceType).toBe("Bundle");
  expect(bundle.entry.some((e: { resource: { resourceType: string } }) => e.resource.resourceType === "MedicationRequest")).toBe(true);

  const admin = await as(browser, "admin@rx.local", "admin123");
  await admin.page.goto("/admin/doctors");
  await admin.page.getByRole("link", { name: "Dr. Farhana Rahman" }).click();
  const credit = Number((await admin.page.getByText(/SMS credit \d+/).innerText()).match(/SMS credit (\d+)/)![1]);
  if (credit > 0) {
    await admin.page.getByPlaceholder("500").fill(String(-credit));
    await admin.page.getByRole("button", { name: "Top up" }).click();
    await expect(admin.page.getByText("SMS credit 0")).toBeVisible();
  }
  let sms = await page.request.post("/api/share/sms", { data: { prescriptionId: rxId } });
  expect(sms.status()).toBe(422);
  expect((await sms.json()).error).toMatch(/Not enough SMS credit/);
  await admin.page.getByPlaceholder("500").fill("10");
  await admin.page.getByRole("button", { name: "Top up" }).click();
  await expect(admin.page.getByText("SMS credit 10")).toBeVisible();
  sms = await page.request.post("/api/share/sms", { data: { prescriptionId: rxId } });
  expect(sms.status()).toBe(200);
  await admin.page.reload();
  await expect(admin.page.getByText(/SMS credit [89]\b/)).toBeVisible(); // 1–2 Unicode segments charged

  await admin.page.locator("select[name=months]").selectOption("3");
  await admin.page.locator("select[name=method]").selectOption("bkash");
  await admin.page.locator("input[name=reference]").fill(`TRX${uniq().toUpperCase()}`);
  await admin.page.getByRole("button", { name: "Record payment" }).click();
  await expect(admin.page.getByText("Recorded — plan extended")).toBeVisible();
  await admin.page.reload();
  await expect(admin.page.getByText(/paid until \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await admin.ctx.close();
  await doc.ctx.close();
});
