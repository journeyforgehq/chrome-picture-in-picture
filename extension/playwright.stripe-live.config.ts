import { defineConfig } from "@playwright/test";

// Slot for the MANUAL real-purchase loop: a human completes a real Stripe
// Checkout (test-mode card) and a real `stripe listen` forwards the webhook to
// a locally running worker. Intentionally NOT part of `npm run e2e` (which is
// fully hermetic and offline). Wire up real specs under e2e/live/ when needed.
export default defineConfig({
  testDir: "./e2e/live",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
});
