import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

const iso = (d: Date) => d.toLocaleDateString("en-CA");
const dmy = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;

test("doctor records lab reports: H/L flags, previous value, and the ticked values print", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const name = `E2E Labs ${uniq()}`;
  await registerPatient(page, { name, age: "40", sex: "Female", mobile: mobile() });
  const card = page.getByTestId("lab-reports");
  const today = iso(new Date());
  const earlier = iso(new Date(Date.now() - 60 * 86_400_000));

  // An older sugar report, then today's: the earlier HbA1c shows as the previous value.
  await card.getByTestId("lab-add-sugar").click();
  await card.getByTestId("lab-date").fill(earlier);
  await card.getByTestId("lab-name").fill("Popular Diagnostic");
  await card.getByTestId("lab-value-4548-4").fill("8.1");
  await card.getByTestId("lab-save").click();
  await card.getByTestId("lab-add-sugar").click();
  await expect(card.getByTestId("lab-name")).toHaveValue("Popular Diagnostic"); // remembers the lab
  await card.getByTestId("lab-value-4548-4").fill("7.4");
  await expect(card.getByTestId("lab-prev-4548-4")).toContainText("prev 8.1");
  await expect(card.getByTestId("lab-flag-4548-4")).toHaveText("H");
  await card.getByTestId("lab-save").click();

  // CBC: Hb low for a woman, WBC typed per cmm and flagged high, normal platelets ticked to print.
  await card.getByTestId("lab-add-cbc").click();
  await card.getByTestId("lab-value-718-7").fill("9.2");
  await expect(card.getByTestId("lab-flag-718-7")).toHaveText("L");
  await card.getByTestId("lab-value-6690-2").fill("11800");
  await expect(card.getByTestId("lab-flag-6690-2")).toHaveText("H");
  await card.getByTestId("lab-value-777-3").fill("250000");
  await expect(card.getByTestId("lab-print-777-3")).not.toBeChecked();
  await card.getByTestId("lab-print-777-3").check();
  await card.getByTestId("lab-save").click();

  // Imaging: a free-text finding.
  await card.getByTestId("lab-add-other").click();
  await card.getByTestId("lab-title").fill("USG of whole abdomen");
  await card.getByTestId("lab-conclusion").fill("Fatty liver grade I");
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId("lab-report")).toHaveCount(4);
  await expect(card.getByTestId("lab-result-6690-2")).toHaveText("WBC 11.8 ×10³/µL (H)");

  // A report with nothing to print still needs a value.
  await card.getByTestId("lab-add-thyroid").click();
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId("lab-error")).toHaveText("Enter at least one value.");
  await card.getByRole("button", { name: "Cancel" }).click();

  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  const reports = frame.locator("section", { has: frame.locator("h3", { hasText: /^Reports$/ }) }).locator("li");
  await expect(reports).toHaveText([
    `Blood sugar (${dmy(earlier)}): HbA1c 8.1 % (H)`,
    `Blood sugar (${dmy(today)}): HbA1c 7.4 % (H)`,
    `CBC (${dmy(today)}): Hb 9.2 g/dL (L), WBC 11.8 ×10³/µL (H), Platelets 250 ×10³/µL`,
    `USG of whole abdomen (${dmy(today)}): Fatty liver grade I`,
  ]);

  // Reports stay editable after printing, but the printed prescription keeps the values it was printed with.
  const printedUrl = page.url();
  await page.getByRole("link", { name: "← Back to visit" }).click();
  await card.getByTestId("lab-report").filter({ hasText: "CBC" }).getByRole("button", { name: "Edit" }).click();
  await card.getByTestId("lab-value-718-7").fill("10.5");
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId("lab-result-718-7")).toHaveText("Hb 10.5 g/dL (L)");
  await page.goto(printedUrl);
  await expect(reports.nth(2)).toContainText("Hb 9.2 g/dL (L)");
  await page.getByRole("link", { name: "← Back to visit" }).click();

  // The patient's page lists the reports.
  await page.getByRole("link", { name }).click();
  await expect(page.getByTestId("patient-lab-reports").locator("> div")).toHaveCount(4);
});

test("the assistant can add a report; the server rejects tampered or future-dated ones", async ({ page }) => {
  await login(page, "assistant@rx.local", "assist123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E Labs Asst ${uniq()}`, age: "52", sex: "Male", mobile: mobile() });
  const card = page.getByTestId("lab-reports");
  await card.getByTestId("lab-add-rft").click();
  await card.getByTestId("lab-value-2160-0").fill("1.6");
  await expect(card.getByTestId("lab-flag-2160-0")).toHaveText("H");
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId("lab-report")).toHaveCount(1);
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });

  const upload = (data: Record<string, unknown>) =>
    page.request.post("/api/sync/upload", { data: { batch: [{ op: "PUT", table: "lab_report", id: crypto.randomUUID(), data }] } }).then((r) => r.json());
  // The checks run before anything is written, so any patient id will do.
  const base = { patient_id: crypto.randomUUID(), report_date: iso(new Date()), panel: "cbc", title: "CBC" };
  let body = await upload({ ...base, results: JSON.stringify([{ code: "718-7", unit: "g/dL", value: "9.2", print: true }]) });
  expect(body.rejected[0].reason).toMatch(/must be a number/);
  body = await upload({ ...base, report_date: iso(new Date(Date.now() + 3 * 86_400_000)), results: "[]" });
  expect(body.rejected[0].reason).toMatch(/future/);
});

