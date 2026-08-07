import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./fixtures";
import { launchExtension } from "./harness/extension";
import { waitForDeviceId } from "./harness/identity";
import {
  checkoutCompleted,
  subscriptionUpdated,
  subscriptionDeleted,
  postWebhook,
} from "./harness/webhook";
import {
  WORKER_BASE_URL,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  E2E_SUB_ID,
  SCREENSHOT_DIR,
} from "./harness/config";

const popupUrl = (id: string) => `chrome-extension://${id}/popup.html`;

// Far-future renewal period end (year ~2100) so the renewed entitlement is not stale.
const FAR_FUTURE = 4102444800;

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("renewal keeps both devices pro; cancel re-locks both", async ({ ext }) => {
  // --- 1. Device A = the ext fixture; Device B = a fresh install. ---
  const pageA = await ext.context.newPage();
  await pageA.goto(popupUrl(ext.extensionId));

  const extB = await launchExtension();
  const pageB = await extB.context.newPage();
  await pageB.goto(popupUrl(extB.extensionId));

  // --- 2. Read both device ids (different user-data-dirs ⇒ different ids). ---
  const deviceIdA = await waitForDeviceId(pageA);
  const deviceIdB = await waitForDeviceId(pageB);
  expect(deviceIdA).not.toBe("");
  expect(deviceIdB).not.toBe("");
  expect(deviceIdB).not.toBe(deviceIdA);

  // --- 3. Grant BOTH under the SAME customer (both append to cust:E2E_CUSTOMER_ID). ---
  const grantA = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({
      deviceId: deviceIdA,
      customerId: E2E_CUSTOMER_ID,
      subId: E2E_SUB_ID,
      email: "cascade-a@example.com",
    }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grantA.status).toBe(200);

  const grantB = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({
      deviceId: deviceIdB,
      customerId: E2E_CUSTOMER_ID,
      subId: E2E_SUB_ID,
      email: "cascade-b@example.com",
    }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grantB.status).toBe(200);

  // --- 4. Reload both popups → BOTH Pro, pro tool unlocked + interactive. ---
  await pageA.reload();
  await pageB.reload();

  await expect(pageA.getByText("Pro", { exact: true })).toBeVisible();
  const runProBtnA = pageA.getByRole("button", { name: /run pro tool/i });
  await expect(runProBtnA).toBeVisible();
  expect(await runProBtnA.isDisabled()).toBe(false);

  await expect(pageB.getByText("Pro", { exact: true })).toBeVisible();
  const runProBtnB = pageB.getByRole("button", { name: /run pro tool/i });
  await expect(runProBtnB).toBeVisible();
  expect(await runProBtnB.isDisabled()).toBe(false);

  // --- 5. Renewal cascade → both still Pro (the renew touched every cust: device). ---
  const renew = await postWebhook(
    WORKER_BASE_URL,
    subscriptionUpdated({
      customerId: E2E_CUSTOMER_ID,
      periodEnd: FAR_FUTURE,
      status: "active",
    }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(renew.status).toBe(200);

  await pageA.reload();
  await pageB.reload();
  await expect(pageA.getByText("Pro", { exact: true })).toBeVisible();
  await expect(pageB.getByText("Pro", { exact: true })).toBeVisible();

  // --- 6. Cancel cascade → BOTH back to Free, pro tool re-locked (opacity 0.5 + disabled). ---
  const revoke = await postWebhook(
    WORKER_BASE_URL,
    subscriptionDeleted({ customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(revoke.status).toBe(200);

  await pageA.reload();
  await pageB.reload();

  await expect(pageA.getByText("Free", { exact: true })).toBeVisible();
  const lockedFieldsetA = pageA.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldsetA).toHaveCSS("opacity", "0.5");
  expect(await lockedFieldsetA.evaluate((el: HTMLFieldSetElement) => el.disabled)).toBe(true);

  await expect(pageB.getByText("Free", { exact: true })).toBeVisible();
  const lockedFieldsetB = pageB.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldsetB).toHaveCSS("opacity", "0.5");
  expect(await lockedFieldsetB.evaluate((el: HTMLFieldSetElement) => el.disabled)).toBe(true);

  // --- 7. Screenshot both, then close. ---
  await pageA.screenshot({ path: resolve(SCREENSHOT_DIR, "cascade-a.png") });
  await pageB.screenshot({ path: resolve(SCREENSHOT_DIR, "cascade-b.png") });

  await pageB.close();
  await pageA.close();
  await extB.close();
});
