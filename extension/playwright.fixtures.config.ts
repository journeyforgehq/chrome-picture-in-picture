import { defineConfig } from "@playwright/test";

// THREE Playwright configs, one job each. Before adding a fourth, check that
// none of these already owns your suite:
//
//   playwright.config.ts          — the billing e2e suite. Its globalSetup
//                                   builds the extension and spawns a local
//                                   wrangler worker; specs load the extension
//                                   in a persistent context. Slow by nature.
//   playwright.visual.config.ts   — gallery pixel checks. Brings its own
//                                   webServer on :4173 (preview build), and
//                                   asserts computed style + screenshots.
//   playwright.fixtures.config.ts — THIS ONE. Detection fixtures: pure DOM
//                                   scoring via pipEntry({ dryRun: true }) on
//                                   static pages the spec serves itself from
//                                   e2e/serve.ts (localhost:3000 +
//                                   127.0.0.1:3001, two origins so the iframe
//                                   cases are genuinely cross-origin).
//
// Deliberately NO globalSetup and NO webServer here. Detection needs neither
// the wrangler worker nor the preview gallery, and this is the suite that gets
// run hundreds of times while ~40 fixtures are written — a wrangler dependency
// would make it needlessly slow and fragile. Keep it that way.
//
// The main config testIgnores **/detection.spec.ts and the visual config's
// testMatch never sees it, so no suite can silently start depending on
// another's fixtures.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/detection.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 30_000,
  reporter: [["list"]],
  use: {
    launchOptions: {
      // MEASURED, not assumed. Without this flag the first run of a01 came
      // back with paused:true and notes:["play-rejected:NotAllowedError"] —
      // Chrome's autoplay policy refuses UNMUTED autoplay without a user
      // gesture, so makeVideo({ playing: true, muted: false }) silently
      // produced a paused video and entry.ts scored it 1000 instead of 2000.
      // a01 still passed (one video cannot lose), but the play-vs-paused
      // fixtures later in this suite would have been measuring nothing.
      //
      // This is a DECLARED override of the fixture environment, in the same
      // spirit as harness.js's Object.defineProperty calls: the autoplay
      // policy is not what these fixtures test — entry.ts only ever reads
      // el.paused — and this flag is what makes `playing: true` actually mean
      // playing. If it is ever removed, harness.js will say so in
      // data-fixture-state rather than lying about it.
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
});