test("quick entry, what was ordered last visit, and the trend across visits", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const name = `E2E Labs Trend ${uniq()}`;
  await registerPatient(page, { name, age: "55", sex: "Male", mobile: mobile() });
  const card = page.getByTestId("lab-reports");

  // Visit 1: HbA1c by quick entry; order tests for next time.
  await card.getByTestId("lab-quick").fill("hba1c 8.1");
  await card.getByTestId("lab-quick").press("Enter");
  await expect(card.getByTestId("lab-report")).toHaveCount(1);
  for (const ix of ["CBC with ESR", "HbA1c", "X-ray chest P/A view"]) {
    await page.getByTestId("ix-input").fill(ix);
    await page.getByTestId("ix-input").press("Enter");
  }
  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await page.waitForTimeout(800); // autosave debounce
  await page.getByTestId("finalize").click();
  await expect(page.getByTestId("print-frame")).toBeVisible();

  // Visit 2: the ordered tests are offered; quick entry splits values into one report per panel.
  await page.goto("/doctor#/");
  await page.getByRole("link", { name }).first().click();
  await page.getByRole("button", { name: "Start visit" }).click();
  await expect(card.getByTestId("lab-ordered-chip")).toHaveText(["+ CBC with ESR", "+ HbA1c", "+ X-ray chest P/A view"]);
  await card.getByTestId("lab-quick").fill("hba1c 7.4 hb 12.1 xyz 3");
  await card.getByTestId("lab-quick").press("Enter");
  await expect(card.getByTestId("lab-quick-error")).toHaveText("Didn't recognise: xyz 3");
  await card.getByTestId("lab-quick").fill("hba1c 7.4 hb 12.1");
  await card.getByTestId("lab-quick").press("Enter");
  await expect(card.getByTestId("lab-report")).toHaveCount(2);
  await expect(card.getByTestId("lab-ordered-chip")).toHaveText(["+ X-ray chest P/A view"]);
  await card.getByTestId("lab-ordered-chip").click();
  await expect(card.getByTestId("lab-title")).toHaveValue("X-ray chest P/A view");
  await card.getByTestId("lab-conclusion").fill("NAD");
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId("lab-ordered")).toHaveCount(0);

  // The trend: from the report editor, and on the patient's page.
  await card.getByTestId("lab-report").filter({ hasText: "HbA1c" }).getByRole("button", { name: "Edit" }).click();
  await card.getByTestId("lab-prev-4548-4").click();
  await expect(card.getByTestId("lab-trend-4548-4")).toContainText("8.1 → 7.4 %");
  await card.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByTestId("patient-trend-4548-4")).toContainText("8.1 → 7.4 %");
});

// A 2×2 PNG: the app re-encodes photos as JPEG before keeping them.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

test("report photos: taken offline, uploaded later, viewable, removable; the server checks every file", async ({ page, context, playwright }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E Labs Photo ${uniq()}`, age: "33", sex: "Female", mobile: mobile() });
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  const card = page.getByTestId("lab-reports");

  // Offline: the photo is kept on the device and shows straight away.
  await context.setOffline(true);
  await card.getByTestId("lab-add-cbc").click();
  await card.getByTestId("lab-value-718-7").fill("10.1");
  page.once("dialog", (d) => d.accept()); // the patient's consent, asked once
  await card.getByTestId("lab-file-input").setInputFiles({ name: "cbc.png", mimeType: "image/png", buffer: PNG });
  await expect(card.getByTestId("lab-editor").getByTestId("lab-file")).toHaveCount(1);
  await card.getByTestId("lab-save").click();
  const tile = card.getByTestId("lab-report").getByTestId("lab-file");
  await expect(tile.locator("img")).toBeVisible();
  const fileId = (await tile.getAttribute("data-file-id"))!;
  await tile.click();
  await expect(page.getByTestId("lab-file-viewer").locator("img")).toBeVisible();
  await page.getByTestId("lab-file-viewer").click();

  // Back online it uploads, as a JPEG, served only as a download that runs nothing.
  const uploaded = page.waitForResponse((r) => r.url().endsWith("/api/lab-files") && r.request().method() === "POST" && r.status() === 201, { timeout: 60_000 });
  await context.setOffline(false);
  await uploaded;
  const got = await page.request.get(`/api/lab-files/${fileId}`);
  expect(got.status()).toBe(200);
  expect(got.headers()["content-type"]).toBe("image/jpeg");
  expect(got.headers()["content-disposition"]).toMatch(/^attachment/);
  expect(got.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await got.body()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

  // Not signed in to a clinic: nothing.
  const stranger = await playwright.request.newContext({ baseURL: new URL(page.url()).origin });
  expect((await stranger.get(`/api/lab-files/${fileId}`)).status()).toBe(401);
  await stranger.dispose();

  // The server judges files by their bytes and size, and waits for the patient to sync.
  const post = (buffer: Buffer, patientId = crypto.randomUUID()) =>
    page.request.post("/api/lab-files", {
      multipart: { file: { name: "x.jpg", mimeType: "image/jpeg", buffer }, id: crypto.randomUUID(), patient_id: patientId, lab_report_id: crypto.randomUUID() },
    });
  expect((await post(Buffer.from("<svg onload=alert(1)>"))).status()).toBe(415);
  expect((await post(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)]))).status()).toBe(413);
  expect((await post(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).status()).toBe(409);

  // Removing the photo deletes it on the server too.
  await card.getByTestId("lab-report").getByRole("button", { name: "Edit" }).click();
  await card.getByTestId("lab-editor").getByTestId("lab-file-remove").click();
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId("lab-report").getByTestId("lab-file")).toHaveCount(0);
  await expect.poll(async () => (await page.request.get(`/api/lab-files/${fileId}`)).status(), { timeout: 60_000 }).toBe(404);
});
