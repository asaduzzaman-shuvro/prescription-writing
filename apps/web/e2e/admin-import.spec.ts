import { expect, test } from "@playwright/test";
import { login, uniq } from "./helpers";

test("admin import: dry-run diff, then commit without deleting anything", async ({ page }) => {
  await login(page, "admin@rx.local", "admin123");
  const brand = `E2E Brand ${uniq()}`;
  const csv = [
    "brand_name,generic,dosage_form,company,strength,dar_number,packs",
    `${brand},Paracetamol,Tablet,Beximco Pharmaceuticals Ltd.,500 mg,,10's pack: 11.50`,
    `${brand},Paracetamol,Tablet,Beximco Pharmaceuticals Ltd.,500 mg,,10's pack: 11.50`,
    `Napa Extend,Paracetamol,Tablet (Extended Release),Beximco Pharmaceuticals Ltd.,665 mg,,Unit Price: 2.00; 120's pack: 240.00`,
    `,Paracetamol,Tablet,Beximco,,,`,
  ].join("\n");
  await page.goto("/admin/import");
  await page.setInputFiles("input[type=file]", { name: "e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("New 1")).toBeVisible();
  await expect(page.getByText("Unchanged 1")).toBeVisible();
  await expect(page.getByText("Conflicts 1")).toBeVisible();
  await expect(page.getByText("Invalid 1")).toBeVisible();
  await page.getByPlaceholder("dgda-2026-10 / medex-licensed-2026").fill("e2e-test");
  await page.getByRole("button", { name: /Commit 1 rows/ }).click();
  await expect(page.getByText(/Committed: 1 new, 0 updated, 1 conflicts skipped/)).toBeVisible();
  await page.goto(`/admin/medicines?q=${encodeURIComponent(brand)}`);
  await expect(page.getByRole("link", { name: brand })).toBeVisible();
});
