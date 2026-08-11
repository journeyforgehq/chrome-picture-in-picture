import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServers } from "./serve";
import { pipEntry, type PipEntryResult } from "../src/pip/entry";
import { enhanceWindow } from "../src/pip/enhance";

/* ============================================================================
 * The enhanced window, MEASURED. Computed style, not DOM presence.
 * ============================================================================
 *
 * WHY THIS FILE EXISTS AT ALL. enhanceWindow's whole job is to make a stylesheet
 * cross a DOCUMENT boundary. `doc.adoptedStyleSheets.length === 1` proves the
 * assignment happened; it proves nothing about whether a single declaration
 * reached a single element. A sheet constructed in the wrong realm, a rule that
 * failed to parse, a selector that matches nothing — all three leave that
 * assertion green and leave the user looking at a 300x150 video in the corner of
 * a scrolling white box. So every assertion below reads getComputedStyle FROM
 * INSIDE THE PiP WINDOW, which is the only instrument that can tell the
 * difference.
 *
 * The unit tests in test/pip/enhance.test.ts run under happy-dom, which has no
 * layout engine and no Document PiP at all. They pin the sheet's CONTENT. This
 * pins its EFFECT.
 * ==========================================================================*/

/* ============================================================================
 * GROUP G — THE CANONICAL COVERAGE TABLE. THE ONE COPY. Task 16.
 * ============================================================================
 *
 * The design package (02-architecture.md §Group G) lists 12 scenarios for the
 * Document PiP / Pro path. Tasks 8-13 built the feature and wrote e2e as they
 * went, so a good deal of the catalogue was already covered but UNLABELLED —
 * this table is the audit, and the G-IDs now appear in the covering test names
 * so the catalogue is traceable in both directions. It lives HERE, once, and is
 * mirrored into e2e/README.md; the other three dpip specs point at it rather
 * than keeping copies that would drift.
 *
 *  ID  | proved by
 * -----+----------------------------------------------------------------------
 *  G01 | dpip-fallback.spec.ts — "G01 — with documentPictureInPicture absent…"
 *  G02 | dpip-fallback.spec.ts — "G02 — when requestWindow REJECTS…" (the toast
 *      |   half runs the real, browser-produced result through the real
 *      |   decideOutcome; the worker's executeScript(showToast) is pinned in
 *      |   test/background/registration-wiring.test.ts)
 *  G03 | THIS FILE — "G03 + G05 — the stylesheet crossed the document
 *      |   boundary…" (probe.inner === exactly [400,225]), corroborated by the
 *      |   video's own box in "G03 + G05 — the video fills the window…" and by
 *      |   the captured PNG's pixel dimensions in "G03 — the window RENDERS…",
 *      |   and by dpip-geometry.spec.ts's "G03 — the S-12 correction…", which
 *      |   measures this build's deficit rather than assuming one
 *  G04 | dpip-geometry.spec.ts — the oversize row AND the zero-size row; both
 *      |   assert the argument that actually reached requestWindow
 *  G05 | THIS FILE — "G03 + G05 — the stylesheet crossed…" (overflow:hidden on
 *      |   html, and scrollHeight === clientHeight on BOTH axes) and "G03 + G05
 *      |   — the video fills the window…" (overflow:hidden on body)
 *  G06 | THIS FILE — "G06 — the video MOVED…" (moved, not cloned) and "G06 —
 *      |   the video keeps playing across the move…" (same element, currentTime
 *      |   continuous, still advancing on the other side)
 *  G07 | THIS FILE — "G07 — restore puts the video back in #stage, still
 *      |   playing" and "G07 — closing the window tells the worker…" (the
 *      |   PIP_DPIP_CLOSED that clears activePip). SEE CARVE-OUT 3.
 *  G08 | THIS FILE — "G08 — a resize of the real window reports the CONTENT
 *      |   size to the worker". The storage.local half is worker-side and is
 *      |   pinned against the shipped bundle in
 *      |   test/background/registration-wiring.test.ts. SEE CARVE-OUT 2.
 *  G09 | dpip-geometry.spec.ts — "G09 — a resize is remembered…"
 *  G10 | dpip-geometry.spec.ts — "G10 — a DIFFERENT origin opens at its own
 *      |   size…", across serve.ts's two real origins
 *  G11 | test/pip/licence-lapse.test.ts — a UNIT test, deliberately: the row is
 *      |   "the next invocation uses native, with no paywall interruption",
 *      |   which needs no window at all. See that file's header for the choice.
 *  G12 | dpip-controls.spec.ts — "G12 — the buttons ACT on the video…" (play/
 *      |   pause on the moved element, and the speed readout that cannot lie),
 *      |   plus the bar's style, reveal, focus ring and geometry. SEEK and the
 *      |   full speed cycle are pinned in test/pip/enhance-controls.test.ts
 *      |   because the fixture's canvas captureStream is a LIVE stream and
 *      |   silently discards both currentTime and playbackRate — measured, not
 *      |   assumed; see that test's comment. A real seek on a real seekable
 *      |   file is a manual row.
 *
 * ----------------------------------------------------------------------------
 * WHAT A GREEN RUN OF THIS SUITE DOES NOT COVER. THREE THINGS. READ THEM.
 * ----------------------------------------------------------------------------
 *
 * 1. requestWindow()'s GESTURE REQUIREMENT. S-12 ran a no-gesture control in
 *    every arm — bundled Chromium and real Chrome, `viewport: null` and the
 *    default — and requestWindow opened a window EVERY TIME without user
 *    activation. Under automation the requirement is not enforced at all.
 *    S-10 measured it by hand (NotAllowedError) and the release smoke sheet
 *    re-checks it. There is deliberately NO assertion anywhere in these specs
 *    that touches it: one would pass for the wrong reason and then be believed.
 *    (The fixtures still click for real, because everything DOWNSTREAM of the
 *    call — the native fallback in particular — does need the activation.)
 *
 * 2. A USER-DRAGGED RESIZE. The `resize` event is exercised programmatically
 *    (Task 12 measured a real 400x225 -> 480x265 via resizeBy under a fresh
 *    click, and G09 carries that number into a re-open). Dragging an OS window
 *    frame is not automatable: Playwright's input goes to the page, not to the
 *    window manager. The debounce that turns a drag's BURST of events into one
 *    storage write is pinned by test/pip/enhance-resize.test.ts against fake
 *    timers, and by nothing here. Smoke sheet.
 *
 * 3. CHROME FIRING `pagehide` ON A CLOSING DOCUMENT PiP WINDOW. Task 11 flagged
 *    this and it is still true: the e2e drives restore() DIRECTLY, because no
 *    automation can close a real PiP window the way a user does. That
 *    enhanceWindow registers restore on `pagehide` is pinned by
 *    test/pip/enhance-lifecycle.test.ts; that Chrome FIRES that event on a
 *    user-closed PiP window is ASSUMED, not measured. Smoke sheet.
 *
 * ----------------------------------------------------------------------------
 * THE TWO GUARDS THAT PROTECT THE PAID TIER, MUTATION-TESTED (Task 16)
 * ----------------------------------------------------------------------------
 *
 * G05 — deleting `overflow:hidden` from enhance.ts's CSS FAILED both G05 tests
 * here, on the `overflow` assertions. It did NOT move `scrollableY`/`X`; the
 * comment beside those assertions explains why both are needed and neither is
 * spare.
 *
 * G03 — removing `win.resizeBy(deficitW, deficitH)` from entry.ts DID NOT fail
 * any G03 test at this layer, and the reason is not a weak assertion: on the
 * build this suite runs, requestWindow already returns the requested content
 * box (deficit 0), so there is nothing for the correction to do and nothing to
 * observe when it goes. test/pip/entry-dpip.test.ts caught it immediately (3
 * failures) because it SIMULATES the deficits S-12 measured elsewhere (-52 on
 * Chromium 131, -56 on Chrome 151). dpip-geometry.spec.ts's "G03 — the S-12
 * correction…" now measures this build's deficit, prints it, and turns itself
 * into a live guard on any build that has one. Do not delete the unit test on
 * the strength of the browser one: a browser cannot be asked for a deficit.
 * ==========================================================================*/

