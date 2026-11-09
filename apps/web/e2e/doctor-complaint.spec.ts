import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { login, mobile, registerPatient, uniq, waitSynced } from "./helpers";

type Row = Record<string, unknown>;

const upload = (page: Page, data: Row, id: string = crypto.randomUUID(), op = "PUT") =>
  page.request
    .post("/api/sync/upload", { data: { batch: [{ op, table: "doctor_complaint", id, data }] } })
    .then((r) => r.json() as Promise<{ applied: number; rejected: { reason: string }[] }>);

async function pull(request: APIRequestContext, table: string): Promise<Row[]> {
  const res = await request.get("/api/sync/pull?part=clinic");
  const body = (await res.json()) as Record<string, Record<string, Row[]>>;
  return body.clinic?.[table] ?? [];
}

const lineRow = (request: APIRequestContext, id: string) => pull(request, "doctor_complaint").then((rows) => rows.find((r) => r.id === id));

test("a doctor saves their own C/C line while prescribing; only they see it until the admin shares it", async ({ page, browser }) => {
  const line = `Fever for 3 days ${uniq()}`;
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E CC ${uniq()}`, age: "30", sex: "Male", mobile: mobile() });

  // Typed text that is not in the list can be saved for next time; it is also added to this prescription.
  await page.getByTestId("cc-input").fill(line);
  await page.getByTestId("cc-input-save").click();
  await expect(page.getByText(line, { exact: true })).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  await expect(page.getByTestId("sync-rejected")).toHaveCount(0);

  const mine = (await pull(page.request, "doctor_complaint")).find((r) => r.name === line);
  expect(mine).toMatchObject({ status: "pending", is_active: 1, replaces_complaint_id: null });
  const id = String(mine!.id);

  // Suggested back to this doctor, marked as theirs (a line already on the prescription is not suggested).
  await page.getByRole("button", { name: `Remove ${line}` }).click();
  await page.getByTestId("cc-input").fill(line.slice(-8));
  await expect(page.getByRole("button", { name: new RegExp(`${line}.*Mine`) })).toBeVisible();

  // Another user of the same clinic never receives it.
  const assistant = await browser.newContext();
  const assistantPage = await assistant.newPage();
  await login(assistantPage, "assistant@rx.local", "assist123");
  expect(await lineRow(assistantPage.request, id)).toBeUndefined();

  // The platform admin shares it with every doctor.
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, "admin@rx.local", "admin123");
  await adminPage.goto("/admin/complaint-requests");
  await adminPage.getByTestId(`cc-share-${id}`).click();
  await adminPage.getByRole("dialog").getByRole("button", { name: "Share", exact: true }).click();
  await expect(adminPage.getByText(/Shared: every doctor gets the line/)).toBeVisible();

  // The shared line keeps the request's id, so every device gets it through the shared complaint list.
  expect(await lineRow(page.request, id)).toMatchObject({ status: "approved", approved_complaint_id: id });
  expect((await pull(assistantPage.request, "complaint")).find((c) => c.id === id)).toMatchObject({ name: line });

  await assistant.close();
  await admin.close();
});

test("picking a complaint offers a duration; any chip can be edited", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await registerPatient(page, { name: `E2E CC duration ${uniq()}`, age: "40", sex: "Female", mobile: mobile() });
  const chips = page.getByTestId("cc-input-chip");

  // Pick a shared line: the quick durations open on it.
  await page.getByTestId("cc-input").fill("Hearing");
  await page.getByRole("button", { name: /^Hearing loss/ }).click();
  await page.getByTestId("cc-input-duration").getByRole("button", { name: "3 days", exact: true }).click();
  await expect(chips.first()).toContainText("Hearing loss - 3 days");
  await expect(page.getByTestId("cc-input-duration")).toHaveCount(0);

  // Another duration replaces it: any number of days, weeks, months or years.
  await chips.first().getByRole("button", { name: "Duration of Hearing loss - 3 days" }).click();
  await page.getByTestId("cc-input-duration-n").fill("4");
  await page.getByTestId("cc-input-duration-set").click();
  await expect(chips.first()).toContainText("Hearing loss - 4 days");
  await chips.first().getByRole("button", { name: /Duration of/ }).click();
  await page.getByTestId("cc-input-duration-n").fill("6");
  await page.getByTestId("cc-input-duration-unit").selectOption("month");
  await page.getByTestId("cc-input-duration-n").press("Enter");
  await expect(chips.first()).toContainText("Hearing loss - 6 months");

  // A Bangla line gets a Bangla duration.
  await page.getByTestId("cc-input").fill("জ্বর");
  await page.getByTestId("cc-input").press("Enter");
  await page.getByTestId("cc-input-duration").getByRole("button", { name: "৭ দিন", exact: true }).click();
  await expect(chips.nth(1)).toContainText("জ্বর - ৭ দিন");

  // Tap a chip's text to edit it; Escape leaves it as it was.
  await chips.first().getByRole("button", { name: "Hearing loss - 6 months", exact: true }).click();
  await page.getByTestId("cc-input-chip-edit").fill("Hearing loss (R) - 6 months");
  await page.getByTestId("cc-input-chip-edit").press("Enter");
  await expect(chips.first()).toContainText("Hearing loss (R) - 6 months");
  await chips.first().getByRole("button", { name: "Hearing loss (R) - 6 months", exact: true }).click();
  await page.getByTestId("cc-input-chip-edit").fill("oops");
  await page.getByTestId("cc-input-chip-edit").press("Escape");
  await expect(chips.first()).toContainText("Hearing loss (R) - 6 months");
});

test("a doctor edits a shared C/C line for themselves in settings, and can revert it", async ({ page }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  await page.goto("/doctor#/settings/complaints");
  await page.getByTestId("cc-filter").fill("Constipation");
  await page.getByTestId("cc-shared-edit-Constipation").click();
  await page.getByTestId("cc-form-name").fill("Constipation for 7 days");
  await page.getByTestId("cc-form-save").click();
  const row = page.getByTestId("cc-shared-Constipation");
  await expect(row).toContainText("Constipation for 7 days");
  await expect(row.getByTestId("cc-badge")).toHaveText("Private · pending review");
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  const edit = (await pull(page.request, "doctor_complaint")).find((r) => r.name === "Constipation for 7 days" && r.is_active === 1);
  expect(edit?.replaces_complaint_id).toBeTruthy();

  // Revert: the shared line comes back for this doctor.
  await row.getByRole("button", { name: "Revert" }).click();
  await expect(row).not.toContainText("for 7 days");
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 60_000 });
  expect(await lineRow(page.request, String(edit!.id))).toMatchObject({ is_active: 0 });
});

test("the server checks C/C lines: owner and review fields are its own, new text re-opens a review", async ({ page, browser }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);

  expect((await upload(page, { name: "  " })).rejected[0]!.reason).toBe("complaint is required");
  expect((await upload(page, { name: "x".repeat(121) })).rejected[0]!.reason).toBe("complaint is too long (max 120)");
  expect((await upload(page, { name: "Ghost", replaces_complaint_id: crypto.randomUUID() })).rejected[0]!.reason).toBe("that shared complaint no longer exists");

  const id = crypto.randomUUID();
  const line = `Ear discharge for 7 days ${uniq()}`;
  expect(await upload(page, { name: line, owner_user_id: crypto.randomUUID() }, id)).toEqual({ applied: 1, rejected: [] });
  // Status is the admin's: a doctor can't share their own line.
  expect(await upload(page, { status: "approved" }, id, "PATCH")).toEqual({ applied: 1, rejected: [] });
  expect(await lineRow(page.request, id)).toMatchObject({ status: "pending", name: line });
  const shared = (await pull(page.request, "complaint"))[0]!;
  expect((await upload(page, { replaces_complaint_id: shared.id }, id, "PATCH")).rejected[0]!.reason).toBe(
    "an edited line stays tied to the shared complaint it replaces",
  );

  // Only doctors keep C/C lines.
  const assistant = await browser.newContext();
  const assistantPage = await assistant.newPage();
  await login(assistantPage, "assistant@rx.local", "assist123");
  expect((await upload(assistantPage, { name: "Not mine" })).rejected[0]!.reason).toBe("role assistant cannot write doctor_complaint");
  await assistant.close();

  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await login(adminPage, "admin@rx.local", "admin123");
  await adminPage.goto("/admin/complaint-requests");
  await adminPage.getByTestId(`cc-reject-${id}`).click();
  await adminPage.getByRole("dialog").locator("textarea").fill("Too specific");
  await adminPage.getByRole("dialog").getByRole("button", { name: "Don't share", exact: true }).click();
  await expect(adminPage.getByText(/Not shared: the line stays private/)).toBeVisible();
  expect(await lineRow(page.request, id)).toMatchObject({ status: "rejected", review_note: "Too specific" });
  await admin.close();

  // Unlike a medicine, a reviewed line stays the doctor's to edit; new text is a fresh request.
  expect(await upload(page, { name: `${line} (R)` }, id, "PATCH")).toEqual({ applied: 1, rejected: [] });
  expect(await lineRow(page.request, id)).toMatchObject({ status: "pending", review_note: null, name: `${line} (R)` });
  expect(await upload(page, { is_active: 0 }, id, "PATCH")).toEqual({ applied: 1, rejected: [] });
});
