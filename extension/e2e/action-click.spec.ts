import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { launchGranted, tabIdFor, type GrantedExtension } from "./granted-dist";
import { startServers } from "./serve";

/* ============================================================================
 * THE WORKER -> FRAME GESTURE HOP, under automation.
 * ============================================================================
 *
 * A-02 recorded this as uncoverable, and said so in as many words: "What no
 * automated layer covers, stated plainly: the worker->frame gesture hop."
 * Playwright drives page content, not browser chrome, and
 * chrome.action.onClicked.dispatch() from a service-worker evaluate carries no
 * user activation at all — so every real-PiP row built on it would have failed
 * for a harness reason rather than a real one.
 *
 * A-04 retired that. S-11 measured a way through: page.keyboard cannot reach
 * the browser's extension-command handler (it sends `keyDown`; the handler
 * wants `rawKeyDown`), but CDP Input.dispatchKeyEvent {type:"rawKeyDown"} on
 * the _execute_action binding fires chrome.action.onClicked WITH genuine
 * transient activation — verified in that spike by the injected frame
 * reporting isActive: true.
 *
 * So this file drives the real click path end to end:
 *
 *     Alt+P (browser accelerator)
 *       -> chrome.action.onClicked in the service worker
 *       -> chrome.scripting.executeScript({ func: pipEntry })     <- THE HOP
 *       -> requestPictureInPicture()
 *
 * IT IS THE ONLY LAYER THAT CAN CATCH AN INVARIANT 1 REGRESSION.
 * src/background/background.ts's click listener must call executeScript as its
 * FIRST statement with no await before it; S-11 measured that even
 * `await Promise.resolve()` — 0ms, no IPC — spends the worker's gesture,
 * because that scope is TURN-based, not time-based. Breaking it produces a
 * NotAllowedError in the user's browser and NOTHING ANYWHERE ELSE.
 * test/background/invariant.test.ts guards the property SYNTACTICALLY by
 * reading the source text. This is the behavioural guard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY READ IN THIS FILE GOES THROUGH RAW CDP. READ THIS BEFORE EDITING.
 * ─────────────────────────────────────────────────────────────────────────────
 * The first version of this spec used page.evaluate for its control read and
 * for its poll, and it PASSED WITH THE MUTATION IN PLACE — `await
 * chrome.storage.session.get("x")` inserted as the first line of the click
 * listener, the exact regression S-11 measured, and native PiP still opened.
 * It was measuring nothing.
 *
 * The cause is the one gesture.spec.ts's header names and granted-dist.ts's
 * header repeats: PLAYWRIGHT'S page.evaluate CARRIES A USER GESTURE. It issues
 * CDP Runtime.evaluate with userGesture:true, which grants the page its OWN
 * transient activation — time-based, ~5s, and pipEntry is perfectly happy to
 * spend that one instead. So a control read taken moments before the key press
 * hands the frame the very thing the test is trying to prove arrived through
 * the worker.
 *
 * Two consequences, both structural rather than stylistic:
 *
 *   1. NOTHING between opening the fixture and pressing the key may use
 *      page.evaluate, page.waitForFunction or page.waitForSelector, and nothing
 *      in the post-press poll may either — the injection can land after the
 *      first poll tick. Every page read here is noGestureEval().
 *   2. settleActivation() then POLLS navigator.userActivation.isActive until it
 *      reads false, so the press happens on a frame with demonstrably no
 *      activation of its own. That is the control: any activation the injected
 *      function finds must have come across the hop.
 *
 * chrome.scripting.executeScript driven from ext.ext (the options page) is the
 * same hazard one level out — that page's evaluate-granted activation is
 * exactly what executeScript propagates — so those reads are confined to the
 * setup phase, ahead of settleActivation, and never used to observe a result.
 *
 * WHAT THIS DOES NOT PROVE
 * ------------------------
 *  - The toolbar BUTTON. What is driven here is the keyboard binding to
 *    _execute_action, which the manifest chose precisely because it routes
 *    through chrome.action.onClicked — the same handler, the same activation —
 *    rather than through a custom command with its own executeScript path. The
 *    mouse hitting the browser chrome is still out of reach.
 *  - The GRANTING of <all_urls>. It is static in .tmp-granted-dist/; see the
 *    header of granted-dist.ts.
 *  - The SCORING half. arbitration.spec.ts owns that and this file deliberately
 *    does not restate it: one video, one frame, no contest.
 *
 * THE PRECONDITION IS NOT CEREMONY. S-04 measured Chrome SILENTLY DECLINING to
 * bind Alt+1 (the OS took the accelerator), and the first spike run that missed
 * it read as a defect in the product. A red run here must be able to say which
 * of two things happened: the command was never bound, or the hop is broken. So
 * chrome.commands.getAll() is read once, asserted, printed, and pasted into
 * every failure message below.
 * ==========================================================================*/

