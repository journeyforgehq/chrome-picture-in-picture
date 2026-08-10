import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { startServers } from "./serve";
import { pipEntry, type PipEntryResult } from "../src/pip/entry";

/* ============================================================================
 * Real PiP entry, under a real user gesture. The one spec that calls
 * requestPictureInPicture() for real.
 * ============================================================================
 *
 * WHAT THIS COVERS
 * ----------------
 * The 40 fixtures in detection.spec.ts run pipEntry({ dryRun: true }): they
 * score and report without ever calling requestPictureInPicture(), which is
 * why they are fast and flake-free. Nothing there exercises the real call.
 * That call needs TRANSIENT USER ACTIVATION, and page.click() produces genuine
 * activation, so a fixture page with a button that calls the shipped pipEntry
 * covers the real call under a real gesture: enter, exit-and-restore, and the
 * two refusal paths that only exist in a real browser.
 *
 * window.__pipEntry is injected with addInitScript(pipEntry.toString()), the
 * same Function.prototype.toString() trip chrome.scripting.executeScript makes,
 * so this measures THE SHIPPED FUNCTION and not a copy of it that could drift.
 *
 * WHAT THIS DOES NOT COVER — READ THIS BEFORE TRUSTING IT
 * ------------------------------------------------------
 * This proves pipEntry's own behaviour under activation. It does NOT prove the
 * worker -> frame gesture hop: chrome.scripting.executeScript propagating the
 * toolbar click's activation into the page. Playwright drives page content, not
 * browser chrome, so it cannot click the extension's toolbar button, and
 * chrome.action.onClicked.dispatch() from a service worker carries no
 * activation at all — a test built on it would fail for a harness reason rather
 * than a real one. That hop was measured separately by a spike and is
 * re-checked by the manual smoke sheet each release. This file is not a
 * substitute for that, and a green run here says nothing about it.
 *
 * WHY THE CONTROL IS THE WHOLE POINT
 * ----------------------------------
 * Three spike runs produced confident wrong answers because the instrument did
 * not assert its own preconditions. So test 3 asserts that WITHOUT a gesture
 * the browser refuses. Without it, every other test in this file would still
 * pass if activation were being granted for free, and the file would be
 * measuring nothing.
 *
 * It is not hypothetical. MEASURED HERE: page.evaluate() CARRIES A USER
 * GESTURE. Playwright issues its evaluations with CDP's userGesture flag set,
 * so inside page.evaluate, navigator.userActivation.isActive is true on a page
 * nobody has touched, document.body.requestFullscreen() resolves, and
 * requestPictureInPicture() succeeds. Had the control been written with
 * page.evaluate it would have been green, wrong, and load-bearing. It therefore
 * runs over a raw CDP session with the flag left unset — see noGestureEval.
 * ==========================================================================*/

declare global {
  interface Window {
    /** Thenable on the real-PiP path, a plain object on the refusal paths. */
    __pipEntry?: (options: { dryRun?: boolean }) => PipEntryResult | Promise<PipEntryResult>;
    __lastResult?: PipEntryResult & { harnessError?: string };
    /** The fixture flips this once __lastResult has settled. See waitForResult. */
    __lastSettled?: boolean;
    __pipWindowSize?: { width: number; height: number };
    /** Set only by the control test's declared spy. See installRejectionSpy. */
    __pipRejection?: string | null;
  }
}

const FIXTURE = "http://localhost:3000/gesture-harness.html";

let servers: { close(): Promise<void> };

test.beforeAll(() => {
  servers = startServers();
});

test.afterAll(async () => {
  await servers.close();
});

test.beforeEach(async ({ page }) => {
  // THE SHIPPED FUNCTION, SERIALIZED THE WAY CHROME SERIALIZES IT. If this ever
  // produces a ReferenceError in the page, that is a real violation of rule 1
  // in src/pip/entry.ts's header — report it, do not paper over it here.
  await page.addInitScript(`window.__pipEntry = ${pipEntry.toString()}`);
});

/** Load the fixture and wait on its own readiness flag, never a fixed timeout. */
async function open(page: Page): Promise<void> {
  const head = await fetch(FIXTURE, { method: "HEAD" });
  expect(head.status, `fixture not found: ${FIXTURE}`).toBe(200);
  await page.goto(FIXTURE);
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "true");
}

/**
 * The click handler's result, once it has settled.
 *
 * pipEntry returns a plain object on the refusal paths but a PROMISE on the
 * real-PiP path, so reading __lastResult straight after the click would race
 * the microtask that fills it in — and would read `undefined` rather than fail,
 * which is the kind of silent nothing this file exists to prevent.
 */
async function waitForResult(page: Page): Promise<PipEntryResult & { harnessError?: string }> {
  await page.waitForFunction(() => window.__lastSettled === true);
  return (await page.evaluate(() => window.__lastResult))!;
}