/* viewport: null IS LOAD-BEARING. Playwright's default 1280x720 viewport is
 * applied with CDP Emulation.setDeviceMetricsOverride and the Document PiP
 * window INHERITS the override — S-12 measured every requested size reporting
 * 1280x720, in bundled Chromium AND real Chrome. Left at the default, the
 * sizing assertions read the emulation instead of the browser, and "fixing"
 * the expectation to 1280x720 would pin the artifact as the contract.
 *
 * channel: "chromium" IS ALSO LOAD-BEARING, and it is the SECOND artifact of
 * this kind — a different one, so viewport: null does not cover it. MEASURED
 * HERE, three ways, requesting 400x225:
 *
 *   bundled Chromium, OLD headless   inner 800x600  outer 800x600  screen 800x600
 *   bundled Chromium, HEADED         inner 400x225  outer 400x259  screen 2240x1260
 *   channel "chromium", NEW headless inner 400x225  outer 400x259  screen 2240x1260
 *
 * The old headless shell has no window manager, so requestWindow's size is
 * IGNORED OUTRIGHT and the window reports the 800x600 default surface;
 * resizeBy() is a no-op there too, which silently disables pipEntry's S-12
 * correction as well. 800x600 is not 1280x720, so the viewport guard below
 * cannot catch it — and relaxing `inner` to whatever the run reported would
 * pin a headless artifact as the product's sizing contract.
 *
 * `channel: "chromium"` selects Chrome's NEW headless mode, which reproduces
 * the headed numbers exactly and needs no display, so this stays a per-file
 * `test.use` declaration rather than a fifth config or a headed run. The other
 * two specs in this config are untouched by it: they never open a Document PiP
 * window, so they have nothing to measure that old headless gets wrong.
 *
 * NOTE the outer/inner relationship in the two real rows: outer is h+34 and
 * inner comes back EXACT on this build — deficit 0, where S-12 measured -52 on
 * Chromium 131 and -56 on Chrome 151. That is the moving target pipEntry
 * measures at runtime instead of hardcoding, and this row is a third data
 * point for it, not a contradiction. */
