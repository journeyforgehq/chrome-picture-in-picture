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
  // The Layer-2 half of this step (the Pro rows dimmed + disabled) is asserted
  // by the second test in this file, against LockedFeature's fieldset.
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
 * UN-PARKED (was `test.fixme("PLAN 2: …")`).
 *
 * The Layer-2 gating assertion of this spec used to be `ProTool`'s
 * enabled/disabled state and `LockedFeature`'s `.ui-kit-locked-feature fieldset`
 * inside the popup — template demo surfaces this child drops. `LockedFeature`
 * now has a production mount: OptionsView wraps the four Pro rows (enhanced
 * window, window size, in-window controls, subtitles) in ONE `LockedFeature`,
 * so the assertion recorded as gaps 1-2 of
 * docs/superpowers/plans/decisions-picture-in-picture.md has a subject again.
 *
 * BOTH HALVES ARE ASSERTED ON PURPOSE. A test that only checks the locked state
 * passes just as green on a build where the rows never unlock — which is the
 * failure mode that actually costs money.
 * ==========================================================================*/
test("a Pro-gated options row is dimmed + disabled on Free, and interactive on Pro", async ({
  ext,
}) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));
  const tierBadge = page.locator('[data-testid="tier-badge"]');

  // --- 1. Free: the four Pro rows sit inside LockedFeature's disabled fieldset. ---
  await expect(tierBadge).toHaveText("Free");

  // `getByLabel` resolves the antd Switch's `<button role="switch"
  // aria-label="Enhanced window">`. Its OWN `disabled` property is false — the
  // lock is the ANCESTOR <fieldset disabled>, which Playwright's toBeDisabled()
  // honours. Measured, not assumed (probe run 2026-08-11).
  const enhancedWindow = page.getByLabel("Enhanced window");
  await expect(enhancedWindow).toBeDisabled();

  // NOT DOM presence: the dimming is a computed opacity on the wrapping
  // fieldset, set as an INLINE style by the CORE LockedFeature. OptionsView's
  // `!important` child rules override padding/align-items on these same
  // elements and deliberately leave opacity alone.
  const lockedFieldset = page.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldset).toHaveCount(1); // one LockedFeature ⇒ one fieldset
  await expect(lockedFieldset).toHaveCSS("opacity", "0.5");

  await expect(page.getByRole("button", { name: /unlock/i })).toBeVisible();

  // Genuinely non-interactive, not merely dimmed — the claim OptionsView's doc
  // comment makes. A forced click (bypassing actionability) must not flip it.
  await expect(enhancedWindow).toHaveAttribute("aria-checked", "false");
  await enhancedWindow.click({ force: true });
  await expect(enhancedWindow).toHaveAttribute("aria-checked", "false");

  // --- 2. Grant Pro for THIS device. ---
  const deviceId = await waitForDeviceId(page);
  expect(deviceId).not.toBe("");
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  // --- 3. Reload → the SAME row is enabled, the fieldset is gone, no Unlock. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByLabel("Enhanced window")).toBeEnabled();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /unlock/i })).toHaveCount(0);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "options-pro-rows-unlocked.png") });

  await page.close();
});
