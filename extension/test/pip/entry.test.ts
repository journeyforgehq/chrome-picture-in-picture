import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pipEntry } from "../../src/pip/entry";

/** Build a <video> whose media properties happy-dom does not simulate. */
function video(opts: {
  w?: number; h?: number; paused?: boolean; muted?: boolean;
  duration?: number; readyState?: number; label: string; disablePip?: boolean;
}) {
  const v = document.createElement("video");
  const { w = 640, h = 360 } = opts;
  Object.defineProperty(v, "videoWidth", { value: w, configurable: true });
  Object.defineProperty(v, "videoHeight", { value: h, configurable: true });
  Object.defineProperty(v, "readyState", { value: opts.readyState ?? 2, configurable: true });
  Object.defineProperty(v, "paused", { value: opts.paused ?? false, configurable: true });
  Object.defineProperty(v, "duration", { value: opts.duration ?? 600, configurable: true });
  Object.defineProperty(v, "muted", { value: opts.muted ?? false, configurable: true });
  v.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h } as DOMRect);
  if (opts.disablePip) v.setAttribute("disablepictureinpicture", "");
  v.dataset.label = opts.label;
  document.body.append(v);
  return v;
}

beforeEach(() => {
  document.body.innerHTML = "";
  delete (window as any).__pipCoord;
  Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true });
});

describe("pipEntry — scoring", () => {
  it("lets a small PLAYING video beat a large PAUSED one", () => {
    video({ label: "small-playing", w: 200, h: 120, paused: false });
    video({ label: "big-paused", w: 1600, h: 900, paused: true });
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("small-playing");
  });

  it("prefers unmuted content over a large muted 10s advert", () => {
    video({ label: "ad", w: 1280, h: 720, muted: true, duration: 10 });
    video({ label: "content", w: 640, h: 360, muted: false, duration: 600 });
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("content");
  });

  it("keeps a live stream — duration Infinity must survive the >5s filter", () => {
    video({ label: "live", duration: Infinity });
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("live");
  });

  it("drops a 3s muted hero loop and reports none-found", () => {
    video({ label: "hero", w: 1600, h: 600, muted: true, duration: 3 });
    const r = pipEntry({ dryRun: true });
    expect(r.winner).toBeNull();
    expect(r.reason).toBe("none-found");
  });

  it("includes a video at exactly 100x100 and excludes 99x99", () => {
    video({ label: "at-boundary", w: 100, h: 100 });
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("at-boundary");
    document.body.innerHTML = "";
    video({ label: "below-boundary", w: 99, h: 99 });
    expect(pipEntry({ dryRun: true }).winner).toBeNull();
  });

  it("reports pip-disabled-by-site rather than none-found", () => {
    video({ label: "blocked", disablePip: true });
    const r = pipEntry({ dryRun: true });
    expect(r.winner).toBeNull();
    expect(r.reason).toBe("pip-disabled-by-site");
  });

  it("reports not-ready when readyState < 2", () => {
    video({ label: "cold", readyState: 1 });
    expect(pipEntry({ dryRun: true }).reason).toBe("not-ready");
  });

  it("breaks ties by DOM order, deterministically", () => {
    video({ label: "first" });
    video({ label: "second" });
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("first");
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("first");
  });

  it("finds a video nested two open shadow roots deep", () => {
    const outer = document.createElement("div");
    document.body.append(outer);
    const r1 = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    r1.append(inner);
    const r2 = inner.attachShadow({ mode: "open" });
    const v = video({ label: "deep" });
    r2.append(v);
    expect(pipEntry({ dryRun: true }).winner?.label).toBe("deep");
  });

  it("returns every surviving candidate, highest score first", () => {
    video({ label: "a", w: 1280, h: 720 });
    video({ label: "b", w: 200, h: 120 });
    const r = pipEntry({ dryRun: true });
    expect(r.candidates.map((c) => c.label)).toEqual(["a", "b"]);
    expect(r.candidates[0].score).toBeGreaterThan(r.candidates[1].score);
  });
});

describe("pipEntry — frame arbitration", () => {
  it("acts when __pipCoord is absent and this is the top frame", () => {
    video({ label: "v" });
    expect(pipEntry({ dryRun: true }).acted).toBe(true);
  });

  it("stands down when __pipCoord says another frame won", () => {
    video({ label: "v" });
    (window as any).__pipCoord = { isWinner: false, updatedAt: 1 };
    const r = pipEntry({ dryRun: true });
    expect(r.acted).toBe(false);
    expect(r.reason).toBe("not-winner");
  });

  it("acts when __pipCoord says this frame won", () => {
    video({ label: "v" });
    (window as any).__pipCoord = { isWinner: true, updatedAt: 1 };
    expect(pipEntry({ dryRun: true }).acted).toBe(true);
  });

  it("reports pip-unavailable when the browser has PiP switched off", () => {
    Object.defineProperty(document, "pictureInPictureEnabled", { value: false, configurable: true });
    video({ label: "v" });
    expect(pipEntry({ dryRun: true }).reason).toBe("pip-unavailable");
  });
});

