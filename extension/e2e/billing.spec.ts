// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
//
// LOCAL DRIFT (recorded in docs/superpowers/plans/core-drift.md): this child
// has no popup — the toolbar button IS the feature — so the money loop runs on
// options.html, whose tier badge is exposed as [data-testid="tier-badge"].
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

const optionsUrl = (id: string) => `chrome-extension://${id}/options.html`;

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("checkout webhook grants pro; cancel webhook re-locks", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));
  const tierBadge = page.locator('[data-testid="tier-badge"]');

  // --- 1. Fresh install: Free. ---
  // The Layer-2 half of this step (the pro feature dimmed + disabled) has no
  // production subject in v1 free — see the parked test at the bottom of this file.
  await expect(tierBadge).toHaveText("Free");
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "options-free.png") });

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

  // --- 3. Reload options → Pro. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  // Layer 2: the Free-only "Upgrade" affordance is gone once the tier resolves Pro.
  await expect(page.getByRole("button", { name: "Upgrade" })).toHaveCount(0);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "options-pro.png") });

  // --- 4. Simulate subscription cancellation → revoke cascade. ---
  const revoke = await postWebhook(
    WORKER_BASE_URL,
    subscriptionDeleted({ customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(revoke.status).toBe(200);

  // --- 5. Reload options → back to Free, and the Upgrade affordance returns. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Free");
  await expect(page.getByRole("button", { name: "Upgrade" })).toBeVisible();

  // --- 6. Options page renders responsively at mobile width (375). ---
  const opts = await ext.context.newPage();
  await opts.setViewportSize({ width: 375, height: 667 });
  await opts.goto(optionsUrl(ext.extensionId));
  await expect(opts.getByText(/Settings/)).toBeVisible();
  await opts.screenshot({ path: resolve(SCREENSHOT_DIR, "options-mobile.png") });

  await opts.close();
  await page.close();
});

/* ============================================================================
 * PARKED — not deleted, not softened.
 *
 * The Layer-2 gating assertion of this spec used to be `ProTool`'s
 * enabled/disabled state and `LockedFeature`'s `.ui-kit-locked-feature fieldset`
 * (opacity 0.5 + `disabled === true`) inside the popup. Both are template demo
 * surfaces that v1 free drops; `LockedFeature` has no production mount until
 * plan 2 adds the four Pro rows (enhanced window, window size, in-window
 * controls, subtitles) to the options page.
 *
 * Recorded as gaps 1 and 2 of docs/superpowers/plans/decisions-picture-in-picture.md,
 * which requires an explicit test.fixme naming the paid-tier plan rather than a
 * deletion or a trivially-passing rewrite. Re-enable in plan 2 by pointing
 * `optionsUrl` at the Pro rows.
 * ==========================================================================*/
test.fixme("PLAN 2: a Pro-gated options row is dimmed + disabled on Free", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));

  const lockedFieldset = page.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldset).toHaveCSS("opacity", "0.5");
  expect(await lockedFieldset.evaluate((el: HTMLFieldSetElement) => el.disabled)).toBe(true);

  await page.close();
});
