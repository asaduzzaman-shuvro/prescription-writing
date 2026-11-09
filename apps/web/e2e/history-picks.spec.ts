import { expect, test } from "@playwright/test";
import { login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("history quick picks fill the History box with commas, and the doctor can write more", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E History ${uniq()}`, age: "55", sex: "Male", mobile: mobile() });
  const picks = page.getByTestId("history-picks");
  const box = page.getByTestId("history-text");

  await picks.getByRole("button", { name: "DM", exact: true }).click();
  await picks.getByRole("button", { name: "HTN", exact: true }).click();
  await picks.getByRole("button", { name: "BA", exact: true }).click();
  await expect(box).toHaveValue("DM, HTN, BA");
  await expect(picks.getByRole("button", { name: "HTN", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Tapping again takes just that one out.
  await picks.getByRole("button", { name: "HTN", exact: true }).click();
  await expect(box).toHaveValue("DM, BA");
  await expect(picks.getByRole("button", { name: "HTN", exact: true })).toHaveAttribute("aria-pressed", "false");

  // Free text stays; later picks join the first line.
  await box.press("End");
  await box.pressSequentially("\nOn insulin for 5 yrs");
  await picks.getByRole("button", { name: "PTB", exact: true }).click();
  await expect(box).toHaveValue("DM, BA, PTB\nOn insulin for 5 yrs");

  // A pick typed by hand counts as picked.
  await box.fill("dm, Smoker");
  await expect(picks.getByRole("button", { name: "DM", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(picks.getByRole("button", { name: "Smoker", exact: true })).toHaveAttribute("aria-pressed", "true");
});
