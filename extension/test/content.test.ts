import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installContentScript,
  localScore,
  PIP_COORD,
  PIP_SCORE_REPORT,
  PIP_SCORE_REQUEST,
  SCORE_THROTTLE_MS,
} from "../src/content/content";

/* ============================================================================
 * The content script is the WRITE side of frame arbitration.
 * ============================================================================
 *
 * pipEntry (src/pip/entry.ts) reads window.__pipCoord synchronously, inside a
 * click gesture that cannot afford a single await. Everything expensive —
 * scoring, messaging the worker, waiting for a verdict — has to have already
 * happened by then. That is this file's subject.
 *
 * Two properties here are not stylistic:
 *
 *   1. ONE listener, no matter how many times the file body runs. A spike
 *      measured that scripting.executeScript and registerContentScripts share
 *      ONE isolated world per frame and that the file body is re-evaluated on
 *      every injection — three injections, three evaluations. Without a guard
 *      above addListener, that frame answers every message three times.
 *
 *   2. __pipCoord is seeded SYNCHRONOUSLY on install. A page that just loaded
 *      has not coordinated yet; if the seed were deferred until the worker
 *      replied, every frame would be unarbitrated in the meantime and a click
 *      in that window would put all of them into the race the spike measured.
 * ==========================================================================*/

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
) => unknown;

let listeners: Listener[];
let sendMessage: ReturnType<typeof vi.fn>;
let addListener: ReturnType<typeof vi.fn>;
/**
 * happy-dom hands every test in this file the SAME document, and the installer
 * has no uninstall (it deliberately has none — see the guard). Without
 * unwinding its document listeners here, install #7 fires seven reporters and
 * the throttle assertions measure the accumulation instead of the throttle.
 */
let docListeners: Array<[string, EventListenerOrEventListenerObject, unknown]>;

