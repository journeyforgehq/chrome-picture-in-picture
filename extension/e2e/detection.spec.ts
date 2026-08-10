import { test, expect, type Frame } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServers } from "./serve";
import { pipEntry, type PipEntryResult } from "../src/pip/entry";

/* ============================================================================
 * Detection fixtures — which <video> wins, on a real page, in a real browser.
 * ============================================================================
 *
 * Detection is PURE DOM LOGIC: given a page, which video wins? No user
 * gesture, no floating window, no browser chrome is involved, because every
 * case runs pipEntry with { dryRun: true } — it scores and reports without
 * calling requestPictureInPicture(). That is the whole reason this layer
 * exists: it buys fast, flake-free browser coverage instead of slow,
 * gesture-blocked coverage.
 *
 * page.evaluate serializes the function exactly the way
 * chrome.scripting.executeScript does, so every fixture also re-exercises
 * pipEntry's self-containment (rule 1 in entry.ts's header). If this ever
 * throws ReferenceError, that is a real defect in entry.ts — report it, do
 * not work around it here.
 * ==========================================================================*/

interface DetectionCase {
  /** Fixture file basename, minus .html. */
  id: string;
  /** Expected winner's data-label, or null when nothing should win. */
  winner: string | null;
  /** Expected PipEntryResult.reason, when the case is about the reason. */
  reason?: string;
  /** Which origin to serve from. "b" = 127.0.0.1:3001, cross-origin to "a". */
  origin?: "a" | "b";
  /**
   * Ceiling, in ms, on how long pipEntry may take on this page. Set only on the
   * fixtures whose SHAPE is the risk — a01 with one video would pass any budget
   * and would only be measuring Chromium's mood.
   */
  maxRuntimeMs?: number;
  /**
   * Second assertion for fixtures that RE-LAY-OUT on scroll. Scrolls to `y`,
   * waits until the video has actually landed under `underSelector` (the page's
   * own scroll handler does the move, and asserting before it ran would measure
   * the first state twice), then re-runs pipEntry and expects `winner` again.
   *
   * Deliberately does NOT feed the golden matrix: the recorded score vector
   * stays the pre-scroll one, so the golden keeps meaning "one row per fixture"
   * rather than silently becoming "one row per fixture, except this one".
   */
  scrollRecheck?: { y: number; underSelector: string; winner: string };
  /**
   * The player lives in a cross-origin SUBFRAME. pipEntry on the top document
   * finds nothing there, so for these cases the runner waits on the CHILD
   * frame's readiness flag and evaluates pipEntry inside the child.
   *
   * Two runs, because one run cannot say both things:
   *
   *   1. AS INJECTED, with no content script to arbitrate, the subframe stands
   *      down before it collects a single video. The runner asserts that shape
   *      rather than assuming it — it is the frame-arbitration design working,
   *      and it is WHY embedded players need site access.
   *   2. WITH window.__pipCoord = { isWinner: true } — the flag a real install's
   *      content script sets — the same frame scores its videos and picks one.
   *      `winner` on these cases is that label.
   *
   * Run 2 is what feeds the golden. Run 1's vector is always [] (it returns
   * before scoring), and recording that would make these two rows read exactly
   * like "every video was filtered out", which is the opposite of what happened.
   */
  inFrame?: boolean;
}

