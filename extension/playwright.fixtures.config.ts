import { defineConfig } from "@playwright/test";

// THREE Playwright configs. THE RULE: one config per EXTERNAL DEPENDENCY, not
// one per suite. Before adding a fourth, name the dependency it needs that none
// of these already brings — if you cannot, it belongs in an existing one.
//
//   playwright.config.ts          — needs a WRANGLER WORKER. Its globalSetup
//                                   builds the extension and spawns one; specs
//                                   load the extension in a persistent context.
//                                   Slow by nature.
//   playwright.visual.config.ts   — needs the PREVIEW GALLERY. Brings its own
//                                   webServer on :4173, asserts computed style
//                                   + screenshots.
//   playwright.fixtures.config.ts — THIS ONE. Needs NOTHING: the specs serve
//                                   their own static pages from e2e/serve.ts
//                                   (localhost:3000 + 127.0.0.1:3001, two
//                                   origins so the iframe cases are genuinely
//                                   cross-origin). Two specs qualify:
//
//                                     detection.spec.ts — ~40 fixtures scoring
//                                       via pipEntry({ dryRun: true }); no
//                                       gesture, no PiP call.
//                                     gesture.spec.ts   — the real
//                                       requestPictureInPicture() call under a
//                                       real page.click(), plus a no-gesture
//                                       control.
//
// gesture.spec.ts lives here rather than in a fourth config because it needs
// the same two things detection needs and nothing else: these self-served
// fixture pages, and the autoplay flag below. MEASURED, not assumed: real PiP
// entry and exit both work HEADLESS in this Chromium — document.pictureInPicture
// Element is set, the PictureInPictureWindow reports real dimensions, and the
// no-gesture control still gets its NotAllowedError. Add --headed to watch the
// floating windows appear; nothing in either spec requires it.
//
// Deliberately NO globalSetup and NO webServer. Neither spec needs the wrangler
// worker or the preview gallery, and this is the suite that gets run hundreds
// of times while fixtures are written — a wrangler dependency would make it
// needlessly slow and fragile. Keep it that way.
//
// workers:1 + fullyParallel:false is also load-bearing here, not just tidiness:
// both specs bind ports 3000/3001 in their own beforeAll, so they must never
// run concurrently.
//
// The main config testIgnores both of these and the visual config's testMatch
// never sees them, so no suite can silently start depending on another's
// fixtures.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/{detection,gesture}.spec.ts",
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