/** Single video, top frame, unmuted and playing — no arbitration to do. */
const FIXTURE = "http://localhost:3000/a01-plain.html";

let servers: { close(): Promise<void> };
let ext: GrantedExtension;
/** chrome.commands.getAll(), verbatim, read once in beforeAll. */
let commands: chrome.commands.Command[] = [];

test.beforeAll(async () => {
  servers = startServers();
  ext = await launchGranted();
  commands = await ext.ext.evaluate(() => chrome.commands.getAll());
  console.log(`  chrome.commands.getAll() => ${JSON.stringify(commands)}`);
});

test.afterAll(async () => {
  await ext?.close();
  await servers?.close();
});

/** What Chrome actually bound, for pasting into a failure message. */
function bindingCtx(): string {
  return `\n  chrome.commands.getAll(): ${JSON.stringify(commands)}\n`;
}

/**
 * Evaluate in the page WITHOUT granting user activation.
 *
 * The same instrument gesture.spec.ts's control uses, and here it is not one
 * test's tool but the ONLY way this file is allowed to look at the page. Raw
 * CDP Runtime.evaluate leaves the userGesture flag unset; page.evaluate does
 * not, and the difference is the difference between measuring the hop and
 * measuring Playwright.
 */
async function noGestureEval<T>(cdp: CDPSession, expression: string): Promise<T> {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`no-gesture evaluate threw: ${r.exceptionDetails.text} — ${expression}`);
  }
  return r.result.value as T;
}

/**
 * Press the _execute_action accelerator.
 *
 * rawKeyDown, NOT keyDown, and NOT page.keyboard.press: S-11 measured that
 * Playwright's own keyboard helper sends `keyDown` and the browser's
 * extension-command handler never sees it, while the same chord sent as
 * `rawKeyDown` over a raw CDP session delivers chrome.action.onClicked with a
 * live gesture. modifiers: 1 is Alt in CDP's bitmask (Alt 1, Ctrl 2, Meta 4,
 * Shift 8) and is what the manifest's Alt+P needs on every platform — Chrome
 * maps Alt to Option on macOS itself, and reports the binding back as "⌥P".
 *
 * CALLED EXACTLY ONCE PER TEST, deliberately. pipEntry's second-click branch
 * EXITS PiP, so a retry loop around this would toggle the very thing it is
 * polling for. Everything after the press is a poll on the RESULT.
 */
