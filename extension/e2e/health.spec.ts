import { test, expect, request } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { WORKER_BASE_URL, DIST_DIR } from "./harness/config";

test("global setup built dist and started a healthy worker", async () => {
  // dist was built by globalSetup.
  //
  // This spec asserts artifacts EXIST on disk without navigating to them, which
  // is why it never showed up in a grep for specs that open the popup and why
  // it was the least obvious thing the deletion broke. options.html replaces
  // popup.html here; content.js and background.js are named explicitly because
  // nothing else in the hermetic suite would notice if an entry stopped being
  // emitted — the extension would simply load and do nothing.
  expect(existsSync(resolve(DIST_DIR, "manifest.json"))).toBe(true);
  expect(existsSync(resolve(DIST_DIR, "options.html"))).toBe(true);
  expect(existsSync(resolve(DIST_DIR, "content.js"))).toBe(true);
  expect(existsSync(resolve(DIST_DIR, "background.js"))).toBe(true);
  expect(existsSync(resolve(DIST_DIR, "popup.html"))).toBe(false);

  // worker answers /health. NB: /health is a pure liveness probe served BEFORE
  // assertBillingConfig runs (backend index.ts), so a green /health proves the
  // worker is up, NOT that Stripe config is valid — that's exercised by the
  // webhook POST in billing.spec. The version echoes the APP_VERSION var the
  // harness injects (wrangler.ts), which also confirms our --var flags took.
  const ctx = await request.newContext();
  const res = await ctx.get(`${WORKER_BASE_URL}/health`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.version).toBe("e2e");
  await ctx.dispose();
});
