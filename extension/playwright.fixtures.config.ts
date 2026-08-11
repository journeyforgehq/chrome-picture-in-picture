import { defineConfig } from "@playwright/test";

// FOUR Playwright configs. THE RULE: one config per EXTERNAL DEPENDENCY, not
// one per suite. Before adding a fifth, name the dependency it needs that none
// of these already brings — if you cannot, it belongs in an existing one.
//
//   playwright.config.ts          — needs a WRANGLER WORKER. Its globalSetup
//                                   builds the extension and spawns one; specs
//                                   load the extension in a persistent context.
//                                   Slow by nature.
//   playwright.visual.config.ts   — needs the PREVIEW GALLERY. Brings its own
//                                   webServer on :4173, asserts computed style
//                                   + screenshots.
//   playwright.granted.config.ts  — needs a LOADED EXTENSION WITH <all_urls>
//                                   ALREADY GRANTED. Its globalSetup builds
//                                   dist/ and mirrors it to .tmp-granted-dist/
//                                   with the host permission promoted from
//                                   optional to required, because
//                                   chrome.permissions.request() cannot be
//                                   driven under automation. arbitration.spec
//                                   and registration.spec run there.
//   playwright.fixtures.config.ts — THIS ONE. Needs NOTHING: the specs serve
//                                   their own static pages from e2e/serve.ts
//                                   (localhost:3000 + 127.0.0.1:3001, two
//                                   origins so the iframe cases are genuinely
//                                   cross-origin). Three specs qualify:
//
//                                     detection.spec.ts   — ~40 fixtures scoring
//                                       via pipEntry({ dryRun: true }); no
//                                       gesture, no PiP call.
//                                     gesture.spec.ts     — the real
//                                       requestPictureInPicture() call under a
//                                       real page.click(), plus a no-gesture
//                                       control.
//                                     dpip-visual.spec.ts — the OTHER real call,
//                                       documentPictureInPicture.requestWindow(),
//                                       and the computed style of the window it
//                                       opens.
//                                     dpip-controls.spec.ts — what enhanceWindow
//                                       DRAWS in that window: the control bar's
//                                       computed style, its hover/focus reveal,
//                                       its geometry, and the buttons acting on
//                                       the moved video.
//
// gesture.spec.ts lives here rather than in a fourth config because it needs
// the same two things detection needs and nothing else: these self-served
// fixture pages, and the autoplay flag below. MEASURED, not assumed: real PiP
// entry and exit both work HEADLESS in this Chromium — document.pictureInPicture
// Element is set, the PictureInPictureWindow reports real dimensions, and the
// no-gesture control still gets its NotAllowedError. Add --headed to watch the
// floating windows appear; nothing in either spec requires it.
//
// dpip-visual.spec.ts qualifies on exactly the same test — NAME THE EXTERNAL
// DEPENDENCY IT NEEDS THAT THE OTHER TWO DO NOT BRING, and there isn't one. It
// serves the same fixtures from the same e2e/serve.ts, wants the same autoplay
// flag, and calls the same shipped pipEntry through the same addInitScript
// round trip; the only difference is which branch of pipEntry it drives —
// documentPictureInPicture.requestWindow() instead of
// requestPictureInPicture() — and a browser API is not an external dependency.
// It has ONE environmental requirement of its own, `viewport: null`, and that
// is declared PER FILE with test.use() rather than here, so the requirement
// travels with the spec that needs it and cannot be silently inherited (or
// silently lost) by the other two. That is the same reasoning that keeps this
// from becoming a fifth config: a per-file need gets a per-file declaration.
//
// dpip-controls.spec.ts joins on the same test and fails it the same way — it
// serves one more self-served fixture from the same e2e/serve.ts and drives the
// same shipped functions through the same addInitScript round trip. It carries
// the SAME two per-file declarations dpip-visual does (viewport: null and
// channel: "chromium"), and they are repeated in that file rather than hoisted
// here for exactly the reason given above: hoisting them would let the other
// specs inherit an environment they never asked for, and would let this one
// lose its own without anything failing.
//
// Deliberately NO globalSetup and NO webServer. Neither spec needs the wrangler
// worker or the preview gallery, and this is the suite that gets run hundreds
// of times while fixtures are written — a wrangler dependency would make it
// needlessly slow and fragile. Keep it that way.
//
// workers:1 + fullyParallel:false is also load-bearing here, not just tidiness:
// all three specs bind ports 3000/3001 in their own beforeAll, so they must
// never run concurrently.
//
// The main config testIgnores both of these and the visual config's testMatch
// never sees them, so no suite can silently start depending on another's
// fixtures.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/{detection,gesture,dpip-visual,dpip-controls}.spec.ts",
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