/** Later tasks append to this array. */
export const CASES: DetectionCase[] = [
  { id: "a01-plain", winner: "only" },
  { id: "a02-shadow-1", winner: "in-shadow" },
  { id: "a03-shadow-2", winner: "deep" },
  { id: "a04-closed-shadow", winner: null, reason: "none-found" },
  { id: "a05-late-inject", winner: "late" },
  { id: "a06-dialog", winner: "in-dialog" },
  { id: "a07-content-visibility", winner: "offscreen" },
  // 25 videos is where a naive querySelectorAll('*') shadow walk starts to
  // cost real time. The budget is here so a future O(n^2) traversal shows up
  // as a red test rather than as a slow extension nobody profiled.
  { id: "a08-feed-25", winner: "playing-one", maxRuntimeMs: 50 },
  { id: "a09-reparented", winner: "moved" },

  // --- Group B: scoring. Which video wins when several are eligible. --------
  // Group A asks "is the video found at all". Group B asks the question the
  // product is actually judged on: given several findable videos, does the
  // right one win. Every "it popped out the wrong video" complaint is a
  // scoring failure, not a PiP failure, so each of these pins one decision the
  // formula in entry.ts makes.
  { id: "b01-two-playing", winner: "larger" },
  { id: "b02-small-playing-vs-large-paused", winner: "small-playing" },
  { id: "b03-ad-vs-content", winner: "content" },
  { id: "b04-playing-offscreen-vs-paused-onscreen", winner: "playing-offscreen" },
  { id: "b05-identical-tie", winner: "first" },
  { id: "b06-live-infinity", winner: "live" },
  { id: "b07-duration-nan", winner: null, reason: "not-ready" },
  { id: "b08-hero-loop-only", winner: null, reason: "none-found" },
  { id: "b09-hero-plus-content", winner: "content" },
  { id: "b10-unmuted-paused-vs-muted-playing", winner: "muted-playing" },
  { id: "b11-exactly-100", winner: "at-boundary" },
  { id: "b12-99px", winner: null, reason: "none-found" },
  // R-14. b03's advert is 10s; this one is 30s — a length that is actually
  // SOLD. The penalty term used to read `duration < 30`, so a 30s pre-roll sat
  // exactly on the far side of it and collected nothing. MEASURED when this
  // fixture was written, before the threshold moved: **ad 1791, content 1500 —
  // the advert won by 291**. The threshold is now 65, which covers 15/30/60s
  // pre-rolls, and the same page reads ad 1391 / content 1500. Keep BOTH rows:
  // b03 pins the short case, b13 pins the boundary that was wrong, and any
  // future threshold change has to answer to both.
  { id: "b13-30s-ad-vs-content", winner: "content" },

  // --- Group C: visibility filters. What counts as "the user can see it". ---
  { id: "c01-display-none", winner: null, reason: "none-found" },
  { id: "c02-visibility-hidden", winner: null, reason: "none-found" },
  { id: "c03-opacity-005", winner: null, reason: "none-found" },
  { id: "c04-width-zero", winner: null, reason: "none-found" },
  { id: "c05-covered-by-overlay", winner: "covered" },
  {
    id: "c06-sticky-miniplayer",
    winner: "sticky",
    // Found inline AND found again after the page reparents it into the fixed
    // corner — the shape that broke every naive "cache the element on load"
    // implementation. Both states, one fixture.
    scrollRecheck: { y: 500, underSelector: "#corner video", winner: "sticky" },
  },
  { id: "c07-ancestor-display-none", winner: null, reason: "none-found" },

  // --- Group D: site-imposed blocks and error paths. ------------------------
  { id: "d01-disable-property", winner: null, reason: "pip-disabled-by-site" },
  { id: "d02-disable-attr-late", winner: null, reason: "pip-disabled-by-site" },
  // EXPECTATION CORRECTED BY MEASUREMENT. This case was specified as
  // winner:"blocked-by-policy" on the theory that Permissions-Policy gates only
  // requestPictureInPicture(). Chrome disagrees: the header also sets
  // document.pictureInPictureEnabled to false (verified false here, true on
  // a01-plain from the same server), and entry.ts's capability guard returns
  // before any video is collected. See the fixture for the full measurement.
  { id: "d03-permissions-policy", winner: null, reason: "pip-unavailable" },
  { id: "d04-empty", winner: null, reason: "none-found" },
  { id: "d05-no-src", winner: null, reason: "not-ready" },

  // --- Group E: the DOM SHAPES of the players that actually matter. ---------
  { id: "e01-youtube-shape", winner: "main" },
  { id: "e02-twitch-shape", winner: "stream" },
  { id: "e03-videojs-shape", winner: "tech" },
  { id: "e04-jwplayer-shape", winner: "jw" },
  { id: "e05-plyr-webcomponent", winner: "custom-el" },
  // The embed pair. `winner` is the label the SUBFRAME produces once elected —
  // see `inFrame` above for why that needs saying. E07 is E06 minus allow=, and
  // the two are expected to be identical: the Permissions Policy default
  // allowlist for picture-in-picture is *, so the attribute buys nothing. If
  // these rows ever diverge in the golden, that default changed under us.
  { id: "e06-vimeo-embed", winner: "embedded", inFrame: true },
  { id: "e07-generic-embed-no-allow", winner: "embedded", inFrame: true },
];

