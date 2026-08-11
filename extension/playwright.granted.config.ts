import { defineConfig } from "@playwright/test";

// FOUR Playwright configs. THE RULE (stated in playwright.fixtures.config.ts):
// one config per EXTERNAL DEPENDENCY, not one per suite. This one is the fourth
// because its dependency is one no other config brings:
//
//   AN UNPACKED BUILD OF THIS EXTENSION WITH <all_urls> ALREADY GRANTED.
//
// Why none of the other three fit:
//
//   playwright.config.ts          — brings a WRANGLER WORKER. These specs never
//                                   touch the backend, and making a wrangler
//                                   spawn a prerequisite of the arbitration and
//                                   registration checks would tie two unrelated
//                                   things together.
//   playwright.visual.config.ts   — brings the PREVIEW GALLERY on :4173. No
//                                   extension is loaded there at all.
//   playwright.fixtures.config.ts — brings NOTHING, deliberately, and says so:
//                                   "Deliberately NO globalSetup". Its two
//                                   specs run pipEntry inside an ordinary page
//                                   with no extension in the browser. These two
//                                   need a real loaded extension, so they do not
//                                   qualify.
//
// The globalSetup below builds dist/ and mirrors it to .tmp-granted-dist/ with
// the host permission promoted from optional to required — see e2e/granted-dist.ts
// for why that copy exists and, more importantly, for what it does NOT prove.
//
// Three specs qualify:
//
//   action-click.spec.ts — the worker->frame GESTURE HOP: Alt+P dispatched as a
//                          CDP rawKeyDown fires chrome.action.onClicked with a
//                          real transient activation, which reaches pipEntry
//                          through chrome.scripting.executeScript and opens a
//                          real PiP window. A-02 called this uncoverable; A-04
//                          retired that on S-11's measurement. It needs a
//                          LOADED extension (there is no other way to make the
//                          browser deliver an action event) and the granted
//                          host permission (so executeScript reaches the tab
//                          without also depending on activeTab). It is the only
//                          layer that can catch an INVARIANT 1 regression.
//   arbitration.spec.ts  — the WRITE side of window.__pipCoord: content script
//                          scores, worker ranks, verdict comes back per frame.
//                          Needs a real content script in a real cross-origin
//                          subframe, which needs the host permission.
//   registration.spec.ts — chrome.scripting.registerContentScripts against the
//                          REAL API rather than the in-memory stub in
//                          test/background/registration.test.ts. Registering
//                          <all_urls> needs the host permission too.
//
// All three serve their own fixture pages from e2e/serve.ts (localhost:3000 +
// 127.0.0.1:3001), the same two origins the detection fixtures use, so the
// iframe case is genuinely cross-origin.
//
// workers:1 + fullyParallel:false is load-bearing, not tidiness: every spec
// here binds ports 3000/3001 in its own beforeAll, and each launches a
// persistent browser context against the same .tmp-granted-dist/.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/{action-click,arbitration,registration}.spec.ts",
  workers: 1,
  fullyParallel: false,
  // Higher than the fixtures suite's 30s: every test here pays for a browser
  // launch with an unpacked extension plus a service-worker start, which the
  // fixtures suite never does.
  timeout: 60_000,
  globalSetup: "./e2e/granted-setup.ts",
  reporter: [["list"]],
});
