import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServers } from "./serve";
import { pipEntry, type PipEntryResult } from "../src/pip/entry";
import { enhanceWindow } from "../src/pip/enhance";

/* ============================================================================
 * The in-window control bar, MEASURED. Computed style, not DOM presence.
 * ============================================================================
 *
 * WHY THE BAR EXISTS. Spike S-04 measured that chrome.commands shortcuts DO NOT
 * FIRE while the floating PiP window has focus — they need a browser window
 * focused. The moment the user clicks the floating window to interact with it
 * is therefore the moment their keyboard shortcuts stop working. Native PiP
 * offers only Chrome's own hover controls; this window is our HTML, so it gets
 * real buttons. That is a headline Pro feature, not decoration, and it is why
 * this spec is a peer of dpip-window.spec.ts rather than a paragraph in it.
 *
 * WHY THIS FILE IS SEPARATE FROM THE UNIT TESTS. test/pip/enhance-controls.
 * test.ts runs under happy-dom: no layout, no cascade, no hover, no focus ring.
 * It can prove that clicking the pause button calls pause(); it cannot prove
 * that the button is VISIBLE, that the scrim is dark enough to read white text
 * against, or that the focus outline the a11y story depends on actually paints.
 * Every assertion below reads getComputedStyle on a real element inside a real
 * Document PiP window, and the last test captures a frame for a human to look
 * at — because a passing toHaveCSS cannot tell you the bar is READABLE.
 * ==========================================================================*/

/* viewport: null AND channel: "chromium" are both load-bearing, for the two
 * reasons dpip-window.spec.ts documents at length:
 *
 *   viewport: null      — Playwright's default 1280x720 viewport is applied
 *                         with CDP Emulation.setDeviceMetricsOverride and the
 *                         Document PiP window INHERITS it (S-12), so the bar's
 *                         geometry would be measured against the emulation.
 *   channel: "chromium" — the OLD headless shell has no window manager: it
 *                         ignores requestWindow's size outright and no-ops
 *                         resizeBy, so the window comes back 800x600 and the
 *                         "the bar does not swallow the video" arithmetic is
 *                         measuring a surface the product never produces.
 *
 * Neither belongs in the shared config: they are per-file needs, so they get a
 * per-file declaration that travels with the spec and cannot be silently lost. */
test.use({ viewport: null, channel: "chromium" });

declare global {
  interface Window {
    /* __pipEntry, __enhanceWindow, __pipApi, __pipWin, __lastResult and
     * __lastSettled are all declared once in the specs that introduced them
     * (gesture.spec.ts and dpip-window.spec.ts). These files share ONE
     * TypeScript program, so redeclaring any of them here with a different
     * signature is a TS2717 conflict. Only the property this spec adds is
     * declared below. */
    __pipControls?: { restore(): void };
  }
}

const FIXTURE = "http://localhost:3000/g12-controls.html";

/** The medium preset — the only size this fixture asks for, and the tightest
 *  window the bar has to stay usable in. */
const WANT: [number, number] = [400, 225];

/** Run artifacts for a human to look at. Gitignored: these are evidence from a
 *  run, never committed baselines. A pixel baseline would be the wrong
 *  instrument — harness.js paints a rotating hue and a frame counter into the
 *  video, so the content differs on every frame by design. */
const SCREENS = join(dirname(fileURLToPath(import.meta.url)), "__screens__");

let servers: { close(): Promise<void> };

test.beforeAll(() => {
  servers = startServers();
});

test.afterAll(async () => {
  await servers.close();
});

