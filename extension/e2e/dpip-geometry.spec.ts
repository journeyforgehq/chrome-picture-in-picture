import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { startServers } from "./serve";
import { pipEntry, type PipEntryResult } from "../src/pip/entry";
import { enhanceWindow } from "../src/pip/enhance";
import { SIZE_PRESETS } from "../src/pip/geometry";

/* ============================================================================
 * GROUP G, ROWS G04, G09 AND G10 — what size the enhanced window opens at.
 * ============================================================================
 *
 * The full Group G coverage table, including the three rows CI cannot prove,
 * lives in ONE place: the header of e2e/dpip-window.spec.ts, mirrored into
 * e2e/README.md.
 *
 *   G04  a stored size larger than any screen => clamped sanely; no crash, no
 *                                                zero-size window
 *   G09  re-open on the SAME origin           => the remembered size, not the
 *                                                preset default
 *   G10  re-open on a DIFFERENT origin        => THAT origin's size, not the
 *                                                previous one's
 *
 * "Remembers the size, for each site" is the Pro tier's second selling line
 * after the window itself, and until this file existed it was proved only
 * against fakes: test/pip/entry-dpip.test.ts drives the size resolution with a
 * stub window, test/pip/geometry.test.ts pins normalizeSize/sizeForOrigin, and
 * test/background/registration-wiring.test.ts pins the worker's storage write.
 * Every one of those measures arithmetic. None of them opens a window, so none
 * of them can tell you that the number pipEntry computed is the number the user
 * ends up looking at.
 *
 * TWO INSTRUMENTS, BOTH NEEDED:
 *
 *   window.__requested — the argument that actually reached requestWindow,
 *     captured by a delegating recorder the fixture installs. This is the only
 *     way to tell "pipEntry clamped 99999 to 1920" apart from "pipEntry
 *     forwarded 99999 and the window manager was merciful". G04 is about the
 *     clamp, not about the mercy.
 *   window.__pipWin's inner box — the window the user actually got, after
 *     pipEntry's one corrective resizeBy. POLLED, never read once: the window
 *     manager applies a resize out of band and a synchronous read still reports
 *     the old size.
 *
 * G10 IS WHY e2e/serve.ts BINDS TWO PORTS. localhost:3000 and 127.0.0.1:3001
 * are genuinely different origins to the browser even though both are this
 * machine, so `location.origin` — the key the whole feature is stored under —
 * really does differ between the two loads below. Nothing is faked.
 *
 * THE HONEST SEAM IN G09. A real re-open would read the size back out of
 * chrome.storage.local, written by the worker's PIP_GEOMETRY_CHANGED handler.
 * These fixture pages have no extension context, so the test carries the size
 * the page REPORTED into the next load's prefs itself. What that leaves
 * unproven is the worker's read-modify-write, which is pinned against the
 * shipped bundle in test/background/registration-wiring.test.ts ("stores the
 * size per origin", "keeps two origins apart", "clamps a hostile payload"). The
 * seam is one storage round trip wide and it is covered on both sides; it is
 * named here so a green run is not read as covering it.
 * ==========================================================================*/

/* viewport: null AND channel: "chromium", for the two reasons
 * e2e/dpip-window.spec.ts documents at length: Playwright's default 1280x720
 * viewport is applied with CDP Emulation.setDeviceMetricsOverride and the PiP
 * window INHERITS it, and the OLD headless shell has no window manager, so it
 * discards requestWindow's size (reporting 800x600) and no-ops resizeBy. This
 * is the file where every assertion is a size, so losing either declaration
 * would leave the whole thing measuring an artifact. */
test.use({ viewport: null, channel: "chromium" });

