import { test, expect } from "@playwright/test";
import {
  ensureRegisteredInPage,
  launchGranted,
  readFrames,
  tabIdFor,
  type FrameView,
  type GrantedExtension,
} from "./granted-dist";
import { startServers } from "./serve";

/* ============================================================================
 * Frame arbitration — THE WRITE SIDE, end to end, in a real browser.
 * ============================================================================
 *
 * WHAT WAS MISSING, AND WHY IT MATTERED
 * -------------------------------------
 * pipEntry reads exactly one thing inside the click:
 *
 *     window.__pipCoord ? __pipCoord.isWinner === true : (window === window.top)
 *
 * detection.spec.ts covers the READ side thoroughly — but it sets __pipCoord BY
 * HAND. Everything that PRODUCES that flag had zero automated coverage:
 *
 *     frame  --PIP_SCORE_REPORT-->  worker      (worker reads sender.frameId)
 *     worker --PIP_COORD-------->   each frame  (tabs.sendMessage + { frameId })
 *
 * i.e. content.ts's localScore(), chrome.runtime.sendMessage from a
 * cross-origin subframe, sender.frameId being populated at all, pickWinner
 * ranking the frames, and chrome.tabs.sendMessage(tabId, msg, { frameId })
 * delivering the verdict back. None of it can be exercised without a real
 * extension in a real browser: sender.frameId does not exist under vitest, and
 * an in-memory stub of it would only be asserting the stub.
 *
 * The failure this guards against is the one the whole mechanism exists for: a
 * spike measured THREE FRAMES ALL CALLING requestPictureInPicture() with the
 * last one silently winning. Non-deterministic, invisible in code review, and
 * user-visible only as "it popped out the wrong video, sometimes".
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 * --------------------------------------
 * PROVES: with the host permission held and the content script registered, the
 * arbitration loop elects exactly one frame per tab and both frames agree on
 * which one.
 *
 * DOES NOT PROVE: that the user can GET to that state. The permission is
 * granted statically in a throwaway copy of the manifest (see granted-dist.ts)
 * because chrome.permissions.request() cannot be driven under automation. This
 * says nothing about the consent bubble or the options-page flow that calls it.
 *
 * DOES NOT PROVE the gesture hop either — chrome.action.onClicked cannot be
 * triggered by Playwright at all (see the header of gesture.spec.ts). This
 * covers the state that is sitting in the frame BEFORE the click, which is
 * precisely the half that can be covered.
 * ==========================================================================*/

/** The one fixture with a real cross-origin child: 127.0.0.1:3001 inside :3000. */
const FIXTURE = "http://localhost:3000/e06-vimeo-embed.html";
const CHILD_URL = "http://127.0.0.1:3001/_embed-child.html";

let servers: { close(): Promise<void> };
let ext: GrantedExtension;

test.beforeAll(async () => {
  servers = startServers();
  ext = await launchGranted();
});

test.afterAll(async () => {
  await ext?.close();
  await servers?.close();
});

/** Render a frame table into a failure message. Never let a red run be mute. */
function describeFrames(frames: FrameView[]): string {
  return frames
    .map(
      (f) =>
        `\n    frameId ${f.frameId}  injected=${f.injected}  ` +
        `coord=${JSON.stringify(f.coord)}  ${f.url}`
    )
    .join("");
}

