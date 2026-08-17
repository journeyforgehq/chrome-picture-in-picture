/* ============================================================================
 * The enhanced window's CLOSE path — and the one message it has to send.
 * ============================================================================
 *
 * WHAT BREAKS WITHOUT THIS. The worker records `activePip` when it opens the
 * enhanced window and reads it on the next toolbar click to decide between
 * "open" and "exit". Nothing in Chrome tells the worker that a Document PiP
 * window went away: the user can close it, a navigation can take it, or Chrome
 * can replace it with another PiP surface, and in every one of those cases the
 * worker still believes a window is open. The next click then takes the EXIT
 * branch against a window that no longer exists and the user's click does
 * NOTHING — a dead toolbar button, with no error and no toast to explain it.
 * So the page has to tell the worker, and `pagehide` on the PiP window is the
 * only event that fires for all three of those cases.
 *
 * ORDERING IS THE POINT OF THE THIRD TEST. Restoring the user's video is what
 * the user can SEE; the message is bookkeeping. A worker that has been
 * terminated makes sendMessage reject with "Could not establish connection" —
 * routine, not exceptional — and if that rejection were allowed to unwind
 * before the video moved, the page would be left with its <video> stranded
 * inside a window that is closing. The video therefore goes home FIRST and the
 * message is attempted after, wrapped.
 *
 * fakeWin() is copied from enhance.test.ts rather than shared, INCLUDING its
 * `CSSStyleSheet` property — see the header there. Without that property the
 * fake silently takes the <style> fallback and adopts nothing.
 * ==========================================================================*/
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enhanceWindow } from "../../src/pip/enhance";
import { PIP_DPIP_CLOSED, PIP_GEOMETRY_CHANGED } from "../../src/pip/messages";

/** Every `{ type: "..." }` enhance.ts SHIPS, in source order. Reads the source
 *  rather than calling the function because each send sits inside a branch that
 *  needs a whole DOM, a chrome stub and a timer to reach — and because the
 *  property being pinned is textual: what gets serialized into the page. */
function shippedMessageTypes(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../../src/pip/enhance.ts"), "utf8");
  return Array.from(src.matchAll(/sendMessage\(\s*\{\s*type:\s*"([^"]+)"/g)).map((m) => m[1]);
}

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
    addEventListener: vi.fn(),
    close: vi.fn(),
    __adopted: adopted,
  };
}

const BARE = { inWindowControls: false, subtitles: false };

/* BY NAME, NOT BY INDEX. `pagehide` happens to be the first listener registered
 * on the window today, so `mock.calls[0]` would work — and would keep "working"
 * the day Task 12 adds a `resize` listener ahead of it, silently reading the
 * WRONG handler and asserting nothing about close at all. A lookup that fails
 * loudly when the event is missing is the only version of this that stays
 * honest. */
function pagehideHandler(win: ReturnType<typeof fakeWin>): () => void {
  const call = win.addEventListener.mock.calls.find((c) => c[0] === "pagehide");
  expect(call, "no pagehide listener was registered on the PiP window").toBeTruthy();
  return call![1] as () => void;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"><video id="v"></video></div>';
  delete (window as unknown as { __pipHome?: unknown }).__pipHome;
  delete (window as unknown as { __pipWin?: unknown }).__pipWin;
});

