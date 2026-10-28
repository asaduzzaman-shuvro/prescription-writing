import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

type Row = Record<string, unknown>;

const upload = (page: Page, data: Row, id: string = crypto.randomUUID(), op = "PUT") =>
  page.request
    .post("/api/sync/upload", { data: { batch: [{ op, table: "custom_medicine", id, data }] } })
    .then((r) => r.json() as Promise<{ applied: number; rejected: { reason: string }[] }>);

async function pull(request: APIRequestContext, part: "clinic" | "catalogue", table: string): Promise<Row[]> {
  const res = await request.get(`/api/sync/pull?part=${part}`);
  const body = (await res.json()) as Record<string, Record<string, Row[]>>;
  return body[part]?.[table] ?? [];
}

const customRow = (request: APIRequestContext, id: string) => pull(request, "clinic", "custom_medicine").then((rows) => rows.find((r) => r.id === id));

/** A dosage form and a generic from the synced catalogue, for medicines added through the API. */
async function catalogueIds(page: Page) {
  const forms = await pull(page.request, "catalogue", "dosage_form");
  const generics = await pull(page.request, "catalogue", "generic");
  return {
    formId: String(forms.find((f) => f.name === "Tablet")?.id ?? forms[0]!.id),
    genericId: String(generics.find((g) => g.name === "Paracetamol")?.id ?? generics[0]!.id),
  };
}