declare global {
  interface Window {
    /** g04-geometry.html: the argument the recorder saw reach requestWindow. */
    __requested?: { width?: number; height?: number } | null;
    /** g04-geometry.html: the window's content box BEFORE pipEntry's corrective
     *  resizeBy — the raw number requestWindow handed back. */
    __rawInner?: [number, number] | null;
    /** g04-geometry.html: the prefs it built out of the query string. */
    __prefsUsed?: { size: string; remember: boolean; geometry: unknown; origin: string };
    /** g04-geometry.html: a setup step that failed, rather than a silent skew. */
    __fixtureError?: string;
  }
}

const ORIGIN_A = "http://localhost:3000";
const ORIGIN_B = "http://127.0.0.1:3001";
const PAGE = "/g04-geometry.html";

type Size = { w: number; h: number };

/** The fixture reads its prefs from the query string so a SECOND load in the
 *  same test can be given different ones — which is the whole shape of G09 and
 *  G10. addInitScript cannot do that: it is bound to the context. */
function url(origin: string, opts: { geometry?: Record<string, Size>; size?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.size) params.set("size", opts.size);
  if (opts.geometry) params.set("geometry", JSON.stringify(opts.geometry));
  const query = params.toString();
  return origin + PAGE + (query ? "?" + query : "");
}

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

async function open(page: Page, target: string): Promise<void> {
  await page.goto(target);
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "true");
  const failure = await page.evaluate(() => window.__fixtureError);
  // A geometry param that failed to parse would leave the fixture measuring the
  // PRESET while the test believed it was measuring memory.
  expect(failure, `the fixture reported a setup failure: ${failure}`).toBeUndefined();
}

/** Open the enhanced window under a real gesture and return what pipEntry saw. */
async function openWindow(page: Page): Promise<PipEntryResult & { harnessError?: string }> {
  await page.click("#open");
  await page.waitForFunction(() => window.__lastSettled === true);
  const result = (await page.evaluate(() => window.__lastResult))!;
  const state = await page.evaluate(() => document.documentElement.dataset.fixtureState ?? "[]");
  const ctx = `\n  __lastResult: ${JSON.stringify(result)}\n  fixture state: ${state}\n`;
  expect(result?.harnessError, ctx).toBeUndefined();
  // THE PRECONDITION. A silent fall back to the native window would leave every
  // size assertion below measuring an absent window.
  expect(result?.mode, ctx).toBe("document");
  expect(result?.outcome, ctx).toBe("PIP_OK");
  return result;
}

/** What was asked for, and what arrived. */
async function sizes(page: Page) {
  return await page.evaluate(() => {
    const w = window.__pipWin;
    return {
      requested: window.__requested ?? null,
      rawInner: window.__rawInner ?? null,
      inner: w ? ([w.innerWidth, w.innerHeight] as [number, number]) : null,
      outer: w ? ([w.outerWidth, w.outerHeight] as [number, number]) : null,
      screen: [window.screen.width, window.screen.height] as [number, number],
    };
  });
}

/** POLLED. pipEntry corrects the content box with one resizeBy, and the window
 *  manager applies it out of band — a single read after the open still reports
 *  the pre-correction size on the builds where the deficit is non-zero. */
async function expectInner(page: Page, want: [number, number], why: string): Promise<void> {
  await expect
    .poll(async () => (await sizes(page)).inner, { timeout: 5000, message: why })
    .toEqual(want);
}

function pipPage(context: BrowserContext, opener: Page): Page {
  const others = context.pages().filter((p) => p !== opener);
  expect(others.length, "the Document PiP window did not appear as a second page").toBe(1);
  return others[0];
}

/** Close the enhanced window and wait for the target to actually go away, so a
 *  second open in the same test cannot be measured against the first window. */
async function closePip(page: Page, context: BrowserContext): Promise<void> {
  await page.evaluate(() => window.__pipWin?.close());
  await expect
    .poll(() => context.pages().filter((p) => p !== page).length, { timeout: 5000 })
    .toBe(0);
}

