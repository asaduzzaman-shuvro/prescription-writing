import { expect, test } from "@playwright/test";
import { addMedicine, login, mobile, registerPatient, uniq, verifyToken, waitSynced } from "./helpers";

test("works fully offline and syncs when the connection returns", async ({ page, context }) => {
  await login(page, "doctor@rx.local", "doctor123");
  await waitSynced(page);
  // Let the service worker install and cache the app shell.
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 }).catch(() => page.reload());
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && !!(await caches.match("/doctor")), null, { timeout: 30_000 });
  await page.reload();
  await waitSynced(page);

  await context.setOffline(true);
  await page.reload(); // served by the service worker
  await expect(page.getByTestId("sync-status")).toContainText("Offline", { timeout: 30_000 });

  const name = `Offline Patient ${uniq()}`;
  await registerPatient(page, { name, age: "6", sex: "Female", mobile: mobile() });
  await expect(page.getByTestId("med-search")).toBeVisible();
  await addMedicine(page, "napa", "1+1+1 af 3d");
  await page.getByTestId("finalize").click();
  await expect(page.frameLocator("[data-testid=print-frame]").locator(".rx-item")).toHaveCount(1);
  await expect(page.getByTestId("sync-status")).toContainText("unsynced");
  const token = await verifyToken(page);

  await context.setOffline(false);
  await expect(page.getByTestId("sync-status")).toHaveText("Synced", { timeout: 90_000 });
  await page.goto(`/v/${token}`);
  await expect(page.getByText("Genuine prescription issued via RxPad")).toBeVisible();
});
