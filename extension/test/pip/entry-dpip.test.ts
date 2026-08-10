/* ============================================================================
 * pipEntry — the ENHANCED WINDOW (Pro). S-12 is what this file exists for.
 * ============================================================================
 * documentPictureInPicture.requestWindow({width, height}) does NOT size the
 * content box. Measured at three sizes, sampled to settling, in two browsers:
 *
 *              requested   outer          inner
 *   Chromium 131  w x h    w x (h + 34)   w x (h - 52)
 *   Chrome 151    w x h    w x (h + 34)   w x (h - 56)
 *
 * Width is exact. Height is short, and the shortfall MOVES BETWEEN CHROME
 * BUILDS — so no compile-time constant can compensate for it. The window has to
 * be measured after it opens and corrected once. (Amendment A-03; the design
 * package's original "inner === requested, 0x0 stolen" claim was wrong.)
 *
 * ONE resize per user activation: a second resizeTo/resizeBy throws
 * "NotAllowedError: resizeTo() requires user activation in document
 * picture-in-picture". The correction spends it.
 * ==========================================================================*/
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pipEntry } from "../../src/pip/entry";
import type { PipEntryResult } from "../../src/pip/entry";
import type { PipPrefs } from "../../src/pip/prefs";

const PRO: PipPrefs = {
  tier: "pro",
  enhancedWindow: true,
  windowSize: "medium",
  rememberSizePerSite: true,
  inWindowControls: true,
  subtitles: false,
  geometry: {},
};

/** A scorable <video>, built the way test/pip/entry.test.ts builds one — happy-dom
 *  simulates none of these media properties, and it has no layout engine, so the
 *  rect is stubbed too. `requestPictureInPicture` is stubbed PER ELEMENT because
 *  happy-dom implements no such method at all: without it the native fallback
 *  case below would take the synchronous-TypeError branch and prove nothing. */
function makeScorableVideo(label = "v") {
  const v = document.createElement("video");
  const w = 640;
  const h = 360;
  Object.defineProperty(v, "videoWidth", { value: w, configurable: true });
  Object.defineProperty(v, "videoHeight", { value: h, configurable: true });
  Object.defineProperty(v, "readyState", { value: 2, configurable: true });
  Object.defineProperty(v, "paused", { value: false, configurable: true });
  Object.defineProperty(v, "duration", { value: 600, configurable: true });
  Object.defineProperty(v, "muted", { value: false, configurable: true });
  v.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h }) as DOMRect;
  v.dataset.label = label;
  (v as unknown as Record<string, unknown>).requestPictureInPicture = vi.fn(() =>
    Promise.resolve()
  );
  document.body.append(v);
  return v as HTMLVideoElement & { requestPictureInPicture: ReturnType<typeof vi.fn> };
}

/** A fake PiP window that under-reports its content height exactly the way
 *  Chrome does (S-12: inner = requested - 52 on Chromium 131, -56 on Chrome
 *  151), so the correction is exercised rather than assumed. */
function fakePipWindow(requested: { w: number; h: number }, deficit = 52) {
  const win = {
    innerWidth: requested.w,
    innerHeight: requested.h - deficit,
    outerWidth: requested.w,
    outerHeight: requested.h + 34,
    document: document.implementation.createHTMLDocument("pip"),
    resizeBy: vi.fn((_dx: number, dy: number) => {
      win.innerHeight += dy;
      win.outerHeight += dy;
    }),
    addEventListener: vi.fn(),
    close: vi.fn(),
  };
  return win;
}

beforeEach(() => {
  document.body.innerHTML = "";
  delete (window as any).__pipCoord;
  Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true });
  delete (window as any).__pipWin;
});

// Both stubs live on the shared window. Leaving either in place would change the
// environment for every test file that runs after this one.
afterEach(() => {
  delete (window as any).documentPictureInPicture;
  delete (window as any).__pipWin;
});