const ORIGINS = { a: "http://localhost:3000", b: "http://127.0.0.1:3001" } as const;

let servers: { close(): Promise<void> };

test.beforeAll(() => {
  servers = startServers();
});

test.afterAll(async () => {
  await servers.close();
});

/* ============================================================================
 * The golden score matrix.
 * ============================================================================
 *
 * Each case above asserts ONE thing: who won. That is what the product
 * promises, but it hides the margins. A weight change that moves a fixture
 * from winning by 400 points to winning by 4 breaks nothing and is invisible
 * — right up until a page with slightly different geometry flips it in
 * production.
 *
 * So the runner also snapshots the FULL score vector of every candidate on
 * every fixture into one file. Change `+200` for unmuted and the diff shows
 * every shape it moved at once: the difference between "I tweaked the muted
 * penalty and one test broke" and "I tweaked the muted penalty and it flipped
 * the winner on three shapes I wasn't thinking about."
 *
 * Scores are ROUNDED. The viewport-intersection term is a float, and an
 * unrounded golden would churn on sub-pixel layout noise until people stopped
 * reading the diffs.
 * ==========================================================================*/
type ScoreVector = { label: string; score: number }[];

const GOLDEN_PATH = join(dirname(fileURLToPath(import.meta.url)), "__golden__", "scores.json");
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === "1";

const GOLDEN_README = [
  "GOLDEN SCORE MATRIX — every candidate's score on every detection fixture.",
  "",
  "A CHANGED GOLDEN IS A DESIGN DECISION, NOT A SNAPSHOT REFRESH.",
  "Review the diff. Do NOT run UPDATE_GOLDEN=1 to make CI green.",
  "",
  "Each entry is the scored candidates for one fixture, in the order entry.ts",
  "ranked them, so entry[0] is the winner and the gap to entry[1] is the",
  "margin that decision was made by. An empty array means every video on that",
  "page was filtered out before scoring — see the fixture's expected reason.",
  "",
  "Scores come from the formula in src/pip/entry.ts and are rounded to whole",
  "points. A diff here means one of three things, in order of likelihood:",
  "  1. you changed a weight        — read every moved line, not just the red one",
  "  2. you changed the filters     — check for candidates appearing/disappearing",
  "  3. a fixture's layout changed  — the intersection term moved; verify why",
  "",
  "Regenerate deliberately with: UPDATE_GOLDEN=1 npm run e2e:fixtures",
];

/** Filled in by each test, before its assertions, so a failing winner still records. */
const collected: Record<string, ScoreVector> = {};

