import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("doctor writes, finalises and verifies a bilingual prescription", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const name = `E2E Patient ${uniq()}`;
  await registerPatient(page, { name, age: "34", sex: "Male", mobile: mobile() });
  await expect(page.getByTestId("med-search")).toBeVisible();

  await page.getByTestId("vital-weightKg").fill("70");
  await page.getByTestId("cc-input").fill("Ear discharge × 2 months");
  await page.getByTestId("cc-input").press("Enter");
  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await addMedicine(page, "moxacil", "1+1+1 af 7d");
  await addMedicine(page, "candistin", "2 drop tds re 7d"); // an Ear Drop in the catalogue
  const instructions = page.getByTestId("rx-instruction");
  await expect(instructions.nth(0)).toHaveText("১+০+১ — খাবারের পরে — ৫ দিন");
  await expect(instructions.nth(2)).toContainText("ফোঁটা করে দিনে ৩ বার");
  await expect(instructions.nth(2)).toContainText("ডান কানে");
  await page.getByTestId("dx-input").fill("CSOM");
  await page.getByTestId("dx-input").press("Enter");

  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.locator(".rx-item")).toHaveCount(3);
  await expect(frame.locator(".drug b").first()).toHaveText(/^NAPA EXTEND$/);
  await expect(frame.locator(".course")).toHaveText("সম্পূর্ণ কোর্স শেষ করুন"); // amoxicillin is an antibiotic
  await expect(frame.locator(".bmdc")).toContainText("A-12345");

  // After sync, the QR verification link resolves on the server.
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  const rxId = new URL(page.url()).hash.split("/")[2]!;
  const pdf = await page.request.get(`/api/print/${rxId}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const footnote = await frame.locator(".footnote").innerText();
  const token = footnote.split("/v/")[1]!.trim();
  await page.goto(`/v/${token}`);
  await expect(page.getByText("Genuine prescription issued via RxPad")).toBeVisible();
  await expect(page.getByText("MOXACIL")).toBeVisible();
});

test("back from print opens the prescription ready to edit, as the next version", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const name = `E2E Edit ${uniq()}`;
  await registerPatient(page, { name, age: "40", sex: "Female", mobile: mobile() });
  const tm = page.getByTestId("specialty-exam").getByLabel("TM", { exact: true }).nth(0);
  await tm.selectOption("Dull");
  await addMedicine(page, "candistin", "3 drop tds re 7d");
  await page.waitForTimeout(800); // exam autosave debounce
  await page.getByTestId("finalize").click();

  // "Back to visit" lands in an editable v2: no lock, no Edit button to press.
  await page.getByRole("link", { name: "← Back to visit" }).click();
  await expect(page.getByTestId("save-state")).toHaveText(/v2/);
  await expect(page.getByTestId("rx-locked")).toHaveCount(0);
  await tm.selectOption("Congested");
  await addMedicine(page, "candistin", "1 drop bd 5d");
  await page.waitForTimeout(800);
  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.getByText("R Congested")).toBeVisible();
  await expect(frame.locator(".rx-item")).toHaveCount(2);

  // The browser's Back does the same; going back again reuses that draft instead of adding versions.
  await page.goBack();
  await expect(page.getByTestId("save-state")).toHaveText(/v3/);
  await expect(tm).toBeEnabled();
  await page.getByRole("link", { name: "Preview" }).click();
  await page.getByRole("link", { name: "← Back to visit" }).click();
  await expect(page.getByTestId("save-state")).toHaveText(/v3/);
  await expect(page.getByLabel("Version").locator("option")).toHaveCount(3);

  // Printed versions stay locked when picked on purpose.
  await page.getByLabel("Version").selectOption({ label: "v1 · final" });
  await expect(page.getByTestId("rx-locked")).toContainText("Finalised & printed (v1)");

  // Patient history shows the printed v2, not the unprinted v3 draft.
  await page.getByRole("link", { name }).click();
  await expect(page.getByText("final v2")).toBeVisible();
});

test("after printing, the doctor goes back to Today for the next patient", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const name = `E2E Done ${uniq()}`;
  await registerPatient(page, { name, age: "28", sex: "Male", mobile: mobile() });
  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.locator(".rx-item")).toHaveCount(1);
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 }); // preview stops re-rendering

  // Headless Chromium has no print dialog: stand in for one that closes straight away.
  const printAndClose = async (answer: "accept" | "dismiss") => {
    await page.getByTestId("print-frame").evaluate((f: HTMLIFrameElement) => {
      const w = f.contentWindow!;
      w.print = () => w.dispatchEvent(new Event("afterprint"));
    });
    // Handle the popup as it opens: the click doesn't finish while a popup is up.
    let message = "";
    page.once("dialog", (d) => { message = d.message(); void d[answer](); });
    await page.getByTestId("print").click();
    await expect.poll(() => message).toBe("Done printing? Go to Today for the next patient.");
  };

  // Cancel keeps the print screen (to reprint or share).
  await printAndClose("dismiss");
  await expect(page.getByTestId("print-frame")).toBeVisible();

  // OK goes to Today, where the visit is done.
  await printAndClose("accept");
  await expect(page.getByRole("heading", { name: /^Today/ })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row.getByText("done", { exact: true })).toBeVisible();

  // Viewing it later shows the printed prescription, locked; no new draft is made.
  await row.getByRole("link", { name: "View" }).click();
  await expect(page.getByTestId("rx-locked")).toContainText("Finalised & printed (v1)");
  await expect(page.getByLabel("Version")).toHaveCount(0); // the picker only shows with 2+ versions
});
