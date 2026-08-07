import { describe, it, expect, beforeEach } from "vitest";
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
