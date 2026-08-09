import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "./fixtures";
import { launchExtension } from "./harness/extension";
import { waitForDeviceId } from "./harness/identity";
import { postWebhook, type StripeEvent } from "./harness/webhook";
import {
  WORKER_BASE_URL,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  SCREENSHOT_DIR,
  RUN_ID,
} from "./harness/config";

const optionsUrl = (id: string) => `chrome-extension://${id}/options.html`;

const RESTORE_EMAIL = "restore-e2e@example.com";

/* ============================================================================
 * A LIFETIME checkout, i.e. Stripe `mode: "payment"` with no `subscription`.
 *
 * Built here rather than via harness/webhook.ts's `checkoutCompleted`, which
 * hard-codes `mode: "subscription"` and is CORE-vendored (editing it would add a
 * fourth drifted file for no gain).
 *
 * This matters because the backend derives the DISPLAYED plan label from the
 * checkout MODE, not from the plan id the user clicked
 * (backend/src/billing/webhook.ts: `plan: isSub ? "annual" : "lifetime"`, and
 * `periodEnd` is null only for lifetime). With PLANS collapsed to lifetime-only,
 * `"Annual"` is no longer a label any real purchase can produce, so this spec
 * exercises the lifetime path and asserts the lifetime label.
 * ==========================================================================*/
function lifetimeCheckoutCompleted(opts: {
  deviceId: string;
  customerId: string;
  email: string;
}): StripeEvent {
  return {
    id: `evt_e2e_restore_lifetime_${RUN_ID}`,
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "payment",
        client_reference_id: opts.deviceId,
        customer: opts.customerId,
        customer_details: { email: opts.email },
      },
    },
  };
}

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test("restore on a fresh device grants pro", async ({ ext }) => {
  // --- 1. Device A = the ext fixture. Read its device id. ---
  const pageA = await ext.context.newPage();
  await pageA.goto(optionsUrl(ext.extensionId));
  const deviceIdA = await waitForDeviceId(pageA);
  expect(deviceIdA).not.toBe("");

  // --- 2. Grant A via a completed LIFETIME checkout carrying restore-e2e@example.com. ---
  const grant = await postWebhook(
    WORKER_BASE_URL,
    lifetimeCheckoutCompleted({
      deviceId: deviceIdA,
      customerId: E2E_CUSTOMER_ID,
      email: RESTORE_EMAIL,
    }),
    STRIPE_WEBHOOK_SECRET,
  );
  expect(grant.status).toBe(200);

  // Reload A's options page → Pro (A is now the email owner).
  await pageA.reload();
  await expect(pageA.locator('[data-testid="tier-badge"]')).toHaveText("Pro");

  // --- 3. Device B = a fresh install (different user-data-dir ⇒ different id). ---
  const extB = await launchExtension();
  const pageB = await extB.context.newPage();
  await pageB.goto(optionsUrl(extB.extensionId));

  const deviceIdB = await waitForDeviceId(pageB);
  expect(deviceIdB).not.toBe("");
  expect(deviceIdB).not.toBe(deviceIdA);

  // B currently shows Free / "No plan" (not restored yet).
  await expect(pageB.locator('[data-testid="tier-badge"]')).toHaveText("Free");
  await expect(pageB.getByText("No plan", { exact: true })).toBeVisible();

  // --- 4. Restore on B by the owner's email. ---
  await pageB.getByLabel("Email").fill(RESTORE_EMAIL);
  await pageB.getByRole("button", { name: /restore purchase/i }).click();

  // --- 5. Success message appears AND B flips to Pro. ---
  await expect(
    pageB.getByText("Purchase restored — you're Pro again.", { exact: true }),
  ).toBeVisible();

  // The container refreshes the plan/status on mount, so reload to render the
  // Pro PlanBadge (Lifetime / Active), then assert it as a Layer-2 check.
  await pageB.reload();
  await expect(pageB.getByText("Lifetime", { exact: true })).toBeVisible();
  await expect(pageB.getByText("Active", { exact: true })).toBeVisible();
  // "No plan" is gone — B is genuinely Pro now, not just showing a toast.
  await expect(pageB.getByText("No plan", { exact: true })).toHaveCount(0);
  await expect(pageB.locator('[data-testid="tier-badge"]')).toHaveText("Pro");

  // --- 6. Screenshot B's restored options page. ---
  await pageB.screenshot({ path: resolve(SCREENSHOT_DIR, "restore-pro.png") });

  await pageB.close();
  await extB.close();
  await pageA.close();
});

test("restore with an unknown email shows the not-found message", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(optionsUrl(ext.extensionId));

  // Fresh device, never granted: starts Free / "No plan".
  await waitForDeviceId(page);
  await expect(page.getByText("No plan", { exact: true })).toBeVisible();

  // Restore with an email that was never granted → 404 not-found message.
  await page.getByLabel("Email").fill("nobody-xyz@example.com");
  await page.getByRole("button", { name: /restore purchase/i }).click();

  await expect(
    page.getByText("No active purchase found for that email", { exact: true }),
  ).toBeVisible();

  // Tier stays Free — still "No plan", no Pro tags.
  await expect(page.getByText("No plan", { exact: true })).toBeVisible();

  await page.close();
});
