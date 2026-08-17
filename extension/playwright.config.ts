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
  // which only playwright.granted.config.ts produces — and so does
  // action-click.spec.ts, added in Task 18. That one is worth a sentence,
  // because it did NOT announce itself: collected here it PASSED, since
  // .tmp-granted-dist/ was still lying around from an earlier granted run. On a
  // clean checkout it would have failed on a missing directory, in the suite
  // that has nothing to do with it. A spec passing is not evidence it is in the
  // right config.
  //
  // The four `dpip-*` specs belong to the fixtures config too, and this list had
  // gone stale: they were added in Task 16 without being ignored here, so this
  // suite was silently collecting all 30 of them on top of its own 12. Six
  // failed here and passed there — this config brings no
  // `--autoplay-policy=no-user-gesture-required`, so every fixture video is
  // paused and the "still playing" rows cannot hold. Nothing is lost by
  // ignoring them: `npm run e2e:fixtures` runs all four (77 passed) with the
  // flag and the per-file `viewport: null` / `channel: "chromium"` they need.
  // playwright.fixtures.config.ts's header already asserts this ignore exists;
  // it now does.
  testIgnore: [
    "**/*-visual.spec.ts",
    "**/action-click.spec.ts",
    "**/detection.spec.ts",
    "**/gesture.spec.ts",
    "**/arbitration.spec.ts",
    "**/registration.spec.ts",
    "**/dpip-*.spec.ts",
  ],
  workers: 1,
  fullyParallel: false,
  timeout: STAGING ? 120_000 : 60_000,
  retries: STAGING ? 2 : 0,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
});
