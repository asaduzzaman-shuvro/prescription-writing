import { expect, test, type Page } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

const NUMBERED = 'content: "Page " counter(page) " of " counter(pages)';

/** An ENT visit with written ear, nose and throat findings, two medicines and a letter: a little over one page. */
async function longEntPrescription(page: Page, name: string) {
  await registerPatient(page, { name, age: "42", sex: "Male", mobile: mobile() });
  const exam = page.getByTestId("specialty-exam");
  await exam.getByTestId("exam-ear_notes").fill("Wax in both EAC\nR TM central perforation, L TM intact\nTuning fork: Rinne -ve R");
  await exam.getByRole("button", { name: /^Nose/ }).click();
  await exam.getByTestId("exam-nose_notes").fill("DNS to left with spur\nInferior turbinates hypertrophied\nPND present");
  await exam.getByRole("button", { name: /^Throat/ }).click();
  await exam.getByTestId("exam-thr_notes").fill("Tonsils grade 2, congested\nPPW granular");
  await page.getByTestId("sketch-quick-oropharynx").getByRole("button", { name: "R tonsil congested" }).click();
  await addMedicine(page, "napa extend", "1+0+1 af 5d");
  await addMedicine(page, "candistin", "3 drop tds re 7d");
  await page.getByTestId("rx-note").fill(Array.from({ length: LETTER_LINES }, (_, i) => `Line ${i + 1} of the referral letter.`).join("\n"));
  await page.waitForTimeout(800); // exam and note autosave debounce
  await page.getByTestId("finalize").click();
}
/** Enough letter to run past one page at the natural size, but not past one page at 80%. */
const LETTER_LINES = 34;

const css = (page: Page) => () => page.frameLocator("[data-testid=print-frame]").locator("style").evaluate((el) => el.textContent ?? "");

async function pdfPages(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  const rxId = new URL(page.url()).hash.split("/")[2]!;
  const pdf = (await (await page.request.get(`/api/print/${rxId}/pdf`)).body()).toString("latin1");
  return pdf.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
}

test("a prescription a little over one page is fitted onto one, in the preview and the PDF", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123"); // demo doctor is an ENT specialist
  await waitSynced(page);
  await longEntPrescription(page, `Fit One ${uniq()}`);

  // The preview steps the body down until it fits; Print waits for it.
  await expect(page.getByTestId("print")).toHaveText("Print", { timeout: 15_000 });
  await expect(page.getByTestId("fit-note")).toContainText("Fitted to one page");
  expect(await css(page)()).toContain("/* Fit to one page: level");
  expect(await css(page)()).not.toContain(NUMBERED);
  // Header and signature keep their size.
  const frame = page.frameLocator("[data-testid=print-frame]");
  const px = (sel: string) => frame.locator(sel).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await px(".sign .line")).toBeCloseTo((11 * 96) / 72, 1); // 11pt
  expect(await px("header .dname")).toBeCloseTo((1.35 * 11 * 96) / 72, 1);
  expect(await px(".rx-item")).toBeLessThan((11 * 96) / 72);

  // The server PDF fits it the same way.
  expect(await pdfPages(page)).toBe(1);
});

test("with Fit to one page off, the same prescription prints on numbered pages", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  // The form shows the defaults until the chamber's own settings load: wait for the chamber before touching it.
  const openSettings = async () => {
    await page.goto("/doctor#/settings");
    await page.reload();
    await expect(page.getByTestId("print-chamber")).toBeVisible();
  };
  const setFit = async (on: boolean) => {
    await openSettings();
    await page.getByTestId("fit-one-page").setChecked(on);
    await page.getByTestId("save-print").click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await openSettings();
    await expect(page.getByTestId("fit-one-page")).toBeChecked({ checked: on });
  };
  await setFit(false);
  try {
    await longEntPrescription(page, `Fit Off ${uniq()}`);
    await expect.poll(css(page), { timeout: 15_000 }).toContain(NUMBERED);
    expect(await css(page)()).not.toContain("/* Fit to one page");
    await expect(page.getByTestId("fit-note")).toHaveCount(0);
    expect(await pdfPages(page)).toBeGreaterThan(1);
  } finally {
    await setFit(true);
  }
});
