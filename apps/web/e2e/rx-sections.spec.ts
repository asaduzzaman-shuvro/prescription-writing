import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("Ref By from registration (screen only), O/E findings, plan, note and follow-up date print like a real pad", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E Referral ${uniq()}`, age: "26", sex: "Male", mobile: mobile(), refBy: "Dr. Imran" });
  await expect(page.getByTestId("med-search")).toBeVisible();

  // Named on the registration form, it pre-fills the first prescription.
  await expect(page.getByTestId("ref-by")).toHaveValue("Dr. Imran");
  await page.getByTestId("oe-add").click();
  await page.getByTestId("oe-label").fill("Pulse");
  await page.getByTestId("oe-value").fill("Normal");
  await page.getByTestId("dx-input").fill("Cellulitis of Left Lower Limb");
  await page.getByTestId("dx-input").press("Enter");
  await page.getByTestId("add-referral").click();
  await page.getByTestId("referral-to").fill("Vascular Surgery Dept., BSMMU");
  await page.getByTestId("referral-doctor").fill("Dr. Tarek");
  await page.getByTestId("referral-add").click();
  await page.getByTestId("notes-input").fill("H/O DM");
  await page.getByTestId("notes-input").press("Enter");
  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await page.getByTestId("referral-reply").click();
  await expect(page.getByTestId("rx-note")).toHaveValue(/^Dear Dr\. Imran,\nThank you for the referral\./);
  await page.getByLabel("Follow-up").selectOption("after");

  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  await expect(frame.locator(".visit-no")).toHaveText("Visit No: 1");
  await expect(frame.locator(".patient")).not.toContainText("Ref By");
  await expect(frame.locator(".patient")).toContainText("Pulse: Normal"); // O/E values print after the patient ID
  await expect(frame.locator(".left")).toContainText("Refd to Vascular Surgery Dept., BSMMU — Dr. Tarek");
  await expect(frame.locator(".left")).toContainText("H/O DM");
  await expect(frame.locator(".rx-note")).toContainText("Referred back to Dr. Imran.");
  await expect(frame.locator(".instr").first()).toHaveText(/ — ৫ দিন$/); // the duration ends the instruction line
  await expect(frame.locator(".right")).toContainText(/৭ দিন পর আসবেন। \(তারিখঃ [০-৯]{2}-[০-৯]{2}-[০-৯]{4}\)/);
});