test("the video-holding cross-origin subframe wins and the top frame stands down", async () => {
  await ensureRegisteredInPage(ext);

  const page = await ext.context.newPage();
  const t0 = Date.now();
  await page.goto(FIXTURE);
  const tabId = await tabIdFor(ext, FIXTURE);

  // THE SEED IS THE OPPOSITE OF THE VERDICT, WHICH IS WHAT MAKES THIS A
  // MEASUREMENT. content.ts sets __pipCoord synchronously on install to
  // `window === window.top`, so before any message flows the TOP frame reads
  // isWinner:true and the subframe reads false. On this fixture the correct
  // answer is the reverse, so polling until the SUBFRAME wins cannot be
  // satisfied by the seed — only by a completed worker round trip.
  let last: FrameView[] = [];
  let verdictMs = -1;

  // The polled VALUE is the frame table's verdict, not a boolean: a timeout on
  // `.toBe(true)` prints only "expected true, received false", and the one
  // thing worth knowing on a red run is which frames thought they had won.
  await expect
    .poll(
      async () => {
        last = await readFrames(ext, tabId);
        const state = {
          frames: last.length,
          winners: last.filter((f) => f.coord?.isWinner === true).map((f) => f.url),
        };
        const settled = state.frames === 2 && state.winners.join() === CHILD_URL;
        if (settled && verdictMs < 0) verdictMs = Date.now() - t0;
        return state;
      },
      {
        // Retrying assertion rather than a fixed wait: registration, injection
        // and the message round trip are all asynchronous, and a bare
        // waitForTimeout would either flake on a loaded machine or hide how
        // long this actually takes.
        timeout: 15_000,
        intervals: Array<number>(300).fill(25),
        message:
          "\n  The verdict never reached the frames. `winners` below is read from" +
          "\n  each frame's __pipCoord in the ISOLATED world (the same world" +
          "\n  content.js writes it in) via chrome.scripting.executeScript." +
          "\n  Seeing the TOP frame there means it is still on content.ts's" +
          "\n  synchronous seed and no verdict ever arrived.\n",
      }
    )
    .toEqual({ frames: 2, winners: [CHILD_URL] });

  const ctx = `\n  frames:${describeFrames(last)}\n  verdict arrived ${verdictMs}ms after goto\n`;
  console.log(`  arbitration verdict landed ${verdictMs}ms after goto`);
  console.log(`  frame table:${describeFrames(last)}`);

  const top = last.find((f) => f.frameId === 0);
  const child = last.find((f) => f.url === CHILD_URL);

  // The content script reached BOTH documents, including the cross-origin one.
  // Without this, every assertion below could be satisfied by a page where
  // arbitration never had two candidates to choose between.
  expect(last.length, ctx).toBe(2);
  expect(top?.injected, ctx).toBe(true);
  expect(child?.injected, ctx).toBe(true);

  // sender.frameId ARRIVES POPULATED FOR A CROSS-ORIGIN SUBFRAME. The whole
  // design rests on this: without chrome.webNavigation (forbidden by the
  // three-permission manifest) it is the only frame table there is. A subframe
  // reported as frameId 0 would collapse the two frames into one entry and the
  // worker would arbitrate a one-frame contest forever.
  expect(child!.frameId, ctx).toBeGreaterThan(0);

  // ── THE ASSERTION THIS FILE EXISTS FOR, AND IT GOES FIRST ───────────────
  // Exactly one. Not "the right one won" — that alone would still pass if the
  // worker told EVERY frame it had won, which is the precise shape of the bug
  // arbitration was built to prevent (three frames, three PiP calls, last one
  // silently wins). Winners must be a set of size one.
  //
  // It is asserted BEFORE the per-frame checks below on purpose: when the
  // mechanism breaks, this is the sentence that should appear in the failure,
  // not a diff about one frame's flag. (Verified by mutation: making the worker
  // push isWinner:true to every frame reports the line below.)
  const winners = last.filter((f) => f.coord?.isWinner === true);
  expect(
    winners.map((f) => f.frameId),
    "\n  EXACTLY ONE FRAME MAY BE THE WINNER. More than one and every winning" +
      "\n  frame calls requestPictureInPicture() on the next click, which is the" +
      "\n  non-deterministic behaviour arbitration exists to remove. Zero and the" +
      "\n  toolbar button does nothing at all." +
      ctx
  ).toEqual([child!.frameId]);

  // THE VERDICT, ON BOTH SIDES. The subframe holds the only video, so it wins;
  // the top frame — which would act by default with no content script at all —
  // stands down.
  expect(child!.coord, ctx).toEqual({ isWinner: true, updatedAt: expect.any(Number) });
  expect(top!.coord, ctx).toEqual({ isWinner: false, updatedAt: expect.any(Number) });

  // ── The worker's own view, read from the storage key it writes ───────────
  // Playwright cannot instrument an MV3 service worker (a spike measured
  // serviceWorker.evaluate() seeing a `chrome` object with only
  // { loadTimes, csi }), so the frameScores map is the indirect read. It is
  // keyed by sender.frameId, so it is also the direct evidence that the
  // subframe's report arrived under its own id and that the top frame reported
  // "no candidate here" rather than never reporting.
  const scores = await ext.ext.evaluate(async () => {
    const s = await chrome.storage.session.get("frameScores");
    return s.frameScores as Record<string, Record<string, number | null>> | undefined;
  });
  const forTab = scores?.[String(tabId)];
  const scoreCtx = `${ctx}  worker frameScores: ${JSON.stringify(scores)}\n`;

  expect(forTab, scoreCtx).toBeTruthy();
  expect(Object.keys(forTab!).sort(), scoreCtx).toEqual(
    [String(top!.frameId), String(child!.frameId)].sort()
  );
  // The top frame of e06 holds no video, so localScore() returns null — "no
  // candidate here", which pickWinner skips. The child holds the only video.
  expect(forTab![String(top!.frameId)], scoreCtx).toBeNull();
  expect(typeof forTab![String(child!.frameId)], scoreCtx).toBe("number");
  expect(forTab![String(child!.frameId)]!, scoreCtx).toBeGreaterThan(0);

  await page.close();
});