async function pressActionShortcut(cdp: CDPSession): Promise<void> {
  const key = {
    modifiers: 1,
    key: "p",
    code: "KeyP",
    windowsVirtualKeyCode: 80,
    nativeVirtualKeyCode: 80,
  };
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

/**
 * Open the fixture and wait until it says it is measurable — over CDP.
 *
 * data-fixture-ready is harness.js's own signal: every video reached its
 * declared state, rather than two frames of wall clock having elapsed. Without
 * it a red run could be a video stuck below readyState 2, which pipEntry
 * declines with reason "not-ready" — a harness cause wearing the costume of a
 * broken gesture hop.
 *
 * page.waitForSelector would be the obvious way to wait and is deliberately not
 * used: it polls the page through Playwright's own evaluation path, and this
 * file cannot afford to inherit that path's userGesture flag. See the header.
 */
async function openFixture(): Promise<{ page: Page; cdp: CDPSession }> {
  const page = await ext.context.newPage();
  const cdp = await ext.context.newCDPSession(page);
  await page.goto(FIXTURE);
  await page.bringToFront();
  await expect
    .poll(() => noGestureEval<string>(cdp, "document.documentElement.dataset.fixtureReady"), {
      timeout: 15_000,
      intervals: Array<number>(150).fill(100),
      message: "\n  harness.js never stamped data-fixture-ready on the fixture.\n",
    })
    .toBe("true");
  return { page, cdp };
}

/**
 * Wait until the page has NO transient activation of its own, and prove it.
 *
 * THIS IS THE CONTROL, and it is what the first version of this file was
 * missing. Activation is time-based (~5s) and survives across calls, so any
 * gesture-carrying evaluation during setup — page.evaluate, or an
 * executeScript driven from the options page — leaves the frame able to open
 * PiP entirely on its own. Polling until isActive reads false both waits that
 * window out and asserts that it is gone, so the press below happens on a frame
 * that has nothing to spend.
 */
async function settleActivation(cdp: CDPSession): Promise<void> {
  await expect
    .poll(() => noGestureEval<boolean>(cdp, "navigator.userActivation.isActive"), {
      timeout: 15_000,
      intervals: Array<number>(60).fill(250),
      message:
        "\n  The page still holds its OWN transient user activation. Pressing the" +
        "\n  accelerator now would prove nothing: pipEntry would spend the page's" +
        "\n  activation and open PiP whether or not the worker propagated one." +
        "\n  Something in this file's setup is granting a gesture — page.evaluate," +
        "\n  page.waitForSelector/waitForFunction, or a chrome.scripting call made" +
        "\n  from the options page. Read the header.\n",
    })
    .toBe(false);
}

/** Run `func` in the extension's ISOLATED world of the tab's top frame.
 *  SETUP ONLY — this propagates the options page's activation into the frame,
 *  so it must never be used to observe a result. See the header. */
async function inIsolatedWorld<T>(tabId: number, func: () => T): Promise<T> {
  const result = await ext.ext.evaluate(
    async ({ tid, src }) => {
      const rebuilt = new Function("return (" + src + ")")() as () => unknown;
      const out = await chrome.scripting.executeScript({
        target: { tabId: tid, frameIds: [0] },
        func: rebuilt as () => unknown,
      });
      return out[0]?.result;
    },
    { tid: tabId, src: func.toString() }
  );
  return result as T;
}

test("PRECONDITION — Chrome bound the _execute_action accelerator", () => {
  /* If this fails, NOTHING below is a statement about the extension. S-04
   * measured Chrome accepting a manifest and then silently declining to bind
   * the key (Alt+1, taken by the OS), and the run that missed it reported a
   * harness defect as a product defect. Asserted from the RUNNING browser, not
   * read off manifest.json — the manifest only makes a suggestion.
   *
   * THE STRING IS PLATFORM-RENDERED, and this assertion was written wrong the
   * first time on exactly that point. `"suggested_key": { "mac": "Alt+P" }`
   * comes back from chrome.commands.getAll() on macOS as "⌥P" — Chrome maps
   * Alt to Option and reports the GLYPH, not the manifest spelling. So the
   * pattern accepts both renderings of the same chord rather than pinning one
   * platform's presentation; what must not be accepted is the EMPTY string,
   * which is how "accepted the manifest, bound nothing" actually looks. */
  const action = commands.find((c) => c.name === "_execute_action");
  expect(action, bindingCtx()).toBeTruthy();
  expect(
    action?.shortcut,
    bindingCtx() +
      "\n  Chrome bound no usable key to _execute_action (an EMPTY shortcut is" +
      "\n  what a silently-declined binding looks like — S-04, Alt+1). Every" +
      "\n  test in this file presses a shortcut that does not exist, so read" +
      "\n  their failures as 'the command is not bound', NOT as 'the gesture" +
      "\n  hop is broken'.\n"
  ).toMatch(/^(Alt\+|⌥)P$/);
});

test("the toolbar shortcut opens native PiP through the real worker path", async () => {
  const { page, cdp } = await openFixture();
  const tabId = await tabIdFor(ext, FIXTURE);
  const state = await noGestureEval<string>(
    cdp,
    "document.documentElement.dataset.fixtureState || '(absent)'"
  );

  // Nothing may be floating before the press, or the poll below is satisfied by
  // a leftover rather than by this click.
  expect(await noGestureEval<boolean>(cdp, "!!document.pictureInPictureElement")).toBe(false);

  await settleActivation(cdp);
  await pressActionShortcut(cdp);

  await expect
    .poll(() => noGestureEval<boolean>(cdp, "!!document.pictureInPictureElement"), {
      timeout: 5_000,
      intervals: Array<number>(100).fill(50),
      message:
        bindingCtx() +
        `  fixture state: ${state}\n` +
        "\n  No PiP element appeared after the accelerator was pressed, and the" +
        "\n  control above proved the page had no activation of its own — so the" +
        "\n  gesture had to arrive across the hop and did not." +
        "\n  INVARIANT 1 in src/background/background.ts is the first thing to" +
        "\n  read: an `await` ANYWHERE above executeScript in that listener" +
        "\n  produces exactly this failure, silently, and produces it in the" +
        "\n  user's browser too. (Verified by mutation — see the task record.)" +
        "\n  If the binding above is empty instead, the key was never bound and" +
        "\n  this says nothing about the hop.\n",
    })
    .toBe(true);

  // ── The WORKER's own view, so a green run is not just the page's word ────
  // Playwright cannot instrument an MV3 worker directly, so activePip — written
  // in the promise tail AFTER the injection resolved — is the indirect read
  // that the click was handled by the shipped listener rather than by anything
  // this file did. `label` comes back from the injected frame's own result, so
  // it is also evidence the executeScript RESULT crossed back.
  const active = await ext.ext.evaluate(async () => {
    const s = await chrome.storage.session.get("activePip");
    return (s.activePip as { tabId: number; frameId: number; label: string } | undefined) ?? null;
  });
  expect(active, bindingCtx() + `  activePip: ${JSON.stringify(active)}\n`).toEqual({
    tabId,
    frameId: 0,
    label: "only",
  });

  await cdp.detach();
  await page.close();
});

test("the ENHANCED-WINDOW branch is reachable through the same hop", async () => {
  /* ------------------------------------------------------------------------
   * WHY A SECOND TEST, AND EXACTLY HOW MUCH IT IS WORTH.
   *
   * The two branches leave the click in DIFFERENT PLACES. The free path spends
   * the activation on requestPictureInPicture() synchronously inside pipEntry.
   * The Pro path spends it on documentPictureInPicture.requestWindow() and then
   * the worker comes BACK for a second executeScript (enhanceWindow) in the
   * promise tail, long after the gesture is gone. A regression that broke only
   * the Pro route through the hop would leave the test above green.
   *
   * CLAIM IT AS A REACHABILITY TEST, NOT AS A SECOND GESTURE GUARD — even
   * though the mutation run says it is both. S-12 measured that Chrome does NOT
   * enforce requestWindow()'s gesture requirement under automation at all (a
   * no-gesture control opened a window in every arm), so the honest expectation
   * was that this test would stay green under the INVARIANT 1 mutation.
   *
   * IT DID NOT. Measured: with `await chrome.storage.session.get("x")` inserted
   * as the first line of the click listener, this test goes red alongside the
   * native one — no enhanced window, and no native window either. What was NOT
   * isolated is WHY, and there are two consistent explanations: requestWindow
   * refusing a genuinely gesture-free frame (contradicting S-12, whose control
   * ran in an ordinary page rather than through the hop), or requestWindow
   * refusing and pipEntry's native() fallback then refusing too. Because the
   * cause is unresolved, this test is not RELIED on as a gesture guard — the
   * native test above is, and it is the one to read first on a red run. What
   * this one is relied on for is the Pro route being reachable at all: routing
   * that never selects `document`, prefs that never arrive, a requestWindow
   * that always falls back to native.
   *
   * It also does not measure the window's SIZE or STYLE: those need
   * `viewport: null`, which this config's persistent context cannot give, and
   * dpip-window.spec.ts / dpip-geometry.spec.ts already own them.
   * ----------------------------------------------------------------------*/
  const { page, cdp } = await openFixture();
  const tabId = await tabIdFor(ext, FIXTURE);

  // Document PiP has to exist in the ISOLATED world specifically — that is the
  // world pipEntry runs in, and `supported` is what routes the click. If this
  // were false the branch would be unreachable for a browser reason and the
  // poll below would be blaming the extension for it.
  expect(
    await inIsolatedWorld(
      tabId,
      () => typeof (window as never as Record<string, unknown>).documentPictureInPicture
    ),
    bindingCtx()
  ).toBe("object");

  // Pro + enhancedWindow on. Both keys are read by BOTH prefs paths — the
  // worker's cache (storage.onChanged refreshes it) and pipEntry's own cold
  // read inside the frame — so this works whether or not the worker is warm,
  // which is what stops this test from depending on worker lifetime.
  await ext.ext.evaluate(async () => {
    await chrome.storage.local.set({
      settings: {
        embeddedPlayers: false,
        toastEnabled: true,
        enhancedWindow: true,
        windowSize: "medium",
        rememberSizePerSite: true,
        inWindowControls: true,
        subtitles: false,
      },
      entitlement_cache: { tier: "pro", checkedAt: Date.now() },
    });
  });

  // The main world sees the SAME DocumentPictureInPicture as the isolated world
  // pipEntry runs in — isolated worlds get their own JS globals but share the
  // underlying window, and `.window` is a property of that shared object.
  // MEASURED: this reads false before the press and true after, from CDP.
  const DPIP_OPEN = "!!(window.documentPictureInPicture && documentPictureInPicture.window)";
  expect(await noGestureEval<boolean>(cdp, DPIP_OPEN), bindingCtx()).toBe(false);

  // AFTER the executeScript calls above, not before: they propagate the options
  // page's activation into this frame, and the control has to wait it out.
  //
  // MEASURED, and it is corroborating evidence rather than a caveat: this test
  // spends ~5s here while the native one settles instantly. The only difference
  // between them is the executeScript above — so chrome.scripting.executeScript
  // demonstrably carries its caller's activation into the target frame, which
  // is the very mechanism the hop depends on, observed from the other side.
  await settleActivation(cdp);
  await pressActionShortcut(cdp);

  await expect
    .poll(() => noGestureEval<boolean>(cdp, DPIP_OPEN), {
      timeout: 5_000,
      intervals: Array<number>(100).fill(50),
      message:
        bindingCtx() +
        "\n  No Document PiP window opened. If the native test above is GREEN," +
        "\n  the hop itself is fine and the fault is in the ROUTING — prefs" +
        "\n  (tier/enhancedWindow) not reaching pipEntry, or requestWindow" +
        "\n  falling back to native. If BOTH are red, read INVARIANT 1 first.\n",
    })
    .toBe(true);

  // The free window must NOT also have been opened. `fellBackFrom` exists in
  // PipEntryResult so a pro user quietly handed the free window is
  // distinguishable from a free user who chose it; this is that same
  // distinction, asserted from outside the extension.
  expect(await noGestureEval<boolean>(cdp, "!!document.pictureInPictureElement")).toBe(false);

  // The SECOND injection ran too. enhanceWindow moves the page's <video> into
  // the PiP document, so its absence from this document is the evidence that
  // the promise-tail executeScript landed — the half of the Pro path that
  // happens after the gesture is spent, and the half a window-only assertion
  // would miss entirely.
  expect(
    await noGestureEval<boolean>(cdp, "!document.querySelector('video')"),
    bindingCtx() + "\n  The enhanced window opened but the video never moved into it.\n"
  ).toBe(true);

  // Put the profile back the way the other tests found it. The context is
  // thrown away in afterAll, but a test that leaves a Pro entitlement behind is
  // a trap for whatever gets added to this file next.
  await ext.ext.evaluate(() => chrome.storage.local.remove(["settings", "entitlement_cache"]));
  await cdp.detach();
  await page.close();
});
