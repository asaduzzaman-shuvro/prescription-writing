import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("ENT doctor records structured exam, eardrum map and audiogram; they print with diagrams", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123"); // demo doctor is an ENT specialist
  await waitSynced(page);
  await registerPatient(page, { name: `ENT Patient ${uniq()}`, age: "28", sex: "Female", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");
  await expect(exam).toBeVisible();

  // Ear section is open by default. Right TM perforated, left intact.
  const tm = exam.getByLabel("TM", { exact: true });
  await tm.nth(0).selectOption("Perforated");
  await tm.nth(1).selectOption("Intact");
  await page.getByTestId("eardrum-right").locator('[data-zone="ai"]').click();
  await page.getByTestId("eardrum-right").locator('[data-zone="pi"]').click();
  await exam.getByLabel("Discharge").nth(0).selectOption("Mucopurulent");

  // Audiology section
  await exam.getByRole("button", { name: /Audiology/ }).click();
  for (const [f, db] of [[500, 40], [1000, 45], [2000, 50], [4000, 55]] as const) await exam.getByLabel(`right ac ${f}`).fill(String(db));
  for (const [f, db] of [[500, 10], [1000, 15], [2000, 20]] as const) await exam.getByLabel(`right bc ${f}`).fill(String(db));
  await expect(exam.getByText("PTA 47.5 dB (Moderate) · A-B gap 30 dB")).toBeVisible();

  await addMedicine(page, "candistin", "3 drop tds re 7d");
  await page.waitForTimeout(800); // exam autosave debounce
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/ent-editor.png`, fullPage: true });
  await page.getByTestId("finalize").click();

  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.locator("section h3", { hasText: "Ear" })).toBeVisible();
  await expect(frame.getByText("R Perforated, L Intact")).toBeVisible();
  await expect(frame.getByText("R: perforation AI+PI")).toBeVisible();
  await expect(frame.getByText(/R 47.5 dB \(Moderate, A-B gap 30 dB\)/)).toBeVisible();
  await expect(frame.locator(".diagram svg")).toHaveCount(3);
  await expect(frame.locator(".instr")).toContainText("ডান কানে");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/ent-print.png`, fullPage: true });
});
