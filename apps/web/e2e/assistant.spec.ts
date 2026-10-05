import { expect, test } from "@playwright/test";
import { login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

test("assistant queues a patient and records vitals but cannot prescribe", async ({ page }) => {
  await login(page, "assistant@rx.local", "assist123");
  await waitSynced(page);
  await expect(page.getByRole("link", { name: "Templates" })).toHaveCount(0);
  await registerPatient(page, { name: `Queue Patient ${uniq()}`, age: "45", sex: "Male", mobile: mobile() });
  await expect(page.getByTestId("vital-pulse")).toBeVisible();
  await page.getByTestId("vital-pulse").fill("88");
  await expect(page.getByText("The doctor will write the prescription")).toBeVisible();
  await expect(page.getByTestId("med-search")).toHaveCount(0);

  // The server refuses prescription writes from an assistant even if the client is tampered with.
  const res = await page.request.post("/api/sync/upload", {
    data: { batch: [{ op: "PUT", table: "prescription", id: crypto.randomUUID(), data: { status: "final", doc: "{}" } }] },
  });
  const body = await res.json();
  expect(body.applied).toBe(0);
  expect(body.rejected[0].reason).toMatch(/assistant cannot write prescription/);
});
