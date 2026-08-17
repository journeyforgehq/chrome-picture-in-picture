/* ============================================================================
 * The WRITE half of per-origin size memory: the user drags, we remember.
 * ============================================================================
 *
 * WHAT IS BEING PINNED, AND WHY EACH ASSERTION EXISTS.
 *
 * 1. THE CONTENT SIZE, NEVER THE OUTER SIZE. Spike S-12 measured that
 *    requestWindow({width,height}) does NOT size the content box: `outer` comes
 *    back at requested + 34 (the title bar) and `inner` is short by a
 *    VERSION-DEPENDENT amount (-52 on Chromium 131, -56 on Chrome 151, 0 on the
 *    bundled build), which entry.ts corrects with one resizeBy at open time.
 *    So `inner` is what the user chose and `outer` is what the browser added.
 *    Store `outer` and every reopen re-adds the chrome height on top of a size
 *    that already contained it — the window creeps larger every single time the
 *    user opens it, on the sites they use most. That is the bug this test
 *    exists to make impossible, which is why it asserts the numbers rather than
 *    merely that a message was sent.
 *
 * 2. ONE DRAG IS ONE WRITE. A drag fires `resize` continuously — tens of events
 *    per second. Every one of them is a structured-clone message that WAKES THE
 *    SERVICE WORKER and, unthrottled, a read-modify-write on one storage key.
 *    Same shape and same reason as content.ts's SCORE_THROTTLE_MS, and trailing
 *    edge for the same reason too: the last state in a burst — the size the user
 *    actually let go at — is the one that has to be stored.
 *
 * 3. NOTHING AFTER THE WINDOW IS GONE. `restore` runs on pagehide, i.e. exactly
 *    when the window is closing, and a drag immediately before that close leaves
 *    a timer armed for 500ms into the future. Firing it would write a size for a
 *    window nobody can see, and would report it against whatever origin the page
 *    has by then.
 *
 * fakeWin() is copied from enhance.test.ts rather than shared, INCLUDING its
 * `CSSStyleSheet` property — see the header there. Without that property the
 * fake silently takes the <style> fallback and adopts nothing.
 * ==========================================================================*/
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enhanceWindow } from "../../src/pip/enhance";
import { PIP_GEOMETRY_CHANGED } from "../../src/pip/messages";

function fakeWin() {
  const doc = document.implementation.createHTMLDocument("pip");
  const adopted: unknown[] = [];
  Object.defineProperty(doc, "adoptedStyleSheets", {
    get: () => adopted,
    set: (v) => {
      adopted.length = 0;
      adopted.push(...v);
    },
    configurable: true,
  });
  return {
    document: doc,
    // See note 1 in test/pip/enhance.test.ts's header. A PiP Window has this;
    // a bare object literal does not, and without it this fake silently
    // measures the fallback branch.
    CSSStyleSheet: globalThis.CSSStyleSheet,
    innerWidth: 400,
    innerHeight: 225,
    // The OUTER size the browser reports for that content box (S-12: content
    // + 34px of title bar). Present ONLY so a mistake here is measurable: if
    // the implementation ever reaches for `outer`, the assertions below see
    // 434/259 instead of the numbers the user chose.
    outerWidth: 434,
    outerHeight: 259,
    addEventListener: vi.fn(),
    close: vi.fn(),
    __adopted: adopted,
  };
}

const BARE = { inWindowControls: false, subtitles: false };

/* BY NAME, NOT BY INDEX — the same rule enhance-lifecycle.test.ts states for
 * `pagehide`, and now with two listeners on the window it is load-bearing in
 * both directions: an index lookup here would read the pagehide handler and
 * "pass" while asserting nothing about resize at all. */
function resizeHandler(win: ReturnType<typeof fakeWin>): () => void {
  const call = win.addEventListener.mock.calls.find((c) => c[0] === "resize");
  expect(call, "no resize listener was registered on the PiP window").toBeTruthy();
  return call![1] as () => void;
}

function pagehideHandler(win: ReturnType<typeof fakeWin>): () => void {
  const call = win.addEventListener.mock.calls.find((c) => c[0] === "pagehide");
  expect(call, "no pagehide listener was registered on the PiP window").toBeTruthy();
  return call![1] as () => void;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="host"><video id="v"></video></div>';
  delete (window as unknown as { __pipHome?: unknown }).__pipHome;
  delete (window as unknown as { __pipWin?: unknown }).__pipWin;
});

