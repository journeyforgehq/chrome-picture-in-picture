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

const optionsUrl = (id: string) => `chrome-extension://${id}/options.html`;

// Far-future renewal period end (year ~2100) so the renewed entitlement is not stale.
const FAR_FUTURE = 4102444800;

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("renewal keeps both devices pro; cancel re-locks both", async ({ ext }) => {
  // --- 1. Device A = the ext fixture; Device B = a fresh install. ---
  const pageA = await ext.context.newPage();
  await pageA.goto(optionsUrl(ext.extensionId));

  const extB = await launchExtension();
  const pageB = await extB.context.newPage();
  await pageB.goto(optionsUrl(extB.extensionId));

  const tierBadgeA = pageA.locator('[data-testid="tier-badge"]');
  const tierBadgeB = pageB.locator('[data-testid="tier-badge"]');

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

  // --- 4. Reload both options pages → BOTH Pro, Upgrade affordance gone on both. ---
  await pageA.reload();
  await pageB.reload();

  await expect(tierBadgeA).toHaveText("Pro");
  await expect(pageA.getByRole("button", { name: "Upgrade" })).toHaveCount(0);

  await expect(tierBadgeB).toHaveText("Pro");
  await expect(pageB.getByRole("button", { name: "Upgrade" })).toHaveCount(0);

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
  await expect(tierBadgeA).toHaveText("Pro");
  await expect(tierBadgeB).toHaveText("Pro");

  // --- 6. Cancel cascade → BOTH back to Free, Upgrade affordance back on both. ---
  const revoke = await postWebhook(
    WORKER_BASE_URL,
    subscriptionDeleted({ customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(revoke.status).toBe(200);

  await pageA.reload();
  await pageB.reload();

  await expect(tierBadgeA).toHaveText("Free");
  await expect(pageA.getByRole("button", { name: "Upgrade" })).toBeVisible();

  await expect(tierBadgeB).toHaveText("Free");
  await expect(pageB.getByRole("button", { name: "Upgrade" })).toBeVisible();

  // --- 7. Screenshot both, then close. ---
  await pageA.screenshot({ path: resolve(SCREENSHOT_DIR, "cascade-a.png") });
  await pageB.screenshot({ path: resolve(SCREENSHOT_DIR, "cascade-b.png") });

  await pageB.close();
  await pageA.close();
  await extB.close();
});

/* ============================================================================
 * PARKED — not deleted, not softened. See the identical block in
 * e2e/billing.spec.ts and gaps 1-2 of
 * docs/superpowers/plans/decisions-picture-in-picture.md.
 *
 * Steps 4 and 6 used to prove the cascade at Layer 2 on BOTH installs via
 * `ProTool` / `.ui-kit-locked-feature fieldset` in the popup. v1 free has no
 * Pro-gated production surface; plan 2 restores one on the options page.
 * ==========================================================================*/
test.fixme("PLAN 2: the cancel cascade re-locks the Pro-gated rows on both installs", async ({
  ext,
}) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));

  const lockedFieldset = page.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldset).toHaveCSS("opacity", "0.5");
  expect(await lockedFieldset.evaluate((el: HTMLFieldSetElement) => el.disabled)).toBe(true);

  await page.close();
});