/** The conditions we measured under, carried into every failure message. */
async function context(page: Page): Promise<string> {
  const state = await page.evaluate(() => document.documentElement.dataset.fixtureState ?? "[]");
  const last = await page.evaluate(() => JSON.stringify(window.__lastResult ?? null));
  return `\n  fixture state: ${state}\n  __lastResult: ${last}\n`;
}

test("enters PiP under a real gesture", async ({ page }) => {
  await open(page);

  await page.click("#go");
  await page.waitForFunction(() => document.pictureInPictureElement !== null);

  const result = await waitForResult(page);
  const ctx = await context(page);

  expect(result?.harnessError, ctx).toBeUndefined();
  expect(result?.outcome, ctx).toBe("PIP_OK");
  expect(result?.acted, ctx).toBe(true);
  expect(result?.winner?.label, ctx).toBe("target");

  // Reported, never pinned: Chrome picks the floating window's size from the
  // screen it opens on, so this number is machine-dependent by construction.
  // The assertion is only that a real window with real dimensions appeared.
  const size = await page.evaluate(() => window.__pipWindowSize);
  console.log(`  PictureInPictureWindow: ${size?.width}x${size?.height}`);
  expect(size?.width, ctx).toBeGreaterThan(0);
  expect(size?.height, ctx).toBeGreaterThan(0);
});

test("a second invocation exits and returns the video, still playing", async ({ page }) => {
  await open(page);

  await page.click("#go");
  await page.waitForFunction(() => document.pictureInPictureElement !== null);

  await page.click("#go");
  await page.waitForFunction(() => document.pictureInPictureElement === null);

  const result = await waitForResult(page);
  const ctx = await context(page);
  expect(result?.outcome, ctx).toBe("PIP_EXITED");

  // EXIT MUST RETURN THE VIDEO, NOT STOP IT. Chrome moves the element back into
  // the document on exit; a regression that tore down the player instead would
  // leave a paused or detached <video> here and nothing else in the suite would
  // notice, because no dry-run fixture ever enters PiP to begin with.
  const after = await page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>("#stage video");
    return v ? { present: true, paused: v.paused, readyState: v.readyState } : { present: false };
  });
  expect(after.present, ctx).toBe(true);
  expect(after.paused, ctx).toBe(false);
});

/* ---------------------------------------------------------------------------
 * THE CONTROL.
 * -------------------------------------------------------------------------*/

/**
 * Evaluate in the page WITHOUT granting user activation.
 *
 * page.evaluate cannot be used: measured above, it carries a gesture. Raw CDP
 * Runtime.evaluate leaves the userGesture flag unset, and on a freshly loaded
 * document navigator.userActivation.isActive reads false through it.
 *
 * Activation is transient (~5s) and survives across calls, so the control test
 * must not touch page.evaluate or page.waitForFunction (which polls via
 * evaluate) before it measures — everything it needs goes through here.
 */
async function noGestureEval<T>(cdp: CDPSession, expression: string): Promise<T> {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`no-gesture evaluate threw: ${r.exceptionDetails.text} ${expression}`);
  }
  return r.result.value as T;
}