test.afterAll(() => {
  const recorded = Object.keys(collected).length;

  if (UPDATE_GOLDEN) {
    // Refuse to write a partial golden. A file regenerated from a run where
    // three fixtures crashed would silently DELETE those three rows, and the
    // next green run would then accept whatever they produce.
    if (recorded !== CASES.length) {
      throw new Error(
        `UPDATE_GOLDEN=1 refused: only ${recorded} of ${CASES.length} fixtures produced scores. ` +
          `Fix the failing fixtures first — a partial golden silently drops rows.`
      );
    }
    mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
    writeFileSync(
      GOLDEN_PATH,
      JSON.stringify({ __README__: GOLDEN_README, fixtures: collected }, null, 2) + "\n"
    );
    console.log(`\nGOLDEN WRITTEN: ${GOLDEN_PATH} (${recorded} fixtures). Read the diff.\n`);
    return;
  }

  if (recorded !== CASES.length) {
    // The run is already red for another reason; comparing an incomplete
    // matrix would only bury that failure under a second, derived one.
    console.log(
      `\nGolden comparison SKIPPED: only ${recorded} of ${CASES.length} fixtures produced ` +
        `scores. Fix the failures above, then re-run.\n`
    );
    return;
  }

  let golden: { fixtures?: Record<string, ScoreVector> };
  try {
    golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
  } catch {
    throw new Error(
      `Golden score matrix missing or unreadable at ${GOLDEN_PATH}. ` +
        `Generate it ONCE with UPDATE_GOLDEN=1 npm run e2e:fixtures, then read it before committing.`
    );
  }

  expect(
    collected,
    "\n  The score matrix moved. This is a DESIGN CHANGE, not a stale snapshot:\n" +
      "  read every moved line and decide whether the new numbers are the ones\n" +
      "  you want shipped. Do not run UPDATE_GOLDEN=1 to make this green.\n" +
      "\n  (This comes from afterAll, so Playwright reports it against the LAST\n" +
      "  test in the run. That test is not the one at fault — the diff is.)\n"
  ).toEqual(golden.fixtures);
});