test.use({ viewport: null, channel: "chromium" });

declare global {
  interface Window {
    /* __pipEntry is NOT redeclared here. gesture.spec.ts already declares it on
     * the global Window, and the two files share one TypeScript program, so a
     * second declaration with a different signature is a TS2717 conflict. This
     * spec never calls it from Node anyway — the fixture's own click handler
     * does, with a `prefs` argument gesture.spec.ts's narrower type does not
     * describe. Widening THAT declaration to suit this file would loosen the
     * type gesture.spec.ts relies on, so the duplicate is simply omitted. */
    __enhanceWindow?: typeof enhanceWindow;
    __pipApi?: { restore(): void };
    __pipWin?: Window;
    __lastResult?: PipEntryResult & { harnessError?: string };
    __lastSettled?: boolean;
    /** Everything the page tried to send to the worker. See the resize test. */
    __pipMessages?: { type?: string; origin?: string; w?: number; h?: number }[];
  }
}

const FIXTURE = "http://localhost:3000/g05-enhanced.html";

/** The medium preset, and the only size this fixture ever asks for. */
const WANT: [number, number] = [400, 225];

/** Run artifacts for a human to look at. Gitignored, same as every other
 *  directory of its kind in this repo — these are evidence from a run, never
 *  committed baselines. A pixel baseline would be the WRONG instrument here:
 *  harness.js paints a rotating hue and a frame counter into the video, so the
 *  content is different on every frame by design. */
const SCREENS = join(dirname(fileURLToPath(import.meta.url)), "__screens__");

let servers: { close(): Promise<void> };

test.beforeAll(() => {
  servers = startServers();
});

test.afterAll(async () => {
  await servers.close();
});

test.beforeEach(async ({ page }) => {
  // BOTH SHIPPED FUNCTIONS, SERIALIZED THE WAY CHROME SERIALIZES THEM. A
  // ReferenceError from either in the page is a genuine violation of rule 1 in
  // their header blocks — report it, do not paper over it here.
  await page.addInitScript(`window.__pipEntry = ${pipEntry.toString()}`);
  await page.addInitScript(`window.__enhanceWindow = ${enhanceWindow.toString()}`);
});

async function open(page: Page): Promise<void> {
  const head = await fetch(FIXTURE, { method: "HEAD" });
  expect(head.status, `fixture not found: ${FIXTURE}`).toBe(200);
  await page.goto(FIXTURE);
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "true");
}

/** Open the enhanced window under a real gesture, then decorate it the way the
 *  worker's second injection does — from outside the click, with no `win`. */
async function openAndEnhance(page: Page): Promise<PipEntryResult> {
  await page.click("#open");
  await page.waitForFunction(() => window.__lastSettled === true);

  const result = (await page.evaluate(() => window.__lastResult))!;
  const state = await page.evaluate(() => document.documentElement.dataset.fixtureState ?? "[]");
  const ctx = `\n  __lastResult: ${JSON.stringify(result)}\n  fixture state: ${state}\n`;

  expect(result?.harnessError, ctx).toBeUndefined();
  // THE PRECONDITION FOR EVERYTHING BELOW. If this browser silently fell back
  // to the native window, every style assertion after it would be measuring an
  // absent window rather than an undecorated one.
  expect(result?.mode, ctx).toBe("document");
  expect(result?.outcome, ctx).toBe("PIP_OK");
  expect(result?.fellBackFrom, ctx).toBeUndefined();

  // The second injection, reproduced: no `win` argument, exactly as
  // background.ts sends it — enhanceWindow has to find window.__pipWin itself.
  await page.evaluate(() => {
    window.__pipApi = window.__enhanceWindow!({
      opts: { inWindowControls: true, subtitles: false },
    });
  });
  return result;
}

/**
 * The PiP window AS A PLAYWRIGHT PAGE.
 *
 * MEASURED: Chromium surfaces a Document PiP window to CDP as an ordinary
 * target, so it arrives in context.pages() as a second `about:blank` page. That
 * is what makes real visual verification possible here at all — Playwright
 * locators, toHaveCSS and screenshot() all work against it, none of which can
 * reach another window through page.evaluate.
 */
function pipPage(context: BrowserContext, opener: Page): Page {
  const others = context.pages().filter((p) => p !== opener);
  expect(
    others.length,
    "\n  The Document PiP window did not appear as a second page in this\n" +
      "  context. Without it there is nothing to screenshot or assert CSS on.\n"
  ).toBe(1);
  return others[0];
}

/** A PNG's width and height, straight out of the IHDR chunk (bytes 16..23).
 *  No decoder and no dependency: the screenshot's own pixel dimensions are the
 *  assertion, and they are the one thing a header read can give exactly. */