test("a doctor adds a medicine while prescribing; only they see it until the admin approves it for everyone", async ({ page, browser }) => {
  const brand = `Zyxolin ${uniq()}`;
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E Custom Med ${uniq()}`, age: "30", sex: "Male", mobile: mobile() });

  // Not in the catalogue: the search offers to add it, and it goes straight into the prescription.
  await page.getByTestId("med-search").fill(brand);
  await page.getByTestId("med-add-new").click();
  const modal = page.getByTestId("add-medicine-modal");
  await expect(modal.getByTestId("add-med-brand")).toHaveValue(brand);
  await modal.getByTestId("add-med-save").click();
  await expect(modal.getByText("Form is required")).toBeVisible();
  await modal.getByTestId("add-med-form").selectOption({ label: "Tablet" });
  await modal.getByTestId("add-med-strength").fill("250 mg");
  await modal.getByTestId("add-med-generic").fill("paracetamol");
  await modal.getByTestId("add-med-generic-results").getByRole("button", { name: "Paracetamol", exact: true }).click();
  await modal.getByTestId("add-med-save").click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByTestId("rx-item")).toHaveCount(1);
  await page.getByTestId("rx-shortcut").fill("1+0+1 af 5d");
  await page.getByTestId("rx-shortcut").press("Enter");

  // Finalising works (the item is not a catalogue product yet) and nothing is refused on the server.
  await page.getByTestId("finalize").click();
  await expect(page.frameLocator("[data-testid=print-frame]").locator(".drug b").first()).toHaveText(brand.toUpperCase());
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  await expect(page.getByTestId("sync-rejected")).toHaveCount(0);

  const mine = (await pull(page.request, "clinic", "custom_medicine")).find((r) => r.brand_name === brand);
  expect(mine).toMatchObject({ status: "pending", strength_text: "250 mg", generic_text: "Paracetamol" });
  const id = String(mine!.id);

  // The doctor's own search labels it; another user of the same clinic never receives it.
  await page.goto("/doctor#/medicines");
  await expect(page.getByTestId("my-medicines")).toContainText(brand);
  await expect(page.getByTestId("my-medicines").getByTestId("custom-med-badge").first()).toBeVisible();
  const assistant = await browser.newContext();
  const assistantPage = await assistant.newPage();
  await login(assistantPage, "assistant@rx.local", "assist123");
  expect(await customRow(assistantPage.request, id)).toBeUndefined();

  // The platform admin reviews it, fixes it up and approves it.
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, "admin@rx.local", "admin123");
  await adminPage.goto("/admin/medicine-requests");
  await adminPage.getByRole("link", { name: new RegExp(brand) }).click();
  await expect(adminPage.getByText(/Added by .*Farhana/)).toBeVisible();
  await expect(adminPage.getByTestId("request-summary")).toContainText("Paracetamol");
  await adminPage.locator("select").nth(1).selectOption({ index: 1 }); // company: required for a catalogue product
  await adminPage.getByRole("button", { name: "Approve & add for all doctors" }).click();
  await expect(adminPage.getByText(/Approved: the medicine is now in the catalogue/)).toBeVisible();

  // The product keeps the doctor's id, so every device (the assistant's included) gets it from the catalogue.
  expect(await customRow(page.request, id)).toMatchObject({ status: "approved", approved_product_id: id });
  await expect
    .poll(async () => (await pull(assistantPage.request, "catalogue", "brand_product")).some((p) => p.id === id), { timeout: 90_000, intervals: [5_000] })
    .toBe(true);

  await assistant.close();
  await admin.close();
});

test("the server checks doctor-added medicines; a reviewed one is rejected or merged, never edited", async ({ page, browser }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  const { formId, genericId } = await catalogueIds(page);

  expect((await upload(page, { brand_name: "No form", generic_text: "x" })).rejected[0]!.reason).toBe("form is required");
  expect((await upload(page, { brand_name: "No generic", form_id: formId })).rejected[0]!.reason).toBe("generic is required");
  expect((await upload(page, { brand_name: "Bad ids", form_id: formId, generic_ids: '["nope"]' })).rejected[0]!.reason).toBe("invalid generics");

  const toReject = crypto.randomUUID();
  const toMerge = crypto.randomUUID();
  const rejectBrand = `Rejectol ${uniq()}`;
  const mergeBrand = `Napa copy ${uniq()}`;
  expect(await upload(page, { brand_name: rejectBrand, form_id: formId, generic_text: "Herbal mix" }, toReject)).toEqual({ applied: 1, rejected: [] });
  expect(await upload(page, { brand_name: mergeBrand, form_id: formId, generic_ids: JSON.stringify([genericId]) }, toMerge)).toEqual({ applied: 1, rejected: [] });
  // Status is the admin's: a doctor can't approve their own medicine.
  expect(await upload(page, { status: "approved" }, toReject, "PATCH")).toEqual({ applied: 1, rejected: [] });
  expect(await customRow(page.request, toReject)).toMatchObject({ status: "pending" });

  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, "admin@rx.local", "admin123");

  await adminPage.goto(`/admin/medicine-requests/${toReject}`);
  await expect(adminPage.getByText(/Not linked to a catalogue generic: Herbal mix/)).toBeVisible();
  await adminPage.getByTestId("request-reject").click();
  await adminPage.getByTestId("request-reject-note").fill("Not registered with DGDA");
  await adminPage.getByRole("dialog").getByRole("button", { name: "Don't approve", exact: true }).click();
  await expect(adminPage.getByText(/Not approved: the medicine stays private/)).toBeVisible();
  expect(await customRow(page.request, toReject)).toMatchObject({ status: "rejected", review_note: "Not registered with DGDA" });
  expect((await upload(page, { brand_name: "Renamed" }, toReject, "PATCH")).rejected[0]!.reason).toBe("this medicine has already been reviewed");

  await adminPage.goto(`/admin/medicine-requests/${toMerge}`);
  await adminPage.getByPlaceholder("Search the catalogue…").fill("napa extend");
  await adminPage.getByRole("button", { name: /NAPA EXTEND|Napa Extend/ }).first().click();
  await adminPage.getByTestId("request-merge").click();
  await adminPage.getByRole("dialog").getByRole("button", { name: "Merge", exact: true }).click();
  await expect(adminPage.getByText(/Merged: the doctor now sees the existing catalogue medicine/)).toBeVisible();
  const merged = await customRow(page.request, toMerge);
  expect(merged).toMatchObject({ status: "approved" });
  expect(merged!.approved_product_id).not.toBe(toMerge);

  await admin.close();
});
