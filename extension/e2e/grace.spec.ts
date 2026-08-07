import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./fixtures";
import { waitForDeviceId } from "./harness/identity";
import { checkoutCompleted, postWebhook } from "./harness/webhook";
import {
  WORKER_BASE_URL,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  E2E_SUB_ID,
  SCREENSHOT_DIR,
} from "./harness/config";

const popupUrl = (id: string) => `chrome-extension://${id}/popup.html`;

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

// This proves the FRESH-cache half of the 7-day offline grace: once Pro is
// cached (checkedAt=now), an unreachable /me falls back to the cache and keeps
// showing Pro. The PAST-grace half (cache older than 7 days → drops to Free)
// is covered by the entitlement unit tests (test/entitlement.test.ts), since
// the e2e harness can't advance the clock 7 days.
test("offline grace keeps Pro within the window", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(popupUrl(ext.extensionId));

  // --- 1. Fresh install → poll storage for the device-id write. ---
  const deviceId = await waitForDeviceId(page);
  expect(deviceId).not.toBe("");

  // --- 2. Grant Pro via a completed Stripe checkout for THIS device. ---
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  // --- 3. Reload → Pro, pro tool unlocked. This successful /me writes the
  //        cached pro entitlement with checkedAt=now. ---
  await page.reload();
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  const runProBtn = page.getByRole("button", { name: /run pro tool/i });
  await expect(runProBtn).toBeVisible();
  expect(await runProBtn.isDisabled()).toBe(false);

  // --- 4. Go "offline": abort every /me request so the extension's fetch
  //        throws. The webhook POST already happened above, so only /me is
  //        affected. ---
  await ext.context.route("**/me", (route) => route.abort());

  // --- 5. Reload → STILL Pro (grace honored the fresh cache), pro tool still
  //        unlocked + interactive. This is the core assertion. ---
  await page.reload();
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  const runProBtnOffline = page.getByRole("button", { name: /run pro tool/i });
  await expect(runProBtnOffline).toBeVisible();
  expect(await runProBtnOffline.isDisabled()).toBe(false);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "grace-pro.png") });

  await page.close();
});
