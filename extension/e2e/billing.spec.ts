// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./fixtures";
import { waitForDeviceId } from "./harness/identity";
import { checkoutCompleted, subscriptionDeleted, postWebhook } from "./harness/webhook";
import {
  WORKER_BASE_URL,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  E2E_SUB_ID,
  SCREENSHOT_DIR,
} from "./harness/config";

const popupUrl = (id: string) => `chrome-extension://${id}/popup.html`;
const optionsUrl = (id: string) => `chrome-extension://${id}/options.html`;

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("checkout webhook grants pro; cancel webhook re-locks", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(popupUrl(ext.extensionId));

  // --- 1. Fresh install: Free, pro tool locked (dimmed + disabled). ---
  await expect(page.getByText("Free", { exact: true })).toBeVisible();
  const lockedFieldset = page.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldset).toHaveCSS("opacity", "0.5");
  expect(await lockedFieldset.evaluate((el: HTMLFieldSetElement) => el.disabled)).toBe(true);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "popup-free.png") });

  // Poll storage for the device-id write (the default "free" render above is
  // NOT proof init finished) so the client_reference_id we send is non-empty.
  const deviceId = await waitForDeviceId(page);
  expect(deviceId).not.toBe("");

  // --- 2. Simulate a completed Stripe checkout for THIS device. ---
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  // --- 3. Reload popup → Pro, pro tool unlocked + interactive. ---
  await page.reload();
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  const runProBtn = page.getByRole("button", { name: /run pro tool/i });
  await expect(runProBtn).toBeVisible();
  expect(await runProBtn.isDisabled()).toBe(false);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "popup-pro.png") });

  // --- 4. Simulate subscription cancellation → revoke cascade. ---
  const revoke = await postWebhook(
    WORKER_BASE_URL,
    subscriptionDeleted({ customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(revoke.status).toBe(200);

  // --- 5. Reload popup → back to Free, pro tool re-locked. ---
  await page.reload();
  await expect(page.getByText("Free", { exact: true })).toBeVisible();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCSS("opacity", "0.5");

  // --- 6. Options page renders responsively at mobile width (375). ---
  const opts = await ext.context.newPage();
  await opts.setViewportSize({ width: 375, height: 667 });
  await opts.goto(optionsUrl(ext.extensionId));
  await expect(opts.getByText(/Settings/)).toBeVisible();
  await opts.screenshot({ path: resolve(SCREENSHOT_DIR, "options-mobile.png") });

  await opts.close();
  await page.close();
});