describe("pipEntry — serialization safety", () => {
  it("references no identifier outside its own body", () => {
    // executeScript ships the SOURCE TEXT of this function into the page.
    // Rebuild it from that text in a bare scope: if the body touched an import
    // or a module constant, this throws ReferenceError — which is what would
    // happen in the page, except here it happens in CI.
    const rebuilt = new Function(`return (${pipEntry.toString()})`)();
    document.body.innerHTML = "";
    expect(() => rebuilt({ dryRun: true })).not.toThrow();
    expect(rebuilt({ dryRun: true }).winner).toBeNull();
  });

  it("contains no await before the requestPictureInPicture call", () => {
    const src = pipEntry.toString();
    const callAt = src.indexOf("requestPictureInPicture()");
    expect(callAt).toBeGreaterThan(-1);
    expect(src.slice(0, callAt)).not.toMatch(/\bawait\b/);
  });
});

describe("pipEntry — synchronicity is a contract, not an implementation detail", () => {
  // content.ts's localScore() temporarily lifts window.__pipCoord so a stood-down
  // frame can still report a score (otherwise a loser reports null forever and can
  // never win the tab back). That is safe ONLY because pipEntry runs to completion
  // synchronously — no other frame or event can observe the lifted flag.
  //
  // The existing guard only forbids `await` BEFORE requestPictureInPicture(). An
  // await anywhere else would still make the lift a real race in every frame, on
  // every page. These two assertions defend the coupling that content.ts relies on.
  it("is not an async function", () => {
    expect(pipEntry.constructor.name).toBe("Function");
    expect(Object.prototype.toString.call(pipEntry)).toBe("[object Function]");
  });

  it("contains no await anywhere in its body, not merely before the PiP call", () => {
    expect(pipEntry.toString()).not.toMatch(/\bawait\b/);
  });

  it("returns a plain object rather than a thenable", () => {
    document.body.innerHTML = "";
    const r = pipEntry({ dryRun: true }) as unknown as { then?: unknown };
    expect(typeof r.then).toBe("undefined");
  });
});

describe("pipEntry — a rejected requestPictureInPicture must be REPORTED", () => {
  // MEASURED IN A REAL BROWSER (e2e/gesture.spec.ts): a gesture-less
  // requestPictureInPicture() does not throw. It returns a promise and rejects
  // it asynchronously, so the try/catch around the call never fires.
  //
  // This branch used to swallow that rejection and return PIP_OK, which made
  // BOTH error-name branches of background/action.ts's decideOutcome
  // unreachable in production — SecurityError -> IFRAME_BLOCKED and
  // NotAllowedError -> PIP_REFUSED. The user clicked, no window opened, and
  // the extension's only feedback channel said nothing. These tests are what
  // keep that fixed.
  function stubRequest(impl: () => Promise<void> | never): void {
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      value: impl,
      configurable: true,
      writable: true,
    });
  }

  // The stub lives on a shared prototype, so it MUST be removed again — leaving
  // it in place would silently change the environment for every test that runs
  // after this block, which is exactly the class of bug this file guards.
  afterEach(() => {
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>)
      .requestPictureInPicture;
  });

  it("reports a SecurityError rejection as THREW — the IFRAME_BLOCKED path", async () => {
    video({ label: "v" });
    stubRequest(() => Promise.reject(new DOMException("x", "SecurityError")));

    const r = await pipEntry({});
    expect(r.outcome).toBe("THREW");
    expect(r.errorName).toBe("SecurityError");
    expect(r.acted).toBe(true);
    expect(r.winner?.label).toBe("v");
  });

  it("reports a NotAllowedError rejection as THREW — the PIP_REFUSED path", async () => {
    video({ label: "v" });
    stubRequest(() => Promise.reject(new DOMException("x", "NotAllowedError")));

    const r = await pipEntry({});
    expect(r.outcome).toBe("THREW");
    expect(r.errorName).toBe("NotAllowedError");
  });

  it("still reports PIP_OK when the promise resolves", async () => {
    video({ label: "v" });
    stubRequest(() => Promise.resolve());

    const r = await pipEntry({});
    expect(r.outcome).toBe("PIP_OK");
    expect(r.winner?.label).toBe("v");
  });

  it("still reports a SYNCHRONOUS throw as THREW, with the same shape", async () => {
    video({ label: "v" });
    stubRequest(() => {
      throw new DOMException("x", "InvalidStateError");
    });

    const r = await pipEntry({});
    expect(r.outcome).toBe("THREW");
    expect(r.errorName).toBe("InvalidStateError");
    expect(r.acted).toBe(true);
  });
});
