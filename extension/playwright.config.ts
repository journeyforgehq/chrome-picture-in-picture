import { defineConfig } from "@playwright/test";

const STAGING = process.env.TARGET === "staging";

// Chrome extensions require a persistent context launched per-test (done in
// e2e/fixtures.ts), so there is no `projects`/browser block here — the fixture
// owns browser lifecycle. workers:1 + fullyParallel:false keep the single
// shared worker's KV state deterministic across specs.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: STAGING ? 120_000 : 60_000,
  retries: STAGING ? 2 : 0,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
});
