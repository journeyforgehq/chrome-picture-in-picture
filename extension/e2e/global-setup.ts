// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { startWorker, type WorkerHandle } from "./harness/wrangler";
import {
  EXTENSION_DIR,
  DIST_DIR,
  WORKER_BASE_URL,
  STAGING,
  SEED_SECRET,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  E2E_SUB_ID,
} from "./harness/config";
import { checkoutCompleted, subscriptionDeleted, postWebhook } from "./harness/webhook";

async function healthCheckStaging(): Promise<void> {
  let ok = false, status = 0;
  try {
    const res = await fetch(`${WORKER_BASE_URL}/health`);
    status = res.status;
    try { ok = ((await res.json()) as { ok?: boolean })?.ok === true; } catch { ok = res.ok; }
  } catch (e) {
    throw new Error(`[e2e] staging health-check to ${WORKER_BASE_URL}/health threw: ${e}`);
  }
  if (!ok || status !== 200) throw new Error(`[e2e] staging health-check FAILED: ${WORKER_BASE_URL}/health -> ${status} ok=${ok}`);
  console.log(`[e2e] staging worker healthy at ${WORKER_BASE_URL}/health`);
}

async function resetStaging(deviceId: string): Promise<void> {
  const res = await fetch(`${WORKER_BASE_URL}/__test__/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Test-Secret": SEED_SECRET },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) throw new Error(`[e2e] /__test__/reset failed: ${res.status} ${await res.text()} (check E2E_SEED_SECRET + staging deploy)`);
}

// Fail fast if the webhook secret is wrong, instead of every money-path spec 400ing.
async function grantProbeStaging(): Promise<void> {
  const probeDevice = `${E2E_CUSTOMER_ID}-probe`;
  const grant = await postWebhook(
    WORKER_BASE_URL,
    checkoutCompleted({ deviceId: probeDevice, customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }),
    STRIPE_WEBHOOK_SECRET,
  );
  if (grant.status !== 200) {
    throw new Error(`[e2e] staging grant probe failed: ${grant.status} — STAGING_STRIPE_WEBHOOK_SECRET likely != the worker's STRIPE_WEBHOOK_SECRET`);
  }
  const meRes = await fetch(`${WORKER_BASE_URL}/me`, { headers: { "X-Device-Id": probeDevice } });
  if (!meRes.ok) throw new Error(`[e2e] staging grant probe: /me returned ${meRes.status}`);
  const me = (await meRes.json()) as { tier?: string };
  if (me.tier !== "pro") {
    throw new Error(`[e2e] staging grant probe: device not pro after grant, got ${JSON.stringify(me)}`);
  }
  // Remove the probe's paid: flag so it no longer grants Pro. (The subscriptionDeleted
  // cascade marks the sub canceled; the cust: list entry remains but is inert once paid: is gone.)
  await postWebhook(WORKER_BASE_URL, subscriptionDeleted({ customerId: E2E_CUSTOMER_ID, subId: E2E_SUB_ID }), STRIPE_WEBHOOK_SECRET);
  await resetStaging(probeDevice);
  console.log("[e2e] staging grant probe green (webhook secret verifies).");
}

/**
 * Playwright globalSetup: build the extension against the target worker URL, then
 * (local) start a wiped local worker, or (staging) health-check the deployed worker.
 * Runs once per `npm run e2e` invocation (workers:1).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  // 1. Build dist with BACKEND_BASE_URL baked to the target worker (local or staging).
  execSync("npm run build", {
    cwd: EXTENSION_DIR,
    stdio: "inherit",
    env: { ...process.env, BACKEND_BASE_URL: WORKER_BASE_URL },
  });
  if (!existsSync(resolve(DIST_DIR, "manifest.json"))) {
    throw new Error(`dist build produced no manifest.json at ${DIST_DIR}`);
  }

  // 2. Backend: staging uses the deployed worker (health-checked, never wiped);
  //    local spawns a fresh wrangler dev with a wiped KV.
  if (STAGING) {
    console.log(`[e2e] TARGET=staging -> deployed worker ${WORKER_BASE_URL} (no local worker, no KV wipe)`);
    await healthCheckStaging();
    await resetStaging(`${E2E_CUSTOMER_ID}-probe`); // validate E2E_SEED_SECRET + clear prior probe state
    await grantProbeStaging();                       // validate STAGING_STRIPE_WEBHOOK_SECRET
    return async () => {}; // nothing to stop
  }

  const worker: WorkerHandle = await startWorker();
  return async () => {
    await worker.stop();
  };
}
