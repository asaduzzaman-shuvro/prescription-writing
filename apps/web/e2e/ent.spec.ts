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
  // A grommet on the left drum, and a free-hand line on the right one.
  const tools = page.getByTestId("eardrum-tools");
  await tools.getByRole("button", { name: "Mark", exact: true }).click();
  await tools.getByLabel("Mark type").selectOption("grommet");
  const left = (await page.getByTestId("eardrum-left").boundingBox())!;
  await page.mouse.click(left.x + left.width * 0.6, left.y + left.height * 0.6);
  await tools.getByRole("button", { name: "Pen", exact: true }).click();
  const right = (await page.getByTestId("eardrum-right").boundingBox())!;
  await page.mouse.move(right.x + right.width * 0.3, right.y + right.height * 0.35);
  await page.mouse.down();
  await page.mouse.move(right.x + right.width * 0.45, right.y + right.height * 0.42, { steps: 10 });
  await page.mouse.up();
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
  await expect(frame.getByText("R: perforation AI+PI; drawing · L: grommet")).toBeVisible();
  await expect(frame.locator("figure.diagram", { hasText: "Right TM" }).locator("polyline")).toHaveCount(1);
  await expect(frame.locator("figure.diagram.legend")).toContainText("Grommet");
  await expect(frame.getByText(/R 47.5 dB \(Moderate, A-B gap 30 dB\)/)).toBeVisible();
  await expect(frame.locator(".diagram svg")).toHaveCount(4); // 2 drums, the key, the audiogram
  await expect(frame.locator(".instr")).toContainText("ডান কানে");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/ent-print.png`, fullPage: true });
});

test("ENT doctor can always print blank TM maps, to mark by pen", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const setAlways = async (on: boolean) => {
    await page.goto("/doctor#/settings");
    await page.getByTestId("tm-map-always").setChecked(on);
    await page.getByTestId("save-print").click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page.getByTestId("tm-map-always")).toBeChecked({ checked: on });
  };
  await setAlways(true);
  try {
    await registerPatient(page, { name: `ENT Blank ${uniq()}`, age: "40", sex: "Male", mobile: mobile() });
    await expect(page.getByTestId("specialty-exam")).toBeVisible();
    await addMedicine(page, "candistin", "3 drop tds re 7d");
    await page.getByTestId("finalize").click();
    const frame = page.frameLocator("[data-testid=print-frame]");
    await expect(frame.locator("figcaption", { hasText: /^(Right|Left) TM$/ })).toHaveCount(2);
    await expect(frame.locator("figure.diagram.legend")).toHaveCount(0);
  } finally {
    // Print settings live on the shared demo chamber: don't leak into the other tests.
    await setAlways(false);
    await waitSynced(page);
  }
});