describe("pipEntry — the enhanced window", () => {
  it("corrects the content box to the size that was actually asked for", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 });
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    const r = (await pipEntry({ prefs: PRO })) as PipEntryResult;

    expect(r.mode).toBe("document");
    expect(r.outcome).toBe("PIP_OK");
    // The measurement, not a constant: requested 225, reported 173, so +52.
    expect(win.resizeBy).toHaveBeenCalledWith(0, 52);
    expect(win.innerHeight).toBe(225);
  });

  it("computes the deficit at runtime, so a different Chrome build still lands exact", async () => {
    // Chrome 151 reports -56. A hardcoded 52 would leave this window 4px short.
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 }, 56);
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    await pipEntry({ prefs: PRO });
    expect(win.resizeBy).toHaveBeenCalledWith(0, 56);
    expect(win.innerHeight).toBe(225);
  });

  it("never calls resize twice — one resize is all the activation permits", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 });
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    await pipEntry({ prefs: PRO });
    expect(win.resizeBy).toHaveBeenCalledTimes(1);
  });

  it("does not resize at all when the window already came back exact", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 }, 0);
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    await pipEntry({ prefs: PRO });
    expect(win.resizeBy).not.toHaveBeenCalled();
  });

  it("survives a window that refuses the resize, rather than losing it", async () => {
    // A second activation-spending call throws NotAllowedError. If the browser
    // ever refuses ours, a slightly-short window still beats no window at all.
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 });
    win.resizeBy.mockImplementation(() => {
      throw new DOMException("resizeTo() requires user activation", "NotAllowedError");
    });
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    const r = (await pipEntry({ prefs: PRO })) as PipEntryResult;
    expect(r.mode).toBe("document");
    expect(r.outcome).toBe("PIP_OK");
    expect((window as any).__pipWin).toBe(win);
  });

  it("stashes the handle so the decorate injection can find it", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 });
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    await pipEntry({ prefs: PRO });
    expect((window as any).__pipWin).toBe(win);
  });

  it("paints the window black immediately, so no white rectangle is ever shown", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 });
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    await pipEntry({ prefs: PRO });
    expect(win.document.body.style.background).toBe("#000");
  });

  it("asks for the preset the user chose", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 320, h: 180 });
    const requestWindow = vi.fn(async () => win);
    (window as any).documentPictureInPicture = { requestWindow };

    await pipEntry({ prefs: { ...PRO, windowSize: "small" } });
    expect(requestWindow).toHaveBeenCalledWith({ width: 320, height: 180 });
  });

  it("uses the remembered size for this origin, not the preset", async () => {
    makeScorableVideo();
    const win = fakePipWindow({ w: 640, h: 360 });
    const requestWindow = vi.fn(async () => win);
    (window as any).documentPictureInPicture = { requestWindow };

    await pipEntry({ prefs: { ...PRO, geometry: { [location.origin]: { w: 640, h: 360 } } } });
    expect(requestWindow).toHaveBeenCalledWith({ width: 640, height: 360 });
  });

  it("clamps a hand-edited or corrupt stored size instead of forwarding it", async () => {
    // geometry survives browser upgrades, screen changes and hand-editing; a 0x0
    // or NaN size reaches requestWindow otherwise. Same bounds as geometry.ts.
    makeScorableVideo();
    const win = fakePipWindow({ w: 240, h: 135 });
    const requestWindow = vi.fn(async () => win);
    (window as any).documentPictureInPicture = { requestWindow };

    await pipEntry({
      prefs: { ...PRO, geometry: { [location.origin]: { w: 0, h: NaN } } },
    });
    expect(requestWindow).toHaveBeenCalledWith({ width: 240, height: 135 });
  });

  it("opens NO native window when the enhanced one succeeded", async () => {
    // Two windows for one click was the failure this branch has to avoid: the
    // document branch replaces the native call, it does not precede it.
    const video = makeScorableVideo();
    const win = fakePipWindow({ w: 400, h: 225 });
    (window as any).documentPictureInPicture = { requestWindow: vi.fn(async () => win) };

    await pipEntry({ prefs: PRO });
    expect(video.requestPictureInPicture).not.toHaveBeenCalled();
  });

  it("falls back to a native window when requestWindow rejects, in the same click", async () => {
    const video = makeScorableVideo();
    (window as any).documentPictureInPicture = {
      requestWindow: vi.fn(async () => {
        throw new DOMException("nope", "NotAllowedError");
      }),
    };

    const r = (await pipEntry({ prefs: PRO })) as PipEntryResult;
    expect(video.requestPictureInPicture).toHaveBeenCalled();
    expect(r.mode).toBe("native");
    expect(r.fellBackFrom).toBe("document");
  });

  it("falls back to native when requestWindow THROWS synchronously", async () => {
    const video = makeScorableVideo();
    (window as any).documentPictureInPicture = {
      requestWindow: vi.fn(() => {
        throw new TypeError("no");
      }),
    };

    const r = (await pipEntry({ prefs: PRO })) as PipEntryResult;
    expect(video.requestPictureInPicture).toHaveBeenCalled();
    expect(r.mode).toBe("native");
    expect(r.fellBackFrom).toBe("document");
  });

  it("reports a native failure that FOLLOWED a document fallback as both", async () => {
    // The toast has to name the error the user actually hit, and the telemetry
    // has to still show that the enhanced window was tried first.
    const video = makeScorableVideo();
    video.requestPictureInPicture.mockImplementation(() =>
      Promise.reject(new DOMException("x", "SecurityError"))
    );
    (window as any).documentPictureInPicture = {
      requestWindow: vi.fn(async () => {
        throw new DOMException("nope", "NotAllowedError");
      }),
    };

    const r = (await pipEntry({ prefs: PRO })) as PipEntryResult;
    expect(r.mode).toBe("native");
    expect(r.outcome).toBe("THREW");
    expect(r.errorName).toBe("SecurityError");
    expect(r.fellBackFrom).toBe("document");
  });

  it("never enters the document branch for a free user", async () => {
    const video = makeScorableVideo();
    const requestWindow = vi.fn(async () => fakePipWindow({ w: 400, h: 225 }));
    (window as any).documentPictureInPicture = { requestWindow };

    const r = (await pipEntry({ prefs: { ...PRO, tier: "free" } })) as PipEntryResult;
    expect(requestWindow).not.toHaveBeenCalled();
    expect(video.requestPictureInPicture).toHaveBeenCalled();
    expect(r.mode).toBe("native");
    expect(r.fellBackFrom).toBeUndefined();
  });
});
