import { test, expect } from "@playwright/test";
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
];

const ORIGINS = { a: "http://localhost:3000", b: "http://127.0.0.1:3001" } as const;

let servers: { close(): Promise<void> };

test.beforeAll(() => {
  servers = startServers();
});

test.afterAll(async () => {
  await servers.close();
});

for (const c of CASES) {
  test(`detection: ${c.id}`, async ({ page }) => {
    await page.goto(`${ORIGINS[c.origin ?? "a"]}/${c.id}.html`);

    // Wait on the fixture's own readiness flag, never a fixed timeout: the
    // harness sets it only once every video it built has actually reached the
    // state the fixture declared. A slow machine must not be able to turn a
    // real result into a false one.
    await page.waitForFunction(
      () => document.documentElement.dataset.fixtureReady === "true"
    );

    const result = await page.evaluate(pipEntry, { dryRun: true });

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