for (const c of CASES) {
  test(`detection: ${c.id}`, async ({ page }) => {
    const url = `${ORIGINS[c.origin ?? "a"]}/${c.id}.html`;

    // A MISSING FIXTURE MUST NOT LOOK LIKE A HANG. serve.ts answers a missing
    // file with a bodiless 404, page.goto() resolves happily on it, and the
    // waitForFunction below then burns the full 30s timeout before reporting
    // "waiting for function" — which says nothing about the actual cause. One
    // HEAD request turns twelve unwritten fixtures from six minutes of silence
    // into twelve instant failures that name the URL, and turns a typo in a
    // case `id` into "not found" instead of a mystery.
    const head = await fetch(url, { method: "HEAD" });
    expect(head.status, `fixture not found: ${url}`).toBe(200);

    await page.goto(url);

    // Wait on the fixture's own readiness flag, never a fixed timeout: the
    // harness sets it only once every video it built has actually reached the
    // state the fixture declared. A slow machine must not be able to turn a
    // real result into a false one.
    await page.waitForFunction(
      () => document.documentElement.dataset.fixtureReady === "true"
    );

    // For an inFrame case the measurable document is the CHILD's, not this one.
    // window.load on the top document already awaited the iframe, so by the
    // time the flag above is set the frame object exists; its own readiness
    // flag is a separate wait because the child's videos load independently.
    let target: Frame = page.mainFrame();
    if (c.inFrame) {
      const child = page.frames().find((f) => f !== page.mainFrame());
      expect(child, `\n  ${c.id} is marked inFrame but the page has no subframe\n`).toBeTruthy();
      target = child as Frame;
      await target.waitForFunction(
        () => document.documentElement.dataset.fixtureReady === "true"
      );
    }

    const result = await target.evaluate(pipEntry, { dryRun: true });

    // The run whose score vector is worth recording. For a top-frame case that
    // is the run above. For a subframe it is the second, elected run below —
    // the first returns before scoring anything.
    let scoring = result;

    if (c.inFrame) {
      // Re-run in the SAME frame with the arbitration flag a real install's
      // content script sets. Rebuilt from source text via new Function for the
      // same reason the runtime budget below does it: `pipEntry` the module
      // export does not exist inside the page, and this is exactly the shape
      // chrome.scripting.executeScript ships.
      scoring = (await target.evaluate(
        ({ src }) => {
          const fn = new Function("return (" + src + ")")() as (o: unknown) => unknown;
          const w = window as unknown as Record<string, unknown>;
          w.__pipCoord = { isWinner: true };
          try {
            return fn({ dryRun: true });
          } finally {
            delete w.__pipCoord;
          }
        },
        { src: pipEntry.toString() }
      )) as PipEntryResult;
    }

    // Recorded BEFORE the assertions below: when a winner assertion fails, the
    // score vector is the evidence for WHY, and it must survive into the
    // golden diff rather than vanish with the throw.
    collected[c.id] = scoring.candidates.map((k) => ({
      label: k.label,
      score: Math.round(k.score),
    }));

    // The conditions under which we measured, carried INTO the failure
    // message so a red run says whether the fixture or the code under test was
    // wrong. It goes in the expect() message rather than testInfo.attach()
    // because attachments passed as `body` are never rendered by the `list`
    // reporter this suite runs under — a diagnostic nobody can see is not a
    // diagnostic.
    const state = await target.evaluate(
      () => document.documentElement.dataset.fixtureState ?? "[]"
    );
    const context =
      `\n  fixture state: ${state}` +
      `\n  pipEntry result: ${JSON.stringify(result)}` +
      (c.inFrame ? `\n  pipEntry result (elected): ${JSON.stringify(scoring)}` : "") +
      `\n`;

    if (c.inFrame) {
      // THE STAND-DOWN, ASSERTED RATHER THAN ASSUMED. A subframe with no
      // __pipCoord is not the top frame, so entry.ts returns at the
      // arbitration gate — before the capability check, before it collects a
      // single video. winner and candidates are therefore empty here NOT
      // because nothing was findable but because nothing was looked for.
      expect(result.frame, context).toBe("SUBFRAME");
      expect(result.acted, context).toBe(false);
      expect(result.reason, context).toBe("not-winner");
      expect(result.winner, context).toBeNull();
      expect(result.candidates, context).toEqual([]);
    }

    expect(scoring.winner?.label ?? null, context).toBe(c.winner);
    if (c.reason) expect(scoring.reason, context).toBe(c.reason);

    if (c.scrollRecheck) {
      const { y, underSelector, winner } = c.scrollRecheck;
      await page.evaluate((to) => window.scrollTo(0, to), y);
      // Wait for the PAGE to have moved the element, not for a guessed delay:
      // the reparent happens in the fixture's own scroll listener, and
      // re-running pipEntry before it fired would just measure state one again
      // and call it a pass.
      await page.waitForFunction((sel) => !!document.querySelector(sel), underSelector);

      const after = await page.evaluate(pipEntry, { dryRun: true });
      expect(
        after.winner?.label ?? null,
        `\n  after scrollTo(0, ${y}) — expected the reparented player to still win` +
          `\n  pipEntry result: ${JSON.stringify(after)}\n`
      ).toBe(winner);
    }

    if (c.maxRuntimeMs !== undefined) {
      // Timed IN-PAGE, from pipEntry's own source text, so the number is the
      // function's cost and not the round-trip cost of Playwright's CDP call —
      // which is tens of ms on its own and would swamp the thing being
      // measured. Rebuilding from toString() is also exactly what
      // chrome.scripting.executeScript does in production.
      //
      // Median of 5 rather than a single shot: one cold run measures JIT
      // warm-up, and a single hot run under-reports. A quadratic traversal
      // moves the median; scheduler noise does not.
      const samples = await page.evaluate(
        ({ src, runs }) => {
          const fn = new Function("return (" + src + ")")() as (o: unknown) => unknown;
          const out: number[] = [];
          for (let i = 0; i < runs; i++) {
            const t0 = performance.now();
            fn({ dryRun: true });
            out.push(performance.now() - t0);
          }
          return out;
        },
        { src: pipEntry.toString(), runs: 5 }
      );
      const median = [...samples].sort((x, y) => x - y)[Math.floor(samples.length / 2)];
      expect(
        median,
        `${context}  pipEntry runtime samples (ms): ${samples.map((s) => s.toFixed(2)).join(", ")}\n`
      ).toBeLessThan(c.maxRuntimeMs);
    }
  });
}
