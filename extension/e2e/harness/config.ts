// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url)); // .../template/extension/e2e/harness

/** template/extension */
export const EXTENSION_DIR = resolve(HERE, "..", "..");
/** template/backend (sibling worker package) */
export const BACKEND_DIR = resolve(EXTENSION_DIR, "..", "backend");
/** Built unpacked extension loaded into Chrome */
export const DIST_DIR = resolve(EXTENSION_DIR, "dist");
/** Wipeable local KV/state dir for the e2e worker */
export const PERSIST_DIR = resolve(EXTENSION_DIR, ".wrangler-e2e");
/** Stable dir for human-reviewed checkpoint screenshots */
export const SCREENSHOT_DIR = resolve(EXTENSION_DIR, "e2e", "__screens__");

/** Fixed port, deliberately not 8787 so it never clashes with `wrangler dev` from `npm run dev`. */
export const WORKER_PORT = 8788;

// Target selection. TARGET=staging points the suite at a DEPLOYED worker; the
// local default spawns wrangler dev. Only the worker URL + webhook/seed secrets differ.
export const TARGET: "local" | "staging" = process.env.TARGET === "staging" ? "staging" : "local";
export const STAGING = TARGET === "staging";

function stagingUrl(): string {
  const u = process.env.STAGING_BACKEND_URL;
  if (!u) throw new Error("TARGET=staging requires STAGING_BACKEND_URL (the deployed worker base URL)");
  return u.replace(/\/+$/, "");
}

export const WORKER_BASE_URL = STAGING ? stagingUrl() : `http://localhost:${WORKER_PORT}`;

// Webhook signing secret. Local: the fake value also injected via --var to wrangler dev.
// Staging: the deployed worker's REAL test-mode Stripe signing secret, so forged webhooks
// verify AND real checkout stays testable. startWorker() is skipped on staging, so the
// staging value is never passed to a --var — it only signs forged events.
export const STRIPE_WEBHOOK_SECRET = STAGING
  // Intentional asymmetry vs STAGING_BACKEND_URL/E2E_SEED_SECRET (which throw when unset):
  // a wrong/missing webhook secret can't be validated statically, so it silently defaults
  // here and the global-setup grant probe is its fail-fast (a bad secret 400s the probe).
  ? (process.env.STAGING_STRIPE_WEBHOOK_SECRET || "whsec_e2e_secret")
  : "whsec_e2e_secret";
export const STRIPE_SECRET_KEY = "sk_test_e2e_dummy";

// Seed secret guarding /__test__/* on the deployed worker (staging readiness probe).
// Local grants via the --var webhook path and never calls /__test__/*, so the local
// value is an unused default.
export const SEED_SECRET = STAGING
  ? (() => {
      const s = process.env.E2E_SEED_SECRET;
      if (!s) throw new Error("TARGET=staging requires E2E_SEED_SECRET (must match the deployed worker's secret)");
      return s;
    })()
  : "e2e-seed-secret";

// Per-run nonce so identifiers are unique across runs on a persistent (non-wipeable)
// staging KV. Locally this only makes the (already run-scoped) ids differ per run.
export const RUN_ID = randomUUID();

// Grant and revoke within a run share these (imported by name in every money-path spec),
// so the cust: cascade still resolves; across runs they are fresh.
export const E2E_CUSTOMER_ID = `cus_e2e_${RUN_ID}`;
export const E2E_SUB_ID = `sub_e2e_${RUN_ID}`;