function pngSize(file: string): [number, number] {
  const buf = readFileSync(file);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

/** Everything worth knowing about the decorated window, read from inside it. */
async function probeWindow(page: Page) {
  return await page.evaluate(() => {
    const w = window.__pipWin!;
    const d = w.document;
    const html = d.documentElement;
    const body = d.body;
    const video = d.querySelector("video")!;
    const cs = (el: Element) => w.getComputedStyle(el);
    return {
      inner: [w.innerWidth, w.innerHeight] as [number, number],
      outer: [w.outerWidth, w.outerHeight] as [number, number],
      // Carried purely so a sizing failure can name its cause: under the old
      // headless shell this reads 800x600 and equals `inner`.
      screen: [w.screen.width, w.screen.height] as [number, number],
      videoCount: d.querySelectorAll("video").length,
      stagePresent: d.querySelector(".pip-stage") !== null,
      overflow: cs(html).overflow,
      bodyOverflow: cs(body).overflow,
      bodyMargin: cs(body).marginTop,
      bodyPadding: cs(body).paddingTop,
      videoFit: cs(video).objectFit,
      videoBox: [
        Math.round(video.getBoundingClientRect().width),
        Math.round(video.getBoundingClientRect().height),
      ] as [number, number],
      scrollableY: html.scrollHeight > html.clientHeight,
      scrollableX: html.scrollWidth > html.clientWidth,
      adopted: (d as unknown as { adoptedStyleSheets: unknown[] }).adoptedStyleSheets.length,
      // The page's own video must be GONE from the opener — moved, not cloned.
      leftBehind: document.querySelectorAll("#stage video").length,
    };
  });
}

test.describe("the enhanced window @dpip", () => {
  test("THE INSTRUMENT'S OWN PRECONDITION — the opener is not running under the default emulated viewport", async ({
    page,
  }) => {
    // If `viewport: null` is ever dropped from this file, Playwright applies a
    // 1280x720 device-metrics override that the Document PiP window INHERITS,
    // and every size assertion below silently starts measuring the emulation.
    // The correct response to a failure here is to restore viewport: null —
    // never to change [400, 225] to whatever the run reported.
    await open(page);
    const vp = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    console.log(`  opener viewport: ${vp[0]}x${vp[1]}`);
    expect(
      vp,
      "\n  The opener is at Playwright's default 1280x720 emulated viewport.\n" +
        "  `test.use({ viewport: null })` has been lost, the PiP window will\n" +
        "  inherit the override, and the sizing assertions below prove nothing.\n"
    ).not.toEqual([1280, 720]);
  });

  test("G03 + G05 — the stylesheet crossed the document boundary and actually applied", async ({ page }) => {
    await open(page);
    await openAndEnhance(page);
    const probe = await probeWindow(page);
    const ctx = `\n  probe: ${JSON.stringify(probe)}\n`;
    // Reported on every run, not just on failure: these are the numbers the
    // whole task turns on, and the two environment artifacts documented at the
    // top of this file are both visible here at a glance.
    console.log(`  PiP window probe: ${JSON.stringify(probe)}`);

    // S-12: only true after pipEntry's corrective resizeBy. requestWindow's
    // `height` is not the content height, and the deficit moves between Chrome
    // builds — so this number failing means the correction was lost, not that
    // the expectation is stale. NEITHER of the two known ways to read a wrong
    // number here is a reason to change WANT; both are named in the message so
    // the next person does not have to rediscover them.
    expect(
      probe.inner,
      ctx +
        "\n  [1280,720] => `viewport: null` was lost from this file's test.use;\n" +
        "     the PiP window inherited Playwright's device-metrics override.\n" +
        "  [800,600] and equal to `screen` => this ran under the OLD headless\n" +
        "     shell, which ignores requestWindow's size and no-ops resizeBy.\n" +
        "     `channel: \"chromium\"` was lost from this file's test.use.\n" +
        "  FIX THE ENVIRONMENT, NEVER THIS EXPECTATION.\n"
    ).toEqual(WANT);

    /* COMPUTED STYLE, not DOM presence. Each of these is a rule from the
     * adopted sheet, measured on a real element by a real layout engine.
     *
     * G05, AND WHICH HALF OF IT DOES THE WORK — MEASURED BY MUTATION (Task 16).
     * Deleting `overflow:hidden` from enhance.ts's CSS fails THIS test and the
     * one below, on the two `overflow` assertions, and on nothing else:
     * `scrollableY`/`scrollableX` stayed FALSE throughout, because at 400x225
     * with the video sized to 100% there is nothing to overflow.
     *
     * So the two assertions are not redundant, and neither is decoration:
     *   overflow      catches the DECLARATION being lost — the SuperPiP defect.
     *   scrollableY/X catches the SHEET not applying at all, which is the other
     *                 failure this file exists for: an unstyled video lays out
     *                 at its inline 640x360 inside a 400x225 document and the
     *                 page really does scroll.
     * Do not "simplify" either into the other. */
    expect(probe.overflow, ctx).toBe("hidden");
    expect(probe.bodyMargin, ctx).toBe("0px");
    expect(probe.videoFit, ctx).toBe("contain");
    expect(probe.scrollableY, ctx).toBe(false);
    expect(probe.scrollableX, ctx).toBe(false);
  });

  test("G03 + G05 — the video fills the window instead of laying out at its 300x150 default", async ({
    page,
  }) => {
    // The failure this catches is the one the whole task is shaped around: the
    // video arrives in a document the page's CSS never reached, and without the
    // adopted sheet it renders at the intrinsic default in the top-left corner
    // of a black window. `querySelector("video") !== null` cannot see that.
    await open(page);
    await openAndEnhance(page);
    const probe = await probeWindow(page);
    const ctx = `\n  probe: ${JSON.stringify(probe)}\n`;

    expect(probe.adopted, ctx).toBe(1);
    expect(probe.stagePresent, ctx).toBe(true);
    expect(probe.videoBox, ctx).toEqual(WANT);
    expect(probe.bodyOverflow, ctx).toBe("hidden");
    expect(probe.bodyPadding, ctx).toBe("0px");
  });

  test("G06 — the video MOVED — one video in the PiP window, none left in the page", async ({ page }) => {
    await open(page);
    await openAndEnhance(page);
    const probe = await probeWindow(page);
    const ctx = `\n  probe: ${JSON.stringify(probe)}\n`;

    expect(probe.videoCount, ctx).toBe(1);
    expect(probe.leftBehind, ctx).toBe(0);
  });

  test("G06 — the video keeps playing across the move, with a CONTINUOUS currentTime", async ({
    page,
  }) => {
    /* THE OTHER HALF OF G06, and the half no DOM assertion can see. "The video
     * moved" is proved above by counting elements. This row also demands that
     * the thing that arrived is STILL THE SAME VIDEO, STILL RUNNING: a
     * cross-document adoption that re-attached the media element would leave
     * every count in this file correct and hand the user a black rectangle, or
     * a video that jumped back to the start.
     *
     * THREE SEPARATE CLAIMS, because two of them can hold while the third
     * fails:
     *   IDENTITY   a dataset marker written on the page's element BEFORE the
     *              move is read back off the element inside the PiP document.
     *              A clone would carry the marker too — but the count assertions
     *              in the test above (one there, none left here) already rule a
     *              clone out, and together the two are decisive.
     *   CONTINUITY currentTime did not go backwards across the boundary. The
     *              fixture's video has been playing for a while by then, so a
     *              reset to 0 is unmistakable — which is why the poll below
     *              waits for a non-trivial currentTime before the move rather
     *              than measuring at the start where 0 and "reset to 0" look
     *              the same.
     *   LIVENESS   it is still ADVANCING on the other side. `paused === false`
     *              is not that claim: a media element whose source went away
     *              reports exactly the same. */
    await open(page);

    await expect
      .poll(async () => await page.evaluate(() => document.querySelector("video")!.currentTime), {
        timeout: 5000,
        message: "the fixture's video never started playing, so there is nothing to be continuous",
      })
      .toBeGreaterThan(0.3);

    await page.click("#open");
    await page.waitForFunction(() => window.__lastSettled === true);
    const result = (await page.evaluate(() => window.__lastResult))!;
    expect(result?.mode, `\n  __lastResult: ${JSON.stringify(result)}\n`).toBe("document");

    // The marker and the reading are taken in the SAME turn as the move, so no
    // wall-clock time passes between "before" and "after" that could be
    // mistaken for a discontinuity.
    const moved = await page.evaluate(() => {
      const source = document.querySelector("video")!;
      source.dataset.g06 = "the-page-element";
      const before = { currentTime: source.currentTime, paused: source.paused };
      window.__pipApi = window.__enhanceWindow!({
        opts: { inWindowControls: true, subtitles: false },
      });
      const arrived = window.__pipWin!.document.querySelector("video")!;
      return {
        before,
        after: {
          currentTime: arrived.currentTime,
          paused: arrived.paused,
          marker: arrived.dataset.g06 ?? null,
          readyState: arrived.readyState,
        },
      };
    });
    const ctx = `\n  across the move: ${JSON.stringify(moved)}\n`;
    console.log(`  G06 across the move: ${JSON.stringify(moved)}`);

    expect(moved.after.marker, ctx).toBe("the-page-element");
    expect(moved.before.paused, ctx).toBe(false);
    expect(moved.after.paused, ctx).toBe(false);
    // CONTINUOUS: not rewound, and not zero.
    expect(moved.after.currentTime, ctx).toBeGreaterThanOrEqual(moved.before.currentTime);
    expect(moved.after.currentTime, ctx).toBeGreaterThan(0.3);
    // And the pipeline survived the trip: HAVE_CURRENT_DATA or better.
    expect(moved.after.readyState, ctx).toBeGreaterThanOrEqual(2);

    // STILL RUNNING on the far side of the boundary, which `paused` cannot say.
    await expect
      .poll(
        async () =>
          await page.evaluate(() => window.__pipWin!.document.querySelector("video")!.currentTime),
        {
          timeout: 5000,
          message:
            "currentTime stopped advancing after the move — the element is in " +
            "the PiP document and not paused, but nothing is playing",
        }
      )
      .toBeGreaterThan(moved.after.currentTime);
  });

  test("G07 — restore puts the video back in #stage, still playing", async ({ page }) => {
    // Rule 4: the site's player layout has to survive the round trip. The unit
    // test proves the insertBefore arithmetic; this proves the element is alive
    // and rendering on the other side of a real cross-document move.
    await open(page);
    await openAndEnhance(page);

    const after = await page.evaluate(() => {
      window.__pipApi!.restore();
      const v = document.querySelector<HTMLVideoElement>("#stage video");
      return v
        ? {
            present: true,
            paused: v.paused,
            parent: v.parentElement?.id ?? null,
            rect: [
              Math.round(v.getBoundingClientRect().width),
              Math.round(v.getBoundingClientRect().height),
            ],
          }
        : { present: false };
    });
    const ctx = `\n  after restore: ${JSON.stringify(after)}\n`;

    expect(after.present, ctx).toBe(true);
    expect(after.parent, ctx).toBe("stage");
    expect(after.paused, ctx).toBe(false);
    expect(after.rect, ctx).toEqual([640, 360]);
  });

  test("G07 — a SECOND restore leaves the page exactly as the first one left it", async ({ page }) => {
    /* WHY THIS IS A BROWSER TEST AND NOT ONLY A UNIT ONE. `restore` is reachable
     * from two directions — the PiP window's own pagehide listener and the
     * handle enhanceWindow returns — so a close that also triggers an explicit
     * teardown runs it twice. Before the idempotence guard, the second run found
     * `__pipHome` already deleted and took the `document.body.appendChild`
     * fallback: the video was YANKED out of #stage and dropped at the end of the
     * body, where it no longer inherits the player's layout. happy-dom can see
     * the reparenting; it cannot see that the element then renders at a
     * different size in a different place, which is the part the user suffers.
     *
     * So this asserts the geometry and captures the restored PAGE for a human —
     * every other frame in this file is of the PiP window, and the page the user
     * comes back to is a surface in its own right. */
    await open(page);
    await openAndEnhance(page);

    const after = await page.evaluate(() => {
      window.__pipApi!.restore();
      window.__pipApi!.restore(); // the one that used to break the page
      const v = document.querySelector<HTMLVideoElement>("video");
      const r = v!.getBoundingClientRect();
      return {
        videoCount: document.querySelectorAll("video").length,
        parent: v!.parentElement?.id ?? v!.parentElement?.tagName ?? null,
        // A direct child of <body> is the exact symptom of the fallback branch.
        inStage: !!document.querySelector("#stage video"),
        rect: [Math.round(r.width), Math.round(r.height)],
        objectFit: getComputedStyle(v!).objectFit,
        paused: v!.paused,
      };
    });
    const ctx = `\n  after double restore: ${JSON.stringify(after)}\n`;

    expect(after.videoCount, ctx).toBe(1);
    expect(after.parent, ctx).toBe("stage");
    expect(after.inStage, ctx).toBe(true);
    // The page's own layout, not the PiP window's: the enhanced sheet is gone
    // with its document, so `object-fit: contain !important` must no longer
    // apply and the element is back at the size the fixture gives it.
    expect(after.rect, ctx).toEqual([640, 360]);
    expect(after.paused, ctx).toBe(false);

    mkdirSync(SCREENS, { recursive: true });
    const file = join(SCREENS, "dpip-restored-page.png");
    await page.screenshot({ path: file });
    console.log(`  captured ${file}`);
  });

  test("G07 — closing the window tells the worker, so activePip cannot go stale", async ({
    page,
  }) => {
    /* THE HALF OF G07 THAT IS NOT ABOUT THE VIDEO. "activePip cleared" is a
     * worker fact, and the worker learns it from exactly one place: the
     * PIP_DPIP_CLOSED message enhanceWindow's restore sends. Chrome gives the
     * worker NO notification that a Document PiP window closed, so if that
     * message stops being sent, `activePip` outlives the window, the next
     * toolbar click takes the EXIT branch against a window that is not there,
     * and the button silently does nothing.
     *
     * THREE THINGS THIS DOES NOT PROVE, all of them covered elsewhere or named:
     *   - that Chrome fires `pagehide` when the USER closes the window. No
     *     automation can close a real PiP window, so this drives restore()
     *     directly. CARVE-OUT 3 in the header. That restore is REGISTERED on
     *     pagehide is pinned by test/pip/enhance-lifecycle.test.ts.
     *   - that the worker clears the record on receipt. That is
     *     test/background/registration-wiring.test.ts, against the shipped
     *     bundle.
     *   - anything about a real extension context. This fixture is a plain page
     *     with none, so the send is RECORDED rather than delivered — the same
     *     honest stub the G08 resize test uses, and for the same reason.
     *
     * What is left is the part only a browser can show: that after a real
     * cross-document move and a real restore, the shipped function actually
     * reaches for chrome.runtime and sends this exact message, ONCE. */
    await open(page);
    await openAndEnhance(page);

    const installed = await page.evaluate(() => {
      window.__pipMessages = [];
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          id: "e2e",
          sendMessage: (m: { type?: string }) => {
            window.__pipMessages!.push(m);
            return Promise.resolve();
          },
        },
      };
      return (window as unknown as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id;
    });
    expect(installed, "the recording chrome stub did not install on the page").toBe("e2e");

    const after = await page.evaluate(() => {
      window.__pipApi!.restore();
      const v = document.querySelector<HTMLVideoElement>("#stage video");
      return {
        messages: window.__pipMessages,
        home: v !== null,
        paused: v ? v.paused : null,
      };
    });
    const ctx = `\n  after restore: ${JSON.stringify(after)}\n`;
    console.log(`  G07 messages: ${JSON.stringify(after.messages)}`);

    // The user's video first — the message is bookkeeping, and enhance.ts
    // deliberately sends it only AFTER the element is home.
    expect(after.home, ctx).toBe(true);
    expect(after.paused, ctx).toBe(false);

    const closed = (after.messages ?? []).filter((m) => m.type === "PIP_DPIP_CLOSED");
    expect(closed.length, ctx).toBe(1);

    /* A SECOND restore must NOT report again. Not tidiness: by the time a
     * stray second report arrives, `activePip` may already describe a NEW
     * window, and clearing it would break the very button this message exists
     * to keep working. */
    const again = await page.evaluate(() => {
      window.__pipApi!.restore();
      return window.__pipMessages;
    });
    expect(
      (again ?? []).filter((m) => m.type === "PIP_DPIP_CLOSED").length,
      `\n  after the second restore: ${JSON.stringify(again)}\n`
    ).toBe(1);
  });

  test("G03 — the window RENDERS — CSS asserted on the real element, and a frame captured", async ({
    page,
    context,
  }) => {
    /* The other tests read getComputedStyle through page.evaluate, which is the
     * only way to reach a document that is not this Page. This one goes at the
     * same properties through Playwright's own locator assertions on the PiP
     * window as a Page, so the measurement does not depend on the evaluate
     * bridge being right, and then captures an actual frame.
     *
     * The screenshot is NOT compared to a baseline — see SCREENS above. What is
     * asserted is its PIXEL DIMENSIONS, which is the part a baseline could not
     * make more certain anyway: a capture of the whole PiP surface at
     * 400x225 CSS px must come back at exactly that times the device pixel
     * ratio. An unstyled window (the failure this whole task guards against)
     * cannot produce that number. The image itself is left in e2e/__screens__/
     * for a human to look at. */
    await open(page);
    await openAndEnhance(page);

    const pip = pipPage(context, page);
    const video = pip.locator("video");
    await expect(video).toHaveCount(1);
    await expect(video).toHaveCSS("object-fit", "contain");
    await expect(pip.locator("body")).toHaveCSS("margin", "0px");
    await expect(pip.locator("body")).toHaveCSS("overflow-x", "hidden");
    await expect(pip.locator(".pip-stage")).toHaveCount(1);

    // The video's own box, measured by Playwright rather than by our evaluate.
    const box = (await video.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual(WANT);
    expect([Math.round(box.x), Math.round(box.y)]).toEqual([0, 0]);

    mkdirSync(SCREENS, { recursive: true });
    const file = join(SCREENS, "dpip-enhanced.png");
    await pip.screenshot({ path: file });
    const dpr = await pip.evaluate(() => window.devicePixelRatio);
    console.log(`  captured ${file} at dpr ${dpr}`);
    expect(pngSize(file)).toEqual([WANT[0] * dpr, WANT[1] * dpr]);
  });

  test("a second enhance call is a no-op — the video is not moved twice", async ({ page }) => {
    await open(page);
    await openAndEnhance(page);

    await page.evaluate(() => {
      window.__enhanceWindow!({ opts: { inWindowControls: true, subtitles: false } });
    });

    const probe = await probeWindow(page);
    expect(probe.videoCount, `\n  probe: ${JSON.stringify(probe)}\n`).toBe(1);
  });

  test("G08 — a resize of the real window reports the CONTENT size to the worker", async ({
    page,
    context,
  }) => {
    /* ======================================================================
     * WHAT THIS LAYER CAN PROVE, AND WHAT IT CANNOT. Read this before
     * treating it as full coverage of the resize feature.
     *
     * CAN: that a REAL `resize` event on a REAL Document PiP window reaches
     * the listener enhanceWindow registered, and that the size it reports is
     * the one the browser reports as `inner` — not `outer`. That distinction
     * is the entire point of the feature's storage format (S-12: `outer`
     * carries a 34px title bar, so storing it makes the window creep larger on
     * every reopen) and it can only be measured where a real window has real
     * chrome. happy-dom has neither, so the unit test can only assert that the
     * numbers came from the properties named `innerWidth`/`innerHeight`.
     *
     * CANNOT: that a USER-DRAGGED resize behaves the same way. There is no
     * automation route to dragging the OS window frame of a PiP window —
     * Playwright's input goes to the page, not to the window manager. This
     * test resizes PROGRAMMATICALLY, which fires the same event but does not
     * exercise the burst of events a drag produces. The debounce that turns
     * that burst into one storage write is pinned by
     * test/pip/enhance-resize.test.ts against fake timers, and by nothing
     * here. A human dragging the corner and confirming the window reopens at
     * that size is a manual-checkpoint row.
     *
     * The `chrome` stub below is the other honest limitation: this fixture is
     * a plain page with no extension context, so the SEND is recorded rather
     * than delivered. What happens to the message on the worker side is
     * pinned in test/background/registration-wiring.test.ts, against the
     * shipped bundle.
     * ====================================================================*/
    await open(page);
    await openAndEnhance(page);

    // Record what the page tries to send. Installed AFTER enhanceWindow ran,
    // which is safe and deliberate: the listener reads `window.chrome` when the
    // debounce fires, not when it is registered — so this also proves the send
    // is not capturing a reference at registration time.
    const installed = await page.evaluate(() => {
      window.__pipMessages = [];
      (window as unknown as { chrome: unknown }).chrome = {
        runtime: {
          id: "e2e",
          sendMessage: (m: { type?: string }) => {
            window.__pipMessages!.push(m);
            return Promise.resolve();
          },
        },
      };
      return (window as unknown as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime?.id;
    });
    // Loud, because a silently-failed stub would make the poll below time out
    // with nothing to say about why.
    expect(installed, "the recording chrome stub did not install on the page").toBe("e2e");

    const pip = pipPage(context, page);
    const before = await pip.evaluate(() => [window.innerWidth, window.innerHeight]);

    /* THE RESIZE ITSELF. A click first, because Document PiP requires user
     * activation for resizeBy — entry.ts spends the opening activation on its
     * one corrective call, and a later one throws NotAllowedError without a
     * fresh gesture. The click lands on the stage inside the PiP window, which
     * is a real input event to that document. */
    await pip.locator(".pip-stage").click({ position: { x: 5, y: 5 } });
    const resized = await pip.evaluate(() => {
      try {
        window.resizeBy(80, 40);
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
    expect(
      resized.ok,
      `\n  window.resizeBy threw inside the PiP window: ${resized.error}\n` +
        "  Document PiP resizeBy needs user activation; the click above is what\n" +
        "  supplies it. If this starts failing, the click stopped landing.\n"
    ).toBe(true);

    /* POLLED, not read back synchronously. The window manager applies the size
     * out of band: read immediately after the call and `inner` is still the old
     * value, which measures the read timing rather than the resize. */
    await expect
      .poll(async () => await pip.evaluate(() => [window.innerWidth, window.innerHeight]), {
        timeout: 5000,
        message:
          "resizeBy did not change the window's content size, so there is " +
          "nothing for a resize listener to have heard",
      })
      .not.toEqual(before);
    console.log(
      `  resize: before ${JSON.stringify(before)} -> ` +
        JSON.stringify(await pip.evaluate(() => [window.innerWidth, window.innerHeight]))
    );

    // The debounce is 500ms; poll rather than sleep so a faster path is not
    // punished and a slower one is not flaky.
    await expect
      .poll(async () => (await page.evaluate(() => window.__pipMessages))?.length ?? 0, {
        timeout: 5000,
      })
      .toBeGreaterThan(0);

    const messages = (await page.evaluate(() => window.__pipMessages))!;
    console.log(`  messages: ${JSON.stringify(messages)}`);
    const geometry = messages.filter((m) => m.type === "PIP_GEOMETRY_CHANGED");
    expect(geometry.length, `\n  messages: ${JSON.stringify(messages)}\n`).toBe(1);

    const probe = await pip.evaluate(() => ({
      inner: [window.innerWidth, window.innerHeight],
      outer: [window.outerWidth, window.outerHeight],
    }));
    const ctx = `\n  reported: ${JSON.stringify(geometry[0])}\n  window: ${JSON.stringify(probe)}\n`;

    // THE ASSERTION THIS TEST EXISTS FOR. `inner`, and demonstrably not `outer`
    // — the second expect is what fails if someone "simplifies" the payload to
    // the outer size, which every other assertion here would tolerate.
    expect([geometry[0].w, geometry[0].h], ctx).toEqual(probe.inner);
    expect([geometry[0].w, geometry[0].h], ctx).not.toEqual(probe.outer);
    expect(geometry[0].origin, ctx).toBe("http://localhost:3000");
  });
});
