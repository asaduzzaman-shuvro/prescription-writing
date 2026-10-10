import { expect, test } from "@playwright/test";
import { login, mobile, openVisitReports, registerPatient, uniq, waitSynced } from "./helpers";

test("the assistant prepares a lab report: picks tests, enters results, prints with a Lab No and as a PDF", async ({ page }) => {
  await login(page, "assistant@rx.local", "assist123");
  await waitSynced(page);
  const name = `E2E Lab ${uniq()}`;
  // Registered and queued for the doctor: the lab report joins that visit.
  const phone = mobile();
  await registerPatient(page, { name, age: "45", sex: "Female", mobile: phone });
  await expect(page).toHaveURL(/#\/visit\//);

  await page.getByRole("navigation").getByRole("link", { name: "Lab", exact: true }).click();
  await page.getByRole("link", { name: "+ New lab report" }).click();
  await page.getByTestId("patient-search").fill(phone);
  await page.getByRole("button", { name: "Select" }).click();
  await expect(page.getByTestId("lab-patient")).toContainText(name);
  await page.getByTestId("lab-referred-by").fill("Dr. Farhana Rahman");

  // Nothing chosen, or a chosen test left empty, isn't saved.
  await page.getByTestId("lab-save-request").click();
  await expect(page.getByTestId("lab-request-error")).toHaveText("Choose at least one test.");
  await page.getByTestId("lab-pick-cbc").click();
  await page.getByTestId("lab-save-request").click();
  await expect(page.getByTestId("lab-request-error")).toHaveText("Enter the results of CBC, or remove it.");

  const cbc = page.getByTestId("lab-panel-cbc");
  await cbc.getByTestId("lab-in-718-7").fill("9.2");
  await expect(cbc.getByTestId("lab-in-flag-718-7")).toHaveText("L");
  await cbc.getByTestId("lab-in-6690-2").fill("11800");
  await cbc.getByTestId("lab-in-777-3").fill("250000");

  await page.getByTestId("lab-test-filter").fill("urine");
  await page.getByTestId("lab-pick-urine").click();
  await page.getByTestId("lab-pick-urine-cs").click();
  const urine = page.getByTestId("lab-panel-urine");
  await urine.getByTestId("lab-in-5778-6").selectOption("Pale yellow");
  await urine.getByTestId("lab-in-5821-4").fill("8-10");
  await expect(urine.getByTestId("lab-in-flag-5821-4")).toHaveText("H");
  const cs = page.getByTestId("lab-panel-urine-cs");
  await cs.getByTestId("lab-in-630-4-growth").selectOption("growth");
  await cs.getByTestId("lab-in-630-4-organism-0").fill("Escherichia coli");
  await cs.getByTestId("lab-in-630-4-count-0").fill(">10⁵ CFU/mL");
  await cs.getByTestId("lab-in-630-4-sir-0-Nitrofurantoin").selectOption("S");
  await cs.getByTestId("lab-in-630-4-sir-0-Ciprofloxacin").selectOption("R");
  await expect(cs.getByTestId("lab-in-flag-630-4")).toHaveText("A");

  await page.getByTestId("lab-save-print").click();
  const frame = page.frameLocator("[data-testid=lab-print-frame]");
  await expect(frame.locator(".sheet")).toHaveCount(3); // haematology, clinical pathology, microbiology
  await expect(frame.locator("h2")).toHaveText(["Haematology report", "Clinical pathology report", "Microbiology report"]);
  await expect(frame.locator("tr.abn").filter({ hasText: "WBC" })).toContainText("11,800 H");
  await expect(frame.locator("tr.abn").filter({ hasText: "Hb" }).first()).toContainText("9.2 L");
  await expect(frame.locator(".sheet").first()).toContainText("Dr. Farhana Rahman");
  await expect(frame.locator("tr.sir-R")).toContainText("Ciprofloxacin");

  // Once the report reaches the server it has a Lab No, the same on every page.
  await expect(page.getByTestId("lab-print-no")).toHaveText(/^Lab No L-\d{6}$/, { timeout: 60_000 });
  const labNo = (await page.getByTestId("lab-print-no").textContent())!.replace("Lab No ", "");
  await expect(frame.locator(".patient").first()).toContainText(labNo);
  await expect(frame.locator(".sheet").first()).toContainText("Prepared by");
  await expect(frame.locator(".sheet").first()).toContainText("Assistant"); // the server's "prepared by" name

  const requestId = /#\/lab\/([0-9a-f-]{36})\/print/.exec(page.url())![1]!;
  const pdf = await page.request.get(`/api/print/lab/${requestId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // On the worklist, and editable: taking a test off the request removes it.
  await page.getByRole("navigation").getByRole("link", { name: "Lab", exact: true }).click();
  const row = page.getByTestId("lab-request").filter({ hasText: name });
  await expect(row.getByTestId("lab-no")).toHaveText(labNo);
  await row.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByTestId("lab-panel-cbc").getByTestId("lab-in-718-7")).toHaveValue("9.2");
  await expect(page.getByTestId("lab-panel-urine").getByTestId("lab-in-5821-4")).toHaveValue("8-10");
  await page.getByTestId("lab-panel-urine-cs").getByRole("button", { name: "Remove test" }).click();
  await page.getByTestId("lab-save-print").click();
  await expect(frame.locator(".sheet")).toHaveCount(2);
  await expect(page.getByTestId("lab-print-no")).toHaveText(`Lab No ${labNo}`);

  // The patient's page lists the clinic's reports with the rest.
  await page.goto("/doctor#/patients");
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByTestId("patient-lab-reports")).toContainText("CBC");
  await expect(page.getByTestId("patient-lab-reports")).toContainText("Urine R/M/E");
});

test("the doctor sees the clinic's lab report in the patient's visit, flagged", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const name = `E2E Lab Visit ${uniq()}`;
  const phone = mobile();
  await registerPatient(page, { name, age: "60", sex: "Male", mobile: phone });
  await expect(page).toHaveURL(/#\/visit\//);
  await openVisitReports(page);
  const visitUrl = page.url();

  await page.getByRole("navigation").getByRole("link", { name: "Lab", exact: true }).click();
  await page.getByRole("link", { name: "+ New lab report" }).click();
  await page.getByTestId("patient-search").fill(phone);
  await page.getByRole("button", { name: "Select" }).click();
  await page.getByTestId("lab-pick-rft").click();
  await page.getByTestId("lab-panel-rft").getByTestId("lab-in-2160-0").fill("1.9");
  await page.getByTestId("lab-save-request").click();
  await expect(page.getByTestId("lab-worklist")).toContainText(name);

  await page.goto(visitUrl);
  await openVisitReports(page);
  const card = page.getByTestId("lab-reports");
  await expect(card.getByTestId("lab-report")).toHaveCount(1);
  await expect(card.getByTestId("lab-result-2160-0")).toHaveText("S. creatinine 1.9 mg/dL (H)");
});
