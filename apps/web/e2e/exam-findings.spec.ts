import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("an ENT doctor can just write the findings of a section, and they print under it line by line", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123"); // demo doctor is an ENT specialist
  await waitSynced(page);
  await registerPatient(page, { name: `ENT Written ${uniq()}`, age: "35", sex: "Male", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");

  // Ear is open by default; its Findings box comes before the pickable answers.
  const ear = exam.getByTestId("exam-ear_notes");
  const top = async (l: ReturnType<typeof page.getByTestId>) => (await l.boundingBox())!.y;
  expect(await top(ear)).toBeLessThan(await top(exam.getByLabel("TM", { exact: true }).first()));
  await ear.fill("Wax in both EAC\nTM intact both sides");

  await exam.getByRole("button", { name: /^Throat/ }).click();
  await exam.getByTestId("exam-thr_notes").fill("Tonsils grade 2, congested");

  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await page.waitForTimeout(800); // exam autosave debounce
  await page.getByTestId("finalize").click();
  const frame = page.frameLocator("[data-testid=print-frame]");
  const earSection = frame.locator("section").filter({ has: frame.locator("h3", { hasText: /^Ear$/ }) });
  await expect(earSection.locator("li").first()).toHaveText("Findings: Wax in both EACTM intact both sides");
  await expect(earSection.locator("li").first().locator("br")).toHaveCount(1);
  await expect(frame.locator("section").filter({ has: frame.locator("h3", { hasText: /^Throat$/ }) })).toContainText("Findings: Tonsils grade 2, congested");
});

test("one-tap findings beside the throat, larynx and neck pictures mark them like a tap on the area", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `ENT Quick ${uniq()}`, age: "30", sex: "Female", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");

  await exam.getByRole("button", { name: /^Throat/ }).click();
  const oro = page.getByTestId("sketch-quick-oropharynx");
  await expect(oro.getByRole("button")).toHaveText(["Soft palate congested", "Posterior pharyngeal wall congested", "Tongue congested", "R tonsil congested", "L tonsil congested"]);
  const rTonsil = oro.getByRole("button", { name: "R tonsil congested" });
  await rTonsil.click();
  await expect(rTonsil).toHaveAttribute("aria-pressed", "true");
  await oro.getByRole("button", { name: "Soft palate congested" }).click();
  await expect(page.getByTestId("sketch-summary-oropharynx")).toContainText("R tonsil congested");
  await expect(page.getByTestId("sketch-summary-oropharynx")).toContainText(/soft palate congested/i);
  await rTonsil.click(); // again: cleared
  await expect(rTonsil).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("sketch-summary-oropharynx")).not.toContainText("R tonsil");

  const larynx = page.getByTestId("sketch-quick-larynx");
  await expect(larynx.getByRole("button")).toHaveText(["R vocal cord congested", "L vocal cord congested"]);
  await larynx.getByRole("button", { name: "L vocal cord congested" }).click();
  await expect(page.getByTestId("sketch-summary-larynx")).toContainText("L vocal cord congested");

  await exam.getByRole("button", { name: /^Neck/ }).click();
  const neck = page.getByTestId("sketch-quick-neck");
  await expect(neck.getByRole("button")).toHaveText(["Thyroid enlarged", "R level II enlarged", "L level II enlarged"]);
  await neck.getByRole("button", { name: "Thyroid enlarged" }).click();
  await expect(page.getByTestId("sketch-summary-neck")).toContainText(/thyroid enlarged/i);
});