/** Build a <video> happy-dom will let pipEntry score: it fakes none of these. */
function makeScorableVideo(): HTMLVideoElement {
  const el = document.createElement("video");
  const def = (name: string, value: unknown) =>
    Object.defineProperty(el, name, { value, configurable: true });
  def("readyState", 4);
  def("videoWidth", 640);
  def("videoHeight", 360);
  def("duration", 600);
  def("paused", false);
  def("muted", false);
  def("getBoundingClientRect", () => ({
    width: 640,
    height: 360,
    top: 0,
    left: 0,
    right: 640,
    bottom: 360,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  listeners = [];
  sendMessage = vi.fn(() => Promise.resolve(undefined));
  addListener = vi.fn((l: Listener) => {
    listeners.push(l);
  });
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      id: "test-extension-id",
      onMessage: { addListener },
      sendMessage,
    },
  };
  delete window.__pipInjected;
  delete window.__pipCoord;
  document.body.innerHTML = "";

  // DECLARED environment fakes, not assumptions: happy-dom implements neither
  // of these, and pipEntry returns `pip-unavailable` before scoring anything
  // when pictureInPictureEnabled is falsy. Chrome sets it true on every
  // ordinary page. (Verified: with it set, pipEntry scores the video below at
  // 2000 — playing 1000 + unmuted 200 + fully visible 500 + area 300.)
  Object.defineProperty(document, "pictureInPictureEnabled", {
    value: true,
    configurable: true,
  });

  docListeners = [];
  const realAdd = document.addEventListener.bind(document);
  vi.spyOn(document, "addEventListener").mockImplementation((t, l, o) => {
    docListeners.push([t as string, l as EventListenerOrEventListenerObject, o]);
    realAdd(t as string, l as EventListenerOrEventListenerObject, o as AddEventListenerOptions);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [t, l, o] of docListeners) {
    document.removeEventListener(t, l, o as AddEventListenerOptions);
  }
  vi.useRealTimers();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("installContentScript — idempotency guard", () => {
  // A spike measured that scripting.executeScript and registerContentScripts share
  // ONE isolated world per extension per frame, and that the file body runs on EVERY
  // injection: three injections produced three evaluations. Without a guard above
  // the listener registration, that frame would hold three onMessage listeners and
  // answer every message three times.
  it("registers exactly ONE onMessage listener across three installs", () => {
    installContentScript();
    installContentScript();
    installContentScript();
    expect(addListener).toHaveBeenCalledTimes(1);
  });

  it("sets the __pipInjected flag, which is what makes re-entry a no-op", () => {
    installContentScript();
    expect(window.__pipInjected).toBe(true);
  });

  it("attaches its media-event listeners only once", () => {
    installContentScript();
    const after1 = docListeners.length;
    installContentScript();
    installContentScript();
    expect(docListeners.length).toBe(after1);
  });

  it("reports its score to the worker only once, not once per install", () => {
    installContentScript();
    installContentScript();
    installContentScript();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("installContentScript — __pipCoord seeding", () => {
  it("seeds __pipCoord IMMEDIATELY, before any round trip to the worker", () => {
    installContentScript();
    const coord = window.__pipCoord!;
    expect(coord).toBeDefined();
    expect(typeof coord.updatedAt).toBe("number");
  });

  it("seeds isWinner=true in the top frame (window === window.top)", () => {
    expect(window === window.top).toBe(true);
    installContentScript();
    const coord = window.__pipCoord as { isWinner: boolean };
    expect(coord.isWinner).toBe(true);
  });

  it("a PIP_COORD verdict of isWinner:false overwrites the seed", () => {
    installContentScript();
    expect(
      (window.__pipCoord as { isWinner: boolean }).isWinner
    ).toBe(true);

    const sendResponse = vi.fn();
    listeners[0]({ type: PIP_COORD, isWinner: false }, {}, sendResponse);

    const coord = window.__pipCoord as { isWinner: boolean };
    expect(coord.isWinner).toBe(false);
  });

  it("a PIP_COORD verdict of isWinner:true restores a stood-down frame", () => {
    installContentScript();
    const sendResponse = vi.fn();
    listeners[0]({ type: PIP_COORD, isWinner: false }, {}, sendResponse);
    listeners[0]({ type: PIP_COORD, isWinner: true }, {}, sendResponse);
    expect(
      (window.__pipCoord as { isWinner: boolean }).isWinner
    ).toBe(true);
  });
});

describe("installContentScript — PIP_SCORE_REQUEST", () => {
  it("replies with the frame's local score", () => {
    makeScorableVideo();
    installContentScript();
    const sendResponse = vi.fn();
    listeners[0]({ type: PIP_SCORE_REQUEST }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledTimes(1);
    const reply = sendResponse.mock.calls[0][0] as { score: number | null };
    expect(typeof reply.score).toBe("number");
    expect(reply.score).toBe(localScore());
  });

  it("replies with score null when the frame has no candidate", () => {
    installContentScript();
    const sendResponse = vi.fn();
    listeners[0]({ type: PIP_SCORE_REQUEST }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ score: null });
  });

  it("ignores message types it does not own", () => {
    installContentScript();
    const sendResponse = vi.fn();
    listeners[0]({ type: "SOMETHING_ELSE" }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe("localScore", () => {
  it("is null when the frame has no candidate video", () => {
    expect(localScore()).toBeNull();
  });

  it("is a number when the frame holds a scorable video", () => {
    makeScorableVideo();
    expect(typeof localScore()).toBe("number");
  });

  it("still scores when __pipCoord marks this frame a LOSER", () => {
    // The write side must not be silenced by the read side's verdict. pipEntry
    // returns `not-winner` the moment __pipCoord.isWinner is false, so a naive
    // caller would report null forever and could never win back the tab.
    makeScorableVideo();
    window.__pipCoord = { isWinner: false, updatedAt: 0 };
    expect(typeof localScore()).toBe("number");
    // ...and it leaves the verdict exactly as it found it.
    expect(
      (window.__pipCoord as { isWinner: boolean }).isWinner
    ).toBe(false);
  });
});

describe("score reporting to the worker", () => {
  it("reports once on install", () => {
    installContentScript();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toMatchObject({ type: PIP_SCORE_REPORT });
  });

  it("throttles a burst of media events into ONE extra message", () => {
    vi.useFakeTimers();
    installContentScript();
    sendMessage.mockClear();

    const video = makeScorableVideo();
    for (let i = 0; i < 25; i++) {
      video.dispatchEvent(new Event("play"));
      video.dispatchEvent(new Event("pause"));
    }
    // Nothing yet: the leading edge was spent by the install report.
    expect(sendMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(SCORE_THROTTLE_MS + 10);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("reports again after the throttle window elapses", () => {
    vi.useFakeTimers();
    installContentScript();
    sendMessage.mockClear();

    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(SCORE_THROTTLE_MS + 10);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(SCORE_THROTTLE_MS + 10);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("survives sendMessage rejecting (worker asleep / context invalidated)", () => {
    sendMessage.mockImplementation(() => Promise.reject(new Error("no receiving end")));
    expect(() => installContentScript()).not.toThrow();
  });
});
