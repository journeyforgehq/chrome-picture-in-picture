import { test, expect } from "./fixtures";
import { waitForDeviceId, readCachedTier } from "./harness/identity";

test("fresh install generates a device id and caches the free tier", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/popup.html`);

  // The popup renders "free" by default before init finishes, so poll storage
  // for the device-id write rather than gating on visible text (see waitForDeviceId).
  const id = await waitForDeviceId(page);
  expect(id).toMatch(/[0-9a-f-]{36}/i); // crypto.randomUUID()

  expect(await readCachedTier(page)).toBe("free");
  await page.close();
});