test.beforeEach(async ({ page }) => {
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
 *  worker's second injection does — from outside the click, with no `win`, and
 *  with BOTH Pro switches on, which is what this spec is here to measure. */
async function openAndEnhance(page: Page): Promise<void> {
  await page.click("#open");
  await page.waitForFunction(() => window.__lastSettled === true);

  const result = (await page.evaluate(() => window.__lastResult))!;
  const state = await page.evaluate(() => document.documentElement.dataset.fixtureState ?? "[]");
  const ctx = `\n  __lastResult: ${JSON.stringify(result)}\n  fixture state: ${state}\n`;

  expect(result?.harnessError, ctx).toBeUndefined();
  // THE PRECONDITION FOR EVERYTHING BELOW. A silent fall back to the native
  // window would leave every style assertion measuring an absent window rather
  // than an undecorated one.
  expect(result?.mode, ctx).toBe("document");
  expect(result?.outcome, ctx).toBe("PIP_OK");
  expect(result?.fellBackFrom, ctx).toBeUndefined();

  await page.evaluate(() => {
    window.__pipControls = window.__enhanceWindow!({
      opts: { inWindowControls: true, subtitles: true },
    });
  });
}

/**
 * The PiP window AS A PLAYWRIGHT PAGE. Chromium surfaces a Document PiP window
 * to CDP as an ordinary target, so it arrives in context.pages() as a second
 * about:blank page — which is what makes locators, toHaveCSS, hover() and
 * screenshot() usable against it at all. page.evaluate cannot reach it.
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

/** The video's live playback state, read from inside the PiP window. */
async function videoState(page: Page) {
  return await page.evaluate(() => {
    const v = window.__pipWin!.document.querySelector("video")!;
    const tracks = v.textTracks;
    return {
      paused: v.paused,
      currentTime: v.currentTime,
      playbackRate: v.playbackRate,
      trackCount: tracks.length,
      trackMode: tracks.length ? tracks[0].mode : null,
      trackKind: tracks.length ? tracks[0].kind : null,
    };
  });
}

test.describe("the in-window control bar @dpip", () => {
  test("THE INSTRUMENT'S OWN PRECONDITION — the opener is not under the default emulated viewport", async ({
    page,
  }) => {
    // If `viewport: null` is ever dropped from this file, the PiP window
    // inherits a 1280x720 device-metrics override and every geometry assertion
    // below silently starts measuring the emulation. The fix is to restore
    // viewport: null, never to relax the numbers.
    await open(page);
    const vp = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    console.log(`  opener viewport: ${vp[0]}x${vp[1]}`);
    expect(vp).not.toEqual([1280, 720]);
  });

  test("the bar is styled by the adopted sheet — position, scrim and button colour", async ({
    page,
    context,
  }) => {
    /* THE ASSERTION THAT MATTERS MOST IN THIS FILE. `.pip-bar` existing in the
     * DOM proves buildControls ran. It proves NOTHING about whether one
     * declaration reached one element: the bar's rules live in the same adopted
     * constructed stylesheet as the video's, and a sheet built in the wrong
     * realm, a rule that failed to parse or a selector that matches nothing all
     * leave querySelector green and leave the user looking at four unstyled
     * buttons stacked in the top-left corner of a black window. */
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);

    const bar = pip.locator(".pip-bar");
    await expect(bar).toHaveCount(1);
    // Absolute inside the relative stage: the bar floats OVER the video rather
    // than taking height from it. In the flow it would shrink the video on
    // every resize and reintroduce the letterboxing the sheet exists to remove.
    await expect(bar).toHaveCSS("position", "absolute");
    await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0.62)");
    await expect(bar).toHaveCSS("display", "flex");
    // Hidden at rest. A bar that is always on turns the window into a player
    // chrome demo instead of a video.
    await expect(bar).toHaveCSS("opacity", "0");

    const buttons = pip.locator(".pip-btn");
    await expect(buttons).toHaveCount(4);
    // White text is the whole reason the scrim above is opaque enough to read
    // against; asserting one without the other proves neither.
    await expect(buttons.first()).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(buttons.first()).toHaveCSS("cursor", "pointer");

    const measured = {
      position: await bar.evaluate((el) => getComputedStyle(el).position),
      background: await bar.evaluate((el) => getComputedStyle(el).backgroundColor),
      restOpacity: await bar.evaluate((el) => getComputedStyle(el).opacity),
      buttonColor: await buttons.first().evaluate((el) => getComputedStyle(el).color),
      buttonBg: await buttons.first().evaluate((el) => getComputedStyle(el).backgroundColor),
      timeText: await pip.locator(".pip-time").textContent(),
    };
    console.log(`  bar computed style: ${JSON.stringify(measured)}`);
  });

  test("hovering the stage reveals the bar", async ({ page, context }) => {
    // The reveal is the ONLY thing standing between "clean video" and "player
    // chrome permanently glued over the bottom of the frame", and it is pure
    // CSS — there is no JS to unit test. If the `.pip-stage:hover` selector
    // stopped matching, every other assertion in this file would still pass.
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);

    const bar = pip.locator(".pip-bar");
    await expect(bar).toHaveCSS("opacity", "0");
    await pip.locator(".pip-stage").hover();
    await expect(bar).toHaveCSS("opacity", "1");
  });

  test("a programmatic focus lands and paints a VISIBLE outline", async ({ page, context }) => {
    /* :focus, NOT :focus-visible — src/options/OptionsView.tsx documents why at
     * length and src/pip/enhance.ts repeats it: Chrome only matches
     * :focus-visible on a programmatic .focus() when the preceding interaction
     * was already keyboard-ish, so a :focus-visible-only ring is INVISIBLE to
     * exactly this check and therefore silently regressable. This test is the
     * guard that makes that choice hold; if someone "modernises" the selector,
     * it fails here rather than in front of a keyboard user. */
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);

    const speed = pip.locator('[data-pip="speed"]');
    await speed.focus();

    // Focus actually landed — without this the outline assertions below could
    // pass by measuring a default that happens to look the same.
    expect(await pip.evaluate(() => document.activeElement?.getAttribute("data-pip"))).toBe(
      "speed"
    );
    await expect(speed).toHaveCSS("outline-style", "solid");
    await expect(speed).toHaveCSS("outline-width", "2px");
    await expect(speed).toHaveCSS("outline-color", "rgb(22, 119, 255)");

    // The keyboard half of the reveal. A ring painted on an element inside an
    // opacity:0 bar is a ring nobody can see, so :focus-within has to fire too.
    await expect(pip.locator(".pip-bar")).toHaveCSS("opacity", "1");

    const ring = await speed.evaluate((el) => {
      const cs = getComputedStyle(el);
      return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset].join(" ");
    });
    console.log(`  focus ring: ${ring}`);
  });

  test("the bar sits over the video without swallowing it", async ({ page, context }) => {
    /* GEOMETRY, because "styled" and "usable" are different claims. Three ways
     * this could be styled correctly and still be wrong: the bar could be as
     * tall as the window, it could be pinned to the top where the OS title bar
     * lives, or it could be narrower than the window and leave the scrim
     * ragged. The window is 400x225 — the SMALLEST preset, and therefore the
     * case where a bar that is too tall does the most damage. */
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);

    await pip.locator(".pip-stage").hover();
    const bar = (await pip.locator(".pip-bar").boundingBox())!;
    const video = (await pip.locator("video").boundingBox())!;
    const ctx = `\n  bar: ${JSON.stringify(bar)}\n  video: ${JSON.stringify(video)}\n`;
    console.log(`  bar box: ${JSON.stringify(bar)}  video box: ${JSON.stringify(video)}`);

    // Full width, flush to the bottom edge of the window.
    expect(Math.round(bar.width), ctx).toBe(WANT[0]);
    expect(Math.round(bar.x), ctx).toBe(0);
    expect(Math.round(bar.y + bar.height), ctx).toBe(WANT[1]);
    // Leaves the great majority of the frame to the video. A quarter of the
    // smallest window is already generous for one row of buttons.
    expect(bar.height, ctx).toBeLessThan(WANT[1] * 0.25);
    expect(bar.height, ctx).toBeGreaterThan(20);
    // NOWHERE NEAR THE TOP. The OS title bar is 34px of chrome above this
    // document; a bar pinned to the top would sit directly under it and read as
    // a second title bar.
    expect(bar.y, ctx).toBeGreaterThan(WANT[1] / 2);
    // The video still fills the window behind it — the bar is an overlay, not a
    // sibling that stole height.
    expect([Math.round(video.width), Math.round(video.height)], ctx).toEqual(WANT);
  });

  test("the buttons ACT on the video — pause and speed (seek: see comment)", async ({ page, context }) => {
    // The unit tests prove the handlers call the right methods on a fake. This
    // proves the wiring survives a real cross-document move: the element the
    // buttons hold is the element now living in the other window.
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);
    await pip.locator(".pip-stage").hover();

    const before = await videoState(page);
    console.log(`  before: ${JSON.stringify(before)}`);
    expect(before.paused, "the fixture's video should be playing before we pause it").toBe(false);

    await pip.locator('[data-pip="play"]').click();
    await expect
      .poll(async () => (await videoState(page)).paused, { timeout: 3000 })
      .toBe(true);

    /* NO SEEK ASSERTION HERE, DELIBERATELY — and this is not a gap.
     *
     * The fixture's video is a canvas captureStream, which is a LIVE stream: it
     * has no seekable range, so assigning currentTime is silently discarded and
     * `+10s` moves nothing. Measured — this assertion was written, run, and
     * failed on exactly that (`Timeout 3000ms exceeded while waiting on the
     * predicate`, currentTime unchanged).
     *
     * The honest options were (a) build a fixture serving a real seekable file
     * so the browser layer could check it, or (b) assert it where it is already
     * provable. (b) wins: test/pip/enhance-controls.test.ts drives currentTime
     * against a stubbed element and pins BOTH the ±10 arithmetic and the clamp
     * at zero — which a video file would not test any better. What THIS layer
     * uniquely proves is that the buttons reach the element after it crossed
     * into another document, and pause + speed below establish that on any
     * stream.
     *
     * What is NOT covered anywhere automated: that a real seek lands correctly
     * on a real seekable video. That is a manual-checkpoint row (Task 20).
     * Loosening this to `toBeGreaterThanOrEqual(at)` would have gone green
     * against a control that does nothing, which is worse than saying so. */

    /* SPEED: the same live-stream limit as the seek above, and the assertion is
     * shaped to the property that IS provable here.
     *
     * A MediaStream-backed video ignores playbackRate exactly as it ignores
     * currentTime — there is no timeline to re-rate. Measured: after clicking
     * speed, playbackRate reads back 1, not 1.25. The handler is not at fault;
     * test/pip/enhance-controls.test.ts drives the full 1 → 1.25 → 1.5 → 2 →
     * 0.5 → 1 cycle against a real element and pins it, including the
     * off-list-rate case (a site that set 1.75) that plain indexOf would have
     * sent back to the start.
     *
     * What THIS layer can prove, and what would actually hurt a user if it
     * broke: THE READOUT NEVER LIES. The label is rendered from the video's own
     * playbackRate after the assignment, not from the click count — so on a
     * source that refuses the change it says "1×" and stays honest, rather than
     * showing "1.25×" over a video still playing at 1. That is the assertion
     * below, and it holds on any source. */
    await pip.locator('[data-pip="speed"]').click();
    const rate = (await videoState(page)).playbackRate;
    console.log(`  playbackRate after speed click: ${rate} (a live stream refuses the change)`);
    await expect(pip.locator('[data-pip="speed"]')).toHaveText(`${rate}×`);

    // And the label flipped, which is the accessible name of the ACTION the
    // button would now perform.
    await expect(pip.locator('[data-pip="play"]')).toHaveAttribute("aria-label", "Play");
  });

  test("the time readout says something sensible, not NaN", async ({ page, context }) => {
    // captureStream() reports duration === Infinity, exactly like a real live
    // stream. The visible symptom of getting this wrong is "NaN:NaN" sitting in
    // the corner of the user's window.
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);

    const text = (await pip.locator(".pip-time").textContent())!;
    console.log(`  time readout: ${JSON.stringify(text)}`);
    expect(text).not.toMatch(/NaN/);
    expect(text).toMatch(/^\d+:\d\d \/ (live|\d+:\d\d)$/);
  });

  test("subtitles: the track the page never enabled comes up showing", async ({ page }) => {
    // The fixture's <track> is explicitly `default = false`, so "showing" here
    // can only have come from enhanceWindow. The cue styling itself is a UA
    // decision we can only influence through video::cue, whose presence in the
    // adopted sheet the unit tests pin.
    await open(page);
    await openAndEnhance(page);

    const state = await videoState(page);
    console.log(`  track state: ${JSON.stringify(state)}`);
    expect(state.trackCount).toBe(1);
    expect(state.trackKind).toBe("subtitles");
    expect(state.trackMode).toBe("showing");
  });

  test("LOOK AT IT — a frame with the bar revealed, captured for a human", async ({
    page,
    context,
  }) => {
    /* The screenshot is NOT compared to a baseline — see SCREENS above. It is
     * evidence a person reads. What is ASSERTED here is the state the capture
     * was taken in, so the image cannot quietly be a picture of the bar at
     * opacity 0: the bar is revealed by hover first and its opacity is checked
     * immediately before the shutter. */
    await open(page);
    await openAndEnhance(page);
    const pip = pipPage(context, page);

    await pip.locator(".pip-stage").hover();
    await expect(pip.locator(".pip-bar")).toHaveCSS("opacity", "1");

    mkdirSync(SCREENS, { recursive: true });
    const file = join(SCREENS, "dpip-controls.png");
    await pip.screenshot({ path: file });
    console.log(`  captured ${file}`);

    // And the same window with a focus ring instead of a hover, because that is
    // the state the keyboard user sees and it is the one most likely to regress.
    await pip.locator('[data-pip="play"]').focus();
    await expect(pip.locator(".pip-bar")).toHaveCSS("opacity", "1");
    const focused = join(SCREENS, "dpip-controls-focus.png");
    await pip.screenshot({ path: focused });
    console.log(`  captured ${focused}`);
  });

  test("subtitle cues are lifted clear of the control bar", async ({ page, context }) => {
    /* FOUND BY LOOKING AT THE SCREENSHOT ABOVE, not by any assertion.
     *
     * Cues render at the bottom of the video box by default — the exact strip
     * the bar occupies — so with both Pro switches on, the cue text and the
     * buttons drew on top of each other and neither was readable. Every
     * computed-style assertion in this file passed throughout: each element was
     * individually correct, and only their OVERLAP was wrong. No toHaveCSS can
     * see that.
     *
     * The cue box itself is not reachable from script (Chrome renders it in an
     * internal container, so there is no selector to measure), which is why
     * this asserts the mechanism rather than the geometry, and why the
     * screenshot above stays part of the evidence rather than being replaced
     * by this test. */
    await open(page);
    await openAndEnhance(page);

    /* WAIT FOR THE CUES TO EXIST BEFORE READING THEM.
     *
     * TextTrack cues populate asynchronously — the track's VTT has to parse
     * before `track.cues` is non-empty, and `mode: "showing"` is set by
     * enhanceWindow immediately, so it is true well before the cues are there.
     * Reading once, as this test originally did, was a race: it failed two of
     * four full runs with `cues.length` 0 while passing in isolation every
     * time, because running alone gave the parse enough slack.
     *
     * Waiting on the cues themselves — not a timeout, not a settle — is what
     * makes the assertions below measure the LIFT rather than the parse. */
    await page.waitForFunction(
      () => {
        const track = window.__pipWin?.document.querySelector("video")?.textTracks[0];
        return !!track && !!track.cues && track.cues.length > 0;
      },
      undefined,
      { timeout: 5000 }
    );

    const cues = await page.evaluate(() => {
      const t = window.__pipWin!.document.querySelector("video")!.textTracks[0];
      const out: { line: number | "auto"; snap: boolean; text: string }[] = [];
      if (t?.cues) {
        for (let i = 0; i < t.cues.length; i++) {
          const c = t.cues[i] as VTTCue;
          out.push({ line: c.line, snap: c.snapToLines, text: c.text });
        }
      }
      return { mode: t?.mode, cues: out };
    });
    console.log(`  cue state: ${JSON.stringify(cues)}`);

    expect(cues.mode, "enhanceWindow must have turned the track on").toBe("showing");
    expect(cues.cues.length, "the fixture ships exactly one long cue").toBe(1);
    // -3 counts line boxes up from the bottom, clearing the ~37px bar at the
    // 14px ::cue size. If this reverts to "auto", the cue lands back on the
    // buttons — fix the lift, never this number's expectation.
    expect(cues.cues[0].line).toBe(-3);
    expect(cues.cues[0].snap).toBe(true);
  });

  test("with the bar OFF, cues keep their default bottom position", async ({ page, context }) => {
    // The lift is conditional on purpose. With no bar there is nothing to clear,
    // and moving cues anyway would put them somewhere no other player puts them.
    await open(page);
    await page.click("#open");
    await page.waitForFunction(() => window.__lastSettled === true);
    await page.evaluate(() => {
      window.__pipControls = window.__enhanceWindow!({
        opts: { inWindowControls: false, subtitles: true },
      });
    });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const t = window.__pipWin!.document.querySelector("video")!.textTracks[0];
          return t?.cues?.length ?? 0;
        })
      )
      .toBe(1);

    const line = await page.evaluate(() => {
      const t = window.__pipWin!.document.querySelector("video")!.textTracks[0];
      return (t.cues![0] as VTTCue).line;
    });
    expect(line, "no bar means no lift").toBe("auto");
  });
});