afterEach(() => {
  vi.useRealTimers();
  // The fake `chrome` is global state; leaving it set would let one test's stub
  // answer another test's call.
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("resize persistence", () => {
  it("registers a resize listener on the PiP window", () => {
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    expect(win.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("reports the CONTENT size, not the outer size", () => {
    // S-12: outer carries a 34px title bar plus more. Storing outer would make
    // every reopen grow the window by the chrome height, compounding each time.
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });

    const resize = resizeHandler(win);
    win.innerWidth = 512;
    win.innerHeight = 288;
    resize();
    vi.advanceTimersByTime(600);

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PIP_GEOMETRY_CHANGED,
        w: 512,
        h: 288,
        origin: location.origin,
      })
    );
  });

  it("debounces a drag into ONE message, not one per frame", () => {
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    const resize = resizeHandler(win);

    for (let i = 0; i < 40; i++) {
      win.innerHeight = 200 + i;
      resize();
    }
    vi.advanceTimersByTime(600);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("stores the size the drag ENDED at — the trailing edge, not the first frame", () => {
    // A leading-edge debounce would record the size the window had when the
    // user grabbed the corner and never correct it, so the next open would
    // reproduce the size they were trying to get away from.
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    const resize = resizeHandler(win);

    for (let i = 0; i < 10; i++) {
      win.innerHeight = 300 + i * 10;
      resize();
    }
    vi.advanceTimersByTime(600);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ h: 390 }));
  });

  it("sends nothing until the drag has actually stopped", () => {
    // The gap between the last resize event and the write is what makes one
    // drag one write; without it this test's message would already be out.
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    resizeHandler(win)();
    vi.advanceTimersByTime(100);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("sends NOTHING for a resize that arrives after restore — the window is gone", () => {
    /* Not hypothetical: `resize` and `pagehide` both fire while a window is
     * being torn down, and the ordering between them is the browser's business,
     * not ours. A write here records a size for a window nobody can see, keyed
     * on whatever origin the page has by then. */
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    const api = enhanceWindow({ win: win as never, opts: BARE });
    const resize = resizeHandler(win);

    api.restore();
    sendMessage.mockClear(); // restore itself sends PIP_DPIP_CLOSED
    resize();
    vi.advanceTimersByTime(600);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("cancels a drag that was still pending when the window closed", () => {
    /* THE CASE THE PLAN'S SNIPPET MISSED. Let go of the corner and hit the
     * close button inside half a second — a completely ordinary thing to do —
     * and a timer is already armed. Guarding the handler is not enough: this
     * timer was scheduled BEFORE restore ran, so only cancelling it inside
     * restore can stop it. */
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });

    resizeHandler(win)(); // the drag ends...
    vi.advanceTimersByTime(100); // ...and 100ms later the user closes the window
    pagehideHandler(win)();
    sendMessage.mockClear();
    vi.advanceTimersByTime(600);

    expect(
      sendMessage,
      "a timer armed before the window closed still fired against it"
    ).not.toHaveBeenCalled();
  });

  it("does not throw when sendMessage REJECTS (worker asleep)", () => {
    // Same requirement, and the same two shapes, as the PIP_DPIP_CLOSED send in
    // restore: the promise form rejects, and an unhandled rejection from a timer
    // is a page-level error in the user's console for a bookkeeping write.
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { id: "x", sendMessage: () => Promise.reject(new Error("no receiving end")) },
    };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    resizeHandler(win)();
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
  });

  it("does not throw when sendMessage THROWS synchronously (context invalidated)", () => {
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        id: "x",
        sendMessage: () => {
          throw new Error("Extension context invalidated.");
        },
      },
    };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    resizeHandler(win)();
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
  });

  it("does not throw when there is no extension context at all", () => {
    // `chrome.runtime` is absent in a plain page and `.id` goes undefined the
    // moment the extension is updated or reloaded mid-session.
    (globalThis as { chrome?: unknown }).chrome = { runtime: {} };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    resizeHandler(win)();
    expect(() => vi.advanceTimersByTime(600)).not.toThrow();
  });

  it("registers no resize listener when there was nothing to enhance", () => {
    // enhanceWindow bailed (no video on the page): no window was decorated by
    // THIS call, so it has no business reporting sizes for one.
    document.body.innerHTML = '<div id="host"></div>';
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    const call = win.addEventListener.mock.calls.find((c) => c[0] === "resize");
    expect(call).toBeUndefined();
  });
});
