import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./fixtures";
import { waitForDeviceId } from "./harness/identity";
import {
  checkoutCompleted,
  invoicePaymentFailed,
  chargeRefunded,
  postWebhook,
} from "./harness/webhook";
import {
  WORKER_BASE_URL,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  E2E_SUB_ID,
  SCREENSHOT_DIR,
  RUN_ID,
} from "./harness/config";

const optionsUrl = (id: string) => `chrome-extension://${id}/options.html`;

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("past_due shows the nudge but keeps Pro; refund re-locks", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));
  const tierBadge = page.locator('[data-testid="tier-badge"]');

  // --- 1. Wait for the device-id write so client_reference_id is non-empty. ---
  const deviceId = await waitForDeviceId(page);
  expect(deviceId).not.toBe("");

  // --- 2. Grant Pro via a completed checkout → Pro, NO nudge yet. ---
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByRole("button", { name: "Upgrade" })).toHaveCount(0);
  // PaymentNudge renders only when status === "past_due"; not present while active.
  await expect(page.getByText("Payment issue")).toHaveCount(0);

  // --- 3. Dunning: invoice.payment_failed → past_due, but Pro kept through periodEnd. ---
  const dunning = await postWebhook(
    WORKER_BASE_URL,
    invoicePaymentFailed({ customerId: E2E_CUSTOMER_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(dunning.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByText("Payment issue")).toBeVisible();
  await expect(page.getByRole("link", { name: "Update payment method" })).toBeVisible();
  // The PlanBadge status tag follows the nudge — Pro, but flagged.
  await expect(page.getByText("Past due", { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "dunning-nudge.png") });

  // --- 4. Graceful redelivery smoke: re-send the SAME invoice (fixed eventId) twice. ---
  // The rigorous KV single-side-effect idempotency guarantee is covered by
  // template/backend/test/webhook-idempotency.test.ts; this only smoke-checks that
  // redelivery is handled gracefully (200, no error, state stays consistent).
  const fixed = `evt_e2e_fixed_dunning_${RUN_ID}`;
  const r1 = await postWebhook(
    WORKER_BASE_URL,
    invoicePaymentFailed({ customerId: E2E_CUSTOMER_ID, eventId: fixed }),
    STRIPE_WEBHOOK_SECRET,
  );
  const r2 = await postWebhook(
    WORKER_BASE_URL,
    invoicePaymentFailed({ customerId: E2E_CUSTOMER_ID, eventId: fixed }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(r1.status).toBe(200);
  expect(r2.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByText("Payment issue")).toBeVisible();

  // --- 5. Refund: charge.refunded → revoke cascade → back to Free, nudge gone. ---
  const refund = await postWebhook(
    WORKER_BASE_URL,
    chargeRefunded({ customerId: E2E_CUSTOMER_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(refund.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Free");
  await expect(page.getByRole("button", { name: "Upgrade" })).toBeVisible();
  await expect(page.getByText("Payment issue")).toHaveCount(0);
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "refund-relocked.png") });

  // --- 6. Cleanup. ---
  await page.close();
});

/* ============================================================================
 * UN-PARKED (was `test.fixme("PLAN 2: …")`). See the matching block in
 * e2e/billing.spec.ts and gaps 1-2 of
 * docs/superpowers/plans/decisions-picture-in-picture.md.
 *
 * The refund half of this spec used to end on `LockedFeature` re-locking; the
 * subject is now the four Pro rows on options.html.
 *
 * past_due and refunded are DIFFERENT states and this test exists to keep them
 * different: a failed payment must nag without taking the feature away, a
 * refund must take it away. Collapsing either into the other is a real bug that
 * the tier badge alone cannot see.
 * ==========================================================================*/
test("past_due keeps the Pro-gated rows interactive; a refund re-locks them", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));
  const tierBadge = page.locator('[data-testid="tier-badge"]');

  // --- 1. Free baseline: the rows start locked. ---
  await expect(tierBadge).toHaveText("Free");
  await expect(page.getByLabel("Enhanced window")).toBeDisabled();

  const deviceId = await waitForDeviceId(page);
  expect(deviceId).not.toBe("");

  // --- 2. Grant Pro → rows unlocked, no nudge. ---
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByLabel("Enhanced window")).toBeEnabled();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCount(0);
  await expect(page.getByText("Payment issue")).toHaveCount(0);

  // --- 3. Dunning: past_due NAGS but does not take the feature away. ---
  const dunning = await postWebhook(
    WORKER_BASE_URL,
    invoicePaymentFailed({ customerId: E2E_CUSTOMER_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(dunning.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Pro");
  await expect(page.getByText("Payment issue")).toBeVisible();
  // The point of the row: nudged AND still interactive, simultaneously.
  await expect(page.getByLabel("Enhanced window")).toBeEnabled();
  await expect(page.locator(".ui-kit-locked-feature fieldset")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /unlock/i })).toHaveCount(0);

  // --- 4. Refund → the rows re-lock. ---
  const refund = await postWebhook(
    WORKER_BASE_URL,
    chargeRefunded({ customerId: E2E_CUSTOMER_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(refund.status).toBe(200);

  await page.reload();
  await expect(tierBadge).toHaveText("Free");
  await expect(page.getByLabel("Enhanced window")).toBeDisabled();

  const lockedFieldset = page.locator(".ui-kit-locked-feature fieldset");
  await expect(lockedFieldset).toHaveCount(1);
  // Computed, not declared — see the note in billing.spec.ts.
  await expect(lockedFieldset).toHaveCSS("opacity", "0.5");
  await expect(page.getByRole("button", { name: /unlock/i })).toBeVisible();
  await page.screenshot({ path: resolve(SCREENSHOT_DIR, "refund-rows-relocked.png") });

  await page.close();
});
