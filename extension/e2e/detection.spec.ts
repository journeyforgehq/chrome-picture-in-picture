import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServers } from "./serve";
import { pipEntry } from "../src/pip/entry";

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

    const result = await page.evaluate(pipEntry, { dryRun: true });

    // Recorded BEFORE the assertions below: when a winner assertion fails, the
    // score vector is the evidence for WHY, and it must survive into the
    // golden diff rather than vanish with the throw.
    collected[c.id] = result.candidates.map((k) => ({ label: k.label, score: Math.round(k.score) }));

    // The conditions under which we measured, carried INTO the failure
    // message so a red run says whether the fixture or the code under test was
    // wrong. It goes in the expect() message rather than testInfo.attach()
    // because attachments passed as `body` are never rendered by the `list`
    // reporter this suite runs under — a diagnostic nobody can see is not a
    // diagnostic.
    const state = await page.evaluate(() => document.documentElement.dataset.fixtureState ?? "[]");
    const context =
      `\n  fixture state: ${state}` + `\n  pipEntry result: ${JSON.stringify(result)}\n`;

    expect(result.winner?.label ?? null, context).toBe(c.winner);
    if (c.reason) expect(result.reason, context).toBe(c.reason);

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
