import { defineConfig } from "@playwright/test";

const STAGING = process.env.TARGET === "staging";

// Chrome extensions require a persistent context launched per-test (done in
// e2e/fixtures.ts), so there is no `projects`/browser block here — the fixture
// owns browser lifecycle. workers:1 + fullyParallel:false keep the single
// shared worker's KV state deterministic across specs.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Visual specs need the preview gallery on :4173, not this suite's worker
  // backend. They run under playwright.visual.config.ts instead. The detection
  // and gesture specs need neither the worker nor the gallery — they serve
  // themselves — and run under playwright.fixtures.config.ts. The arbitration
  // and registration specs need a build with <all_urls> statically granted,
  // which only playwright.granted.config.ts produces.
  testIgnore: [
    "**/*-visual.spec.ts",
    "**/detection.spec.ts",
    "**/gesture.spec.ts",
    "**/arbitration.spec.ts",
    "**/registration.spec.ts",
  ],
  workers: 1,
  fullyParallel: false,
  timeout: STAGING ? 120_000 : 60_000,
  retries: STAGING ? 2 : 0,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
});