afterEach(() => {
  // The fake `chrome` is global state; leaving it set would let one test's
  // stub answer another test's call.
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("enhanced-window lifecycle", () => {
  it("registers a pagehide handler that restores the video", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ win: win as never, opts: BARE });
    expect(win.document.contains(video)).toBe(true);
    pagehideHandler(win)();
    expect(document.getElementById("host")!.contains(video)).toBe(true);
  });

  it("tells the worker the window closed, so activePip cannot go stale", () => {
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    pagehideHandler(win)();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: PIP_DPIP_CLOSED }));
  });

  it("sends nothing when there is no extension context to send to", () => {
    // `chrome.runtime` is absent in a plain page and `.id` goes undefined the
    // moment the extension is updated or reloaded mid-session. Both must be
    // survivable: a TypeError here would run INSTEAD of the restore that has
    // not happened yet in the ordering this function guarantees.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    (globalThis as { chrome?: unknown }).chrome = { runtime: {} };
    enhanceWindow({ win: win as never, opts: BARE });
    expect(() => pagehideHandler(win)()).not.toThrow();
    expect(document.getElementById("host")!.contains(video)).toBe(true);
  });

  it("still restores the video when sendMessage rejects (worker asleep)", () => {
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: { id: "x", sendMessage: () => Promise.reject(new Error("no receiving end")) },
    };
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ win: win as never, opts: BARE });
    expect(() => pagehideHandler(win)()).not.toThrow();
    expect(document.getElementById("host")!.contains(video)).toBe(true);
  });

  it("still restores the video when sendMessage THROWS synchronously", () => {
    // The callback form of sendMessage throws synchronously when the context is
    // invalidated rather than rejecting. Same requirement, different shape.
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        id: "x",
        sendMessage: () => {
          throw new Error("Extension context invalidated.");
        },
      },
    };
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ win: win as never, opts: BARE });
    expect(() => pagehideHandler(win)()).not.toThrow();
    expect(document.getElementById("host")!.contains(video)).toBe(true);
  });

  it("is idempotent — pagehide can fire twice and the video comes home ONCE", () => {
    /* Not hypothetical: `restore` is registered on pagehide AND returned to the
     * worker, so a close that also triggers an explicit teardown runs it twice.
     * The second run finds `__pipHome` already deleted — so it must neither
     * throw on the missing record nor fall through to the
     * `document.body.appendChild` branch, which would MOVE an already-restored
     * video out of the site's player and into the end of the body. That is a
     * visible, permanent regression on the user's page, produced by the very
     * function whose job is to prevent one. */
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ win: win as never, opts: BARE });
    const handler = pagehideHandler(win);
    handler();
    expect(() => handler()).not.toThrow();
    const host = document.getElementById("host")!;
    expect(host.contains(video)).toBe(true);
    expect(document.querySelectorAll("video").length).toBe(1);
  });

  it("does not message the worker on a restore that moved nothing", () => {
    // enhanceWindow bailed (no window, no video, already enhanced): no window
    // was ever opened by THIS call, so reporting one closed would clear an
    // activePip record that belongs to a window still on screen.
    const sendMessage = vi.fn();
    (globalThis as { chrome?: unknown }).chrome = { runtime: { id: "x", sendMessage } };
    const api = enhanceWindow({ win: null, opts: BARE });
    api.restore();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("the message contract — one string, two spellings, twice over", () => {
  it("the DPIP_CLOSED literal enhance.ts SHIPS equals the constant background.ts IMPORTS", () => {
    /* enhance.ts is serialized with Function.prototype.toString() and evaluated
     * in the page, so it may not reference the exported constant (rule 1) — it
     * inlines the string. That is two spellings of one contract, exactly the
     * duplication Task 8 flagged for geometry.ts: change one and the worker
     * simply stops hearing about closed windows, with every test still green
     * and the only symptom a toolbar button that intermittently does nothing. */
    const types = shippedMessageTypes();
    expect(types.length, 'enhance.ts sends no { type: "..." } message at all').toBeGreaterThan(0);
    expect(types).toContain(PIP_DPIP_CLOSED);
  });

  it("the GEOMETRY_CHANGED literal enhance.ts SHIPS equals the constant background.ts IMPORTS", () => {
    /* The same duplication, one release later, and its failure is quieter still:
     * misspell this literal and resizes are simply never persisted. Nothing
     * errors, the window still opens, and the paid promise — "remembers the size
     * for each site" — just stops being true. */
    expect(shippedMessageTypes()).toContain(PIP_GEOMETRY_CHANGED);
  });

  it("ships NO OTHER message type — a third one would escape both checks above", () => {
    /* `toContain` can only police the strings it is told about. Without this,
     * the next inlined send would be pinned by nothing at all, which is exactly
     * how the first two came to need pinning. Adding a type here is a two-line
     * change; forgetting to is a silent contract break. */
    expect(new Set(shippedMessageTypes())).toEqual(
      new Set([PIP_DPIP_CLOSED, PIP_GEOMETRY_CHANGED])
    );
  });

  it("enhance.ts still imports nothing at runtime", () => {
    // The reason the literal is inlined in the first place. A runtime import
    // here would drag ./state — and therefore storage.session, which is closed
    // to content scripts (S-07) — into the content chunk.
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../src/pip/enhance.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)/m);
  });
});
