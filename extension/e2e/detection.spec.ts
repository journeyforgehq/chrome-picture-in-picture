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
}

/** Later tasks append to this array. */
export const CASES: DetectionCase[] = [{ id: "a01-plain", winner: "only" }];

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
  });
}
