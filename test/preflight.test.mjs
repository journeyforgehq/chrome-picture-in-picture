import { test } from "node:test";
import assert from "node:assert/strict";
import { scanForIssues } from "../scripts/preflight.mjs";

test("scanForIssues flags REPLACE_WITH_ placeholders and empty required env", () => {
  const issues = scanForIssues({
    files: {
      "backend/wrangler.toml": 'id = "REPLACE_WITH_KV_ID"',
      "welcome-page/src/content.ts": 'restoreHref: "chrome-extension://REPLACE_WITH_EXTENSION_ID/options.html"',
    },
    env: { BACKEND_BASE_URL: "", STRIPE_ANNUAL_URL: "", STRIPE_LIFETIME_URL: "" },
  });
  assert.ok(issues.some((i) => i.includes("REPLACE_WITH_KV_ID")), "KV placeholder flagged");
  assert.ok(issues.some((i) => i.includes("REPLACE_WITH_EXTENSION_ID")), "extension-id placeholder flagged");
  assert.ok(issues.some((i) => i.includes("BACKEND_BASE_URL")), "empty backend URL flagged");
  assert.ok(issues.some((i) => /STRIPE_(ANNUAL|LIFETIME)_URL/.test(i)), "no Stripe link flagged");
});

test("scanForIssues returns [] when everything is filled", () => {
  const issues = scanForIssues({
    files: { "backend/wrangler.toml": 'id = "abc123"', "welcome-page/src/content.ts": 'restoreHref: "chrome-extension://realid/options.html"' },
    env: { BACKEND_BASE_URL: "https://api", STRIPE_ANNUAL_URL: "https://buy", STRIPE_LIFETIME_URL: "" },
  });
  assert.deepEqual(issues, []);
});