test("THE CONTROL — no gesture means NotAllowedError", async ({ page }) => {
  // IF THIS TEST PASSES WHEN IT SHOULD FAIL, EVERY OTHER TEST IN THE FILE IS
  // WORTHLESS. It is the only thing standing between "the click did the work"
  // and "the harness was handing out activation and we measured nothing".

  // A DECLARED SPY, installed for this test only, as an INDEPENDENT CROSS-CHECK
  // — not the primary source. pipEntry now reports the rejection itself, and
  // the assertions below read it from pipEntry's own return value; this wrapper
  // observes the raw promise straight from the browser so the two can be
  // compared. It records the name and hands back the very same promise,
  // untouched.
  await page.addInitScript(() => {
    window.__pipRejection = null;
    const real = HTMLVideoElement.prototype.requestPictureInPicture;
    HTMLVideoElement.prototype.requestPictureInPicture = function (this: HTMLVideoElement) {
      const p = real.call(this);
      p.catch((e: { name?: string }) => {
        window.__pipRejection = (e && e.name) || "Error";
      });
      return p;
    };
  });

  await page.goto(FIXTURE);

  const cdp = await page.context().newCDPSession(page);

  // Readiness polled over CDP on purpose: page.waitForFunction polls with
  // page.evaluate, and each poll would hand the page a fresh ~5s activation —
  // which is exactly the contamination this test exists to detect.
  const deadline = Date.now() + 15_000;
  for (;;) {
    const ready = await noGestureEval<boolean>(
      cdp,
      "document.documentElement.dataset.fixtureReady === 'true'"
    );
    if (ready) break;
    if (Date.now() > deadline) throw new Error("fixture never became ready");
    await new Promise((r) => setTimeout(r, 100));
  }

  // THE INSTRUMENT ASSERTS ITS OWN PRECONDITION. If this reads true, the run
  // below is not a no-gesture run and nothing it reports means anything.
  const activation = await noGestureEval<string>(
    cdp,
    "JSON.stringify({ isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive })"
  );
  expect(
    JSON.parse(activation),
    "\n  The page already had user activation before the no-gesture call.\n" +
      "  Something above this line granted a gesture (page.evaluate does).\n" +
      "  Until that is fixed this test proves nothing.\n"
  ).toEqual({ isActive: false, hasBeenActive: false });

  // THE OTHER PRECONDITION, AND IT IS WHY PIP_REFUSED EXISTS. Picture-in-picture
  // is ENABLED in this browser right now — so the NotAllowedError asserted below
  // cannot mean "turned off in this browser". entry.ts returns the
  // `pip-unavailable` reason from exactly this flag being false, before it ever
  // calls the API, so the two conditions are mutually exclusive by
  // construction. Measured here rather than argued: this single line is the
  // empirical proof that mapping NotAllowedError to PIP_UNAVAILABLE was a lie.
  const pipEnabled = await noGestureEval<boolean>(cdp, "document.pictureInPictureEnabled");
  expect(
    pipEnabled,
    "\n  document.pictureInPictureEnabled is false in this browser, so the\n" +
      "  NotAllowedError below could legitimately mean 'turned off'. This test\n" +
      "  cannot distinguish the two paths under that condition.\n"
  ).toBe(true);

  // Promise.resolve + awaitPromise, because pipEntry is thenable on this path:
  // JSON.stringify of the promise itself would be "{}" and every assertion
  // below would then be comparing against undefined.
  const result: PipEntryResult = JSON.parse(
    await noGestureEval<string>(
      cdp,
      "Promise.resolve(window.__pipEntry({})).then(function (r) { return JSON.stringify(r); })"
    )
  );

  const rejection = await noGestureEval<string | null>(cdp, "window.__pipRejection");
  const pipOpen = await noGestureEval<boolean>(cdp, "document.pictureInPictureElement !== null");
  const ctx = `\n  pipEntry result: ${JSON.stringify(result)}\n  rejection: ${rejection}\n`;

  // THE BROWSER REFUSED, AND pipEntry SAID SO. Reported by the function itself,
  // which is the whole point: background/action.ts turns exactly this
  // errorName into the PIP_REFUSED toast, so a result that did not carry it
  // would mean the user got silence.
  //
  // Getting here required fixing entry.ts. MEASURED: a gesture-less
  // requestPictureInPicture() does not throw, it rejects asynchronously, so the
  // try/catch never fired and the old code returned an optimistic PIP_OK with
  // the rejection swallowed — which made both of decideOutcome's errorName
  // branches dead code in production.
  expect(result.outcome, ctx).toBe("THREW");
  expect(result.errorName, ctx).toBe("NotAllowedError");
  expect(pipOpen, ctx).toBe(false);

  // Cross-check from the other side of the boundary: the spy sees the raw
  // promise rejection, independently of how pipEntry chose to report it. If
  // these two ever disagree, pipEntry is inventing its own answer.
  expect(rejection, ctx).toBe("NotAllowedError");
});

test("disablePictureInPicture is respected even with a real gesture", async ({ page }) => {
  await open(page);

  // The PROPERTY, not just the attribute. happy-dom does not implement
  // disablePictureInPicture at all, so the unit layer can only ever reach
  // entry.ts's hasAttribute() branch; Chrome populates the property, and the
  // `el.disablePictureInPicture === true` half of that check is otherwise
  // never executed against a real element anywhere in this repo.
  await page.evaluate(() => {
    document.querySelector<HTMLVideoElement>("#stage video")!.disablePictureInPicture = true;
  });

  await page.click("#go");

  const result = await waitForResult(page);
  const ctx = await context(page);

  expect(result?.reason, ctx).toBe("pip-disabled-by-site");
  expect(result?.acted, ctx).toBe(false);
  expect(await page.evaluate(() => document.pictureInPictureElement), ctx).toBeNull();
});

test("pictureInPictureEnabled: false reports pip-unavailable", async ({ page }) => {
  // Stubbed before load, because entry.ts reads the capability on every call
  // and the fixture's own script must see the same document this test does.
  // A real page reaches this state through enterprise policy or a
  // Permissions-Policy header (see the d03 fixture) — neither of which can be
  // toggled per-test, which is why it is stubbed here.
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, "pictureInPictureEnabled", {
      get: () => false,
      configurable: true,
    });
  });

  await open(page);
  await page.click("#go");

  const result = await waitForResult(page);
  const ctx = await context(page);

  expect(result?.reason, ctx).toBe("pip-unavailable");
  expect(result?.acted, ctx).toBe(false);
  expect(await page.evaluate(() => document.pictureInPictureElement), ctx).toBeNull();
});