test.describe("the enhanced window's size @dpip", () => {
  test("THE INSTRUMENT'S OWN PRECONDITION — the opener is not under the default emulated viewport", async ({
    page,
  }) => {
    // If `viewport: null` is lost from this file, the PiP window inherits a
    // 1280x720 device-metrics override and every size below is measuring the
    // emulation. Restore viewport: null; never relax the numbers.
    await open(page, url(ORIGIN_A));
    const vp = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    console.log(`  opener viewport: ${vp[0]}x${vp[1]}`);
    expect(vp).not.toEqual([1280, 720]);
  });

  test("G03 — the S-12 correction: whatever deficit this build has, the window ends at the size ASKED FOR", async ({
    page,
  }) => {
    /* ======================================================================
     * WRITTEN BECAUSE A MUTATION TEST CAME BACK GREEN, WHICH IS THE ONLY
     * REASON A TEST LIKE THIS IS WORTH ADDING. Task 16 removed
     * `win.resizeBy(deficitW, deficitH)` from src/pip/entry.ts and re-ran
     * G03: dpip-window.spec.ts's three G03 tests ALL PASSED. Not because the
     * assertion is wrong — `inner === exactly 400x225` is precisely the row —
     * but because on the build this suite runs on, requestWindow already
     * returns the requested content box (deficit 0), so deleting the
     * correction changes nothing there is to observe. Only
     * test/pip/entry-dpip.test.ts caught it (3 failures), because it
     * SIMULATES the deficits S-12 measured on other builds.
     *
     * So this test measures the deficit instead of assuming one, and ARMS
     * ITSELF: on any build where requestWindow under-reports — which is what
     * S-12 measured on Chromium 131 (-52) and Chrome 151 (-56), and what a
     * future Chrome may do again — the second assertion becomes a live guard
     * on the correction. On a zero-deficit build it says so out loud in the
     * run log rather than leaving a green tick that implies more than it
     * proves.
     *
     * IT DOES NOT REPLACE THE UNIT TEST, and it must not be read as making
     * one unnecessary: a browser cannot be asked to produce a deficit on
     * demand, so entry-dpip.test.ts's simulated deficits stay the only
     * guard that fires on EVERY build.
     * ====================================================================*/
    await open(page, url(ORIGIN_A));
    await openWindow(page);
    const preset = SIZE_PRESETS.medium;
    await expectInner(page, [preset.w, preset.h], "the window did not end at the requested size");

    const measured = await sizes(page);
    const raw = measured.rawInner!;
    const deficit = [preset.w - raw[0], preset.h - raw[1]];
    console.log(
      `  G03 S-12 deficit on this build: ${JSON.stringify(deficit)} ` +
        `(requestWindow returned ${JSON.stringify(raw)} for ${JSON.stringify([preset.w, preset.h])})`
    );

    // The fixture's recorder actually ran, or `deficit` above is arithmetic on
    // nothing and the branch below would be skipped for the wrong reason.
    expect(measured.rawInner, "the pre-correction size was never recorded").not.toBeNull();

    if (deficit[0] !== 0 || deficit[1] !== 0) {
      // THIS BUILD HAS A DEFICIT, so the correction is observable — and a
      // regression that removed it lands here.
      expect(
        measured.inner,
        `\n  requestWindow returned ${JSON.stringify(raw)} and the window ended at ` +
          `${JSON.stringify(measured.inner)}.\n  On a build with a deficit, that means pipEntry's ` +
          "corrective resizeBy did not run.\n"
      ).not.toEqual(raw);
    } else {
      console.log(
        "  G03: this build returns the requested content box exactly, so the " +
          "corrective resizeBy is a NO-OP here and this layer cannot see it. " +
          "test/pip/entry-dpip.test.ts is what guards the correction."
      );
    }
  });

  test("G04 — a stored size larger than any screen is CLAMPED before it reaches requestWindow", async ({
    page,
  }) => {
    /* A stored record is untrusted input: it survives browser upgrades, a
     * change of monitor, and hand-editing. 99999x99999 is what a corrupt one
     * looks like, and the row's demand is "clamped sanely; no crash, no
     * zero-size window".
     *
     * THE CLAMP IS ASSERTED EXACTLY; THE RESULTING WINDOW IS NOT. 1920x1080 is
     * OUR ceiling and it is deterministic. What the window manager then grants
     * for a request that may still exceed the display is ITS business and it
     * varies by machine — pinning it would pin this laptop's screen as the
     * product's contract. So the window is asserted to exist, to be non-zero,
     * and to fit on the screen, and its actual size is logged. */
    await open(page, url(ORIGIN_A, { geometry: { [ORIGIN_A]: { w: 99999, h: 99999 } } }));
    const result = await openWindow(page);
    const measured = await sizes(page);
    const ctx = `\n  result: ${JSON.stringify(result)}\n  sizes: ${JSON.stringify(measured)}\n`;
    console.log(`  G04 oversize: ${JSON.stringify(measured)}`);

    // THE ASSERTION THIS TEST EXISTS FOR: the clamp ran, and 99999 never
    // reached the API.
    expect(measured.requested, ctx).toEqual({ width: 1920, height: 1080 });

    // No crash: a window opened and it is a real one.
    expect(measured.inner, ctx).not.toBeNull();
    expect(measured.inner![0], ctx).toBeGreaterThan(0);
    expect(measured.inner![1], ctx).toBeGreaterThan(0);
    expect(measured.inner![0], ctx).toBeLessThanOrEqual(measured.screen[0]);
    expect(measured.inner![1], ctx).toBeLessThanOrEqual(measured.screen[1]);
  });

  test("G04 — a zero-size stored record cannot produce a zero-size window", async ({ page }) => {
    // The other half of the same row, and the more dangerous half: 0x0 is what
    // a truncated or half-written record looks like, and a window with no
    // content box is indistinguishable to the user from the feature being
    // broken. The floor is 240x135.
    await open(page, url(ORIGIN_A, { geometry: { [ORIGIN_A]: { w: 0, h: 0 } } }));
    const result = await openWindow(page);
    const measured = await sizes(page);
    const ctx = `\n  result: ${JSON.stringify(result)}\n  sizes: ${JSON.stringify(measured)}\n`;
    console.log(`  G04 zero-size: ${JSON.stringify(measured)}`);

    expect(measured.requested, ctx).toEqual({ width: 240, height: 135 });
    expect(measured.inner![0], ctx).toBeGreaterThan(0);
    expect(measured.inner![1], ctx).toBeGreaterThan(0);
  });

  test("G09 — a resize is remembered: the next open on the SAME origin uses it, not the preset", async ({
    page,
    context,
  }) => {
    /* THE WHOLE LOOP, in one test, because the value being carried is the point:
     * open at the preset -> resize -> the page reports a size -> re-open with
     * THAT size in this origin's prefs -> the window comes back at it.
     *
     * The one seam is the storage round trip in the middle, which no page
     * without an extension context can make; see the header. Everything either
     * side of it is real. */
    await open(page, url(ORIGIN_A));
    await openWindow(page);
    const preset = SIZE_PRESETS.medium;
    await expectInner(
      page,
      [preset.w, preset.h],
      "the first open did not land on the medium preset, so there is no " +
        "default for the remembered size to differ FROM"
    );
    expect((await sizes(page)).requested).toEqual({ width: preset.w, height: preset.h });

    // The resize listener lives in enhanceWindow, so the window has to be
    // decorated the way the worker's second injection decorates it.
    await page.evaluate(() => {
      window.__pipApi = window.__enhanceWindow!({
        opts: { inWindowControls: true, subtitles: false },
      });
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
    });

    // A click inside the PiP window first: Document PiP requires user
    // activation for resizeBy, and pipEntry spent the opening one on its
    // corrective call.
    const pip = pipPage(context, page);
    await pip.locator(".pip-stage").click({ position: { x: 5, y: 5 } });
    const resized = await pip.evaluate(() => {
      try {
        window.resizeBy(80, 40);
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
    expect(resized.ok, `resizeBy threw inside the PiP window: ${resized.error}`).toBe(true);

    // The debounce is 500ms; poll rather than sleep.
    await expect
      .poll(
        async () =>
          ((await page.evaluate(() => window.__pipMessages)) ?? []).filter(
            (m) => m.type === "PIP_GEOMETRY_CHANGED"
          ).length,
        { timeout: 5000 }
      )
      .toBe(1);
    const reported = ((await page.evaluate(() => window.__pipMessages)) ?? []).find(
      (m) => m.type === "PIP_GEOMETRY_CHANGED"
    )!;
    console.log(`  G09 reported: ${JSON.stringify(reported)}`);
    expect(reported.origin, "the size is stored against the ORIGIN").toBe(ORIGIN_A);
    const remembered: Size = { w: reported.w!, h: reported.h! };
    // The value has to actually differ from the preset, or the re-open below
    // would pass without proving anything about memory.
    expect([remembered.w, remembered.h]).not.toEqual([preset.w, preset.h]);

    await closePip(page, context);

    // --- THE RE-OPEN -----------------------------------------------------
    await open(page, url(ORIGIN_A, { geometry: { [ORIGIN_A]: remembered } }));
    await openWindow(page);
    const second = await sizes(page);
    const ctx = `\n  remembered: ${JSON.stringify(remembered)}\n  second open: ${JSON.stringify(second)}\n`;
    console.log(`  G09 re-open: ${JSON.stringify(second)}`);

    expect(second.requested, ctx).toEqual({ width: remembered.w, height: remembered.h });
    await expectInner(page, [remembered.w, remembered.h], "the re-open ignored the remembered size");
    // Said the other way round, because this is the failure the row is about:
    // falling back to the preset would still open a perfectly good window.
    expect(second.inner, ctx).not.toEqual([preset.w, preset.h]);
  });

  test("G10 — a DIFFERENT origin opens at its own size, not the previous origin's", async ({
    page,
    context,
  }) => {
    /* ONE geometry map, TWO origins, and the same page served by both of
     * e2e/serve.ts's ports. localhost:3000 and 127.0.0.1:3001 are genuinely
     * cross-origin, so `location.origin` — the key the feature is stored under
     * — really differs between the two loads. If the lookup were keyed on
     * anything weaker (host, or nothing at all), the second window would come
     * back at the first origin's size and this is where it would show. */
    const sizeA: Size = { w: 360, h: 200 };
    const sizeB: Size = { w: 480, h: 270 };
    const map = { [ORIGIN_A]: sizeA, [ORIGIN_B]: sizeB };

    await open(page, url(ORIGIN_A, { geometry: map }));
    await openWindow(page);
    const first = await sizes(page);
    console.log(`  G10 ${ORIGIN_A}: ${JSON.stringify(first)}`);
    expect(first.requested).toEqual({ width: sizeA.w, height: sizeA.h });
    await expectInner(page, [sizeA.w, sizeA.h], `${ORIGIN_A} did not open at its own size`);

    await closePip(page, context);

    await open(page, url(ORIGIN_B, { geometry: map }));
    // The fixture reports the origin it actually keyed on, so a same-origin
    // navigation that silently did not happen cannot pass this test.
    expect(await page.evaluate(() => window.__prefsUsed?.origin)).toBe(ORIGIN_B);
    await openWindow(page);
    const second = await sizes(page);
    const ctx = `\n  first: ${JSON.stringify(first)}\n  second: ${JSON.stringify(second)}\n`;
    console.log(`  G10 ${ORIGIN_B}: ${JSON.stringify(second)}`);

    expect(second.requested, ctx).toEqual({ width: sizeB.w, height: sizeB.h });
    await expectInner(page, [sizeB.w, sizeB.h], `${ORIGIN_B} did not open at its own size`);
    // THE ROW'S ACTUAL CLAIM: not the previous origin's size.
    expect(second.inner, ctx).not.toEqual([sizeA.w, sizeA.h]);
  });
});
