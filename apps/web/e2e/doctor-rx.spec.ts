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