test("a dead frameId rejects with the message pruning depends on", async () => {
  /* ------------------------------------------------------------------------
   * pruneFrame() is reachable ONLY through chrome.tabs.sendMessage rejecting.
   * Without chrome.webNavigation there is no other liveness signal, so if that
   * rejection ever stopped happening — or started distinguishing "gone" from
   * "never existed" — the session map would grow for the life of the browser
   * and dead frames would keep competing in every arbitration.
   *
   * A spike measured stale, removed, and never-existed frameIds all rejecting
   * with the IDENTICAL message. background.ts's catch treats them identically,
   * so this re-measures the premise rather than trusting a note about it.
   * ----------------------------------------------------------------------*/
  await ensureRegisteredInPage(ext);

  const page = await ext.context.newPage();
  await page.goto(FIXTURE);
  const tabId = await tabIdFor(ext, FIXTURE);
  await expect
    .poll(async () => (await readFrames(ext, tabId)).length, { timeout: 15_000 })
    .toBe(2);

  const outcome = await ext.ext.evaluate(async (tid) => {
    const send = async (frameId: number): Promise<string> => {
      try {
        await chrome.tabs.sendMessage(tid, { type: "PIP_COORD", isWinner: false }, { frameId });
        return "RESOLVED";
      } catch (e) {
        return String((e as Error)?.message ?? e);
      }
    };
    return { live: await send(0), neverExisted: await send(99_999) };
  }, tabId);

  const ctx = `\n  ${JSON.stringify(outcome)}\n`;
  // The live frame is the control: if this ever stopped resolving, the
  // rejection below would prove nothing about the frameId being dead.
  expect(outcome.live, ctx).toBe("RESOLVED");
  expect(outcome.neverExisted, ctx).toContain(
    "Could not establish connection. Receiving end does not exist."
  );

  await page.close();
});

test("the verdict is delivered without the `tabs` permission", async () => {
  // THE PRECONDITION THAT MAKES THE DESIGN LEGAL. chrome.tabs.sendMessage with
  // { frameId } needs a HOST permission for the tab, not the "tabs" permission
  // — and the three-permission allowlist (R-04, test/manifest.test.ts) is the
  // product's central claim. If this ever started needing "tabs", arbitration
  // would have to be redesigned rather than quietly given a fourth permission.
  //
  // Asserted here, in the browser that just delivered a verdict above, so the
  // claim is measured against the running extension rather than read off the
  // manifest file.
  const perms = await ext.ext.evaluate(() => chrome.permissions.getAll());
  expect(perms.permissions, `\n  ${JSON.stringify(perms)}\n`).not.toContain("tabs");
  expect(perms.permissions?.slice().sort(), `\n  ${JSON.stringify(perms)}\n`).toEqual([
    "activeTab",
    "scripting",
    "storage",
  ]);
});
