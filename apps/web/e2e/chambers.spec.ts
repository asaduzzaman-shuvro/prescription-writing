import { expect, test } from "@playwright/test";
import { login, uniq, waitSynced } from "./helpers";

test("doctor adds a chamber with a schedule, serial phone and footer note", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await page.goto("/doctor#/settings");
  // "Zz" keeps it after the seeded chamber, so other tests keep their default chamber.
  const name = `Zz E2E Chamber ${uniq()}`;
  await page.getByTestId("chamber-new").click();
  await page.getByTestId("chamber-name").fill(name);
  await page.getByTestId("chamber-address").fill("Rajbari");
  await page.getByTestId("chamber-room").fill("305");
  await page.getByTestId("chamber-serial").fill("01781-000000");
  await page.getByTestId("chamber-add-slot").click();
  for (const d of ["রবি", "মঙ্গল", "বৃহঃ"]) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByLabel("From", { exact: true }).fill("09:00");
  await page.getByLabel("To", { exact: true }).fill("10:00");
  await page.getByTestId("chamber-footer").fill("পরামর্শের ৫ কর্মদিবসের মধ্যে রিপোর্ট দেখাতে ভিজিট লাগবে না।");
  await page.getByTestId("chamber-save").click();

  const row = page.getByTestId("chamber-row").filter({ hasText: name });
  await expect(row).toContainText("রবিবার, মঙ্গলবার ও বৃহস্পতিবার, সকাল ৯টা - ১০টা");
  await expect(row).toContainText("সিরিয়াল: 01781-000000");
  await expect(row).toContainText("রুম নং: 305");
  // The new chamber reaches the server through the sync upload.
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });

  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row).toContainText("(inactive)");
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
});
