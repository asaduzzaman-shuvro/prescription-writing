import { expect, test, type Page } from "@playwright/test";
import { login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

const upload = (page: Page, table: string, data: Record<string, unknown>, id: string = crypto.randomUUID(), op = "PUT") =>
  page.request.post("/api/sync/upload", { data: { batch: [{ op, table, id, data }] } }).then((r) => r.json() as Promise<{ applied: number; rejected: { reason: string }[] }>);

test("a clinic's own lab test reaches its devices; catalogue rows are checked on the server", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const code = `x-e2e-${uniq()}`;
  const testId = crypto.randomUUID(), panelId = crypto.randomUUID();

  // Malformed rows, or a second row for the same code, are refused.
  expect((await upload(page, "lab_test", { code, name: "Bad", short: "Bad", kind: "colour" })).rejected[0]!.reason).toBe("invalid kind");
  expect((await upload(page, "lab_test", { code: "has spaces", name: "Bad", short: "Bad", kind: "numeric" })).rejected[0]!.reason).toBe("invalid code");
  expect((await upload(page, "lab_test", { code, name: "Bad", short: "Bad", kind: "numeric", spec: "[1]" })).rejected[0]!.reason).toBe("spec must be an object");

  const added = await upload(page, "lab_test", {
    code, name: "Serum zinc", short: "Zinc", unit: "µg/dL", kind: "numeric", department: "biochemistry", sort_order: 9000, is_active: 1,
    spec: JSON.stringify({ range: { low: 70, high: 120 }, aliases: [code] }),
  }, testId);
  expect(added).toEqual({ applied: 1, rejected: [] });
  expect((await upload(page, "lab_test", { code, name: "Again", short: "Again", kind: "numeric" })).rejected[0]!.reason).toMatch(/already has a row/);
  expect((await upload(page, "lab_test", { code: `${code}-renamed` }, testId, "PATCH")).rejected[0]!.reason).toMatch(/can't change/);
  await upload(page, "lab_panel", { key: code, name: `Zinc ${code}`, department: "biochemistry", sort_order: 9000, is_active: 1, spec: JSON.stringify({ sections: [{ tests: [code] }] }) }, panelId);

  // It syncs down and joins the clinic's catalogue: offered under More tests, flagged against its range.
  await registerPatient(page, { name: `E2E Labs Own ${uniq()}`, age: "35", sex: "Female", mobile: mobile() });
  const card = page.getByTestId("lab-reports");
  await expect(card.getByTestId("lab-add-more").locator("option", { hasText: `Zinc ${code}` })).toHaveCount(1, { timeout: 30_000 });
  await card.getByTestId("lab-add-more").selectOption({ label: `Zinc ${code}` });
  await card.getByTestId(`lab-value-${code}`).fill("55");
  await expect(card.getByTestId(`lab-flag-${code}`)).toHaveText("L");
  await card.getByTestId("lab-save").click();
  await expect(card.getByTestId(`lab-result-${code}`)).toHaveText("Zinc 55 µg/dL (L)");

  // Hidden again (rows are never deleted), it leaves the list; the saved result keeps its name.
  expect(await upload(page, "lab_panel", { is_active: 0 }, panelId, "PATCH")).toEqual({ applied: 1, rejected: [] });
  expect(await upload(page, "lab_test", { is_active: 0 }, testId, "PATCH")).toEqual({ applied: 1, rejected: [] });
  await expect(card.getByTestId("lab-add-more").locator("option", { hasText: `Zinc ${code}` })).toHaveCount(0, { timeout: 30_000 });
  await expect(card.getByTestId(`lab-result-${code}`)).toHaveText("Zinc 55 µg/dL (L)");
});

test("the assistant can't change the catalogue", async ({ page }) => {
  await login(page, "assistant@rx.local", "assist123");
  await waitSynced(page);
  const body = await upload(page, "lab_test", { code: `x-e2e-${uniq()}`, name: "Nope", short: "Nope", kind: "numeric" });
  expect(body.rejected[0]!.reason).toBe("role assistant cannot write lab_test");
});
