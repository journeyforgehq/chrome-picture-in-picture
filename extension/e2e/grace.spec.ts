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

const optionsUrl = (id: string) => `chrome-extension://${id}/options.html`;

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
  await page.goto(optionsUrl(ext.extensionId));
  const tierBadge = page.locator('[data-testid="tier-badge"]');

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

  // --- 3. Reload → Pro. This successful /me writes the cached pro entitlement
  //        with checkedAt=now. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  // Layer 2: the Free-only Upgrade affordance is gone.
  await expect(page.getByRole("button", { name: "Upgrade" })).toHaveCount(0);

  // --- 4. Go "offline": abort every /me request so the extension's fetch
  //        throws. The webhook POST already happened above, so only /me is
  //        affected. ---
  await ext.context.route("**/me", (route) => route.abort());

  // --- 5. Reload → STILL Pro (grace honored the fresh cache), and still no
  //        Upgrade affordance. This is the core assertion. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByRole("button", { name: "Upgrade" })).toHaveCount(0);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "grace-pro.png") });

  await page.close();
});

/* ============================================================================
 * UN-PARKED (was `test.fixme("PLAN 2: …")`). See the matching block in
 * e2e/billing.spec.ts and gaps 1-2 of
 * docs/superpowers/plans/decisions-picture-in-picture.md.
 *
 * The Layer-2 assertion that survived the grace window used to be `ProTool`'s
 * "Run pro tool" button inside the popup. The subject is now the four Pro rows
 * on options.html, wrapped in one LockedFeature.
 *
 * This is the assertion that matters most commercially: a paying user who goes
 * offline must keep the feature they paid for, and "Pro" on a badge is not the
 * same claim as "the switch still moves".
 * ==========================================================================*/
test("a Pro-gated options row stays interactive through the grace window", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));
  const tierBadge = page.locator('[data-testid="tier-badge"]');

  // --- 1. Free first, so "interactive" later is a CHANGE, not a constant. ---
  await expect(tierBadge).toHaveText("Free");
  await expect(page.getByLabel("Enhanced window")).toBeDisabled();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCSS("opacity", "0.5");

  // --- 2. Grant Pro via a completed Stripe checkout for THIS device. ---
  const deviceId = await waitForDeviceId(page);
  expect(deviceId).not.toBe("");
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  // --- 3. Reload → Pro, rows unlocked. This successful /me writes the cached
  //        pro entitlement with checkedAt=now. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByLabel("Enhanced window")).toBeEnabled();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCount(0);

  // --- 4. Go "offline": abort every /me request so the extension's fetch throws. ---
  await ext.context.route("**/me", (route) => route.abort());

  // --- 5. Reload → the row is STILL interactive: enabled, no locking fieldset,
  //        no Unlock affordance. This is the core assertion. ---
  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  const enhancedWindow = page.getByLabel("Enhanced window");
  await expect(enhancedWindow).toBeEnabled();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /unlock/i })).toHaveCount(0);

  // And it really moves — an ordinary (non-forced) click, which would fail
  // actionability if anything were still covering or disabling it.
  const before = await enhancedWindow.getAttribute("aria-checked");
  await enhancedWindow.click();
  await expect(enhancedWindow).not.toHaveAttribute("aria-checked", before ?? "false");

  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "grace-pro-rows-unlocked.png") });

  await page.close();
});
