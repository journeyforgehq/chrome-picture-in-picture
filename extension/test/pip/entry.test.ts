import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pipEntry } from "../../src/pip/entry";
import type { PipPrefs } from "../../src/pip/prefs";

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

  /* ==========================================================================
   * R-14 — the advert penalty's threshold. 65 seconds, and the number matters.
   * ==========================================================================
   * `if (duration < 65 && el.muted) score -= 400` is the ONLY term in the
   * formula that rejects adverts. It used to read `< 30`, which meant the two
   * most commonly sold pre-roll lengths — 30s and 60s — fell on the far side of
   * it, collected no penalty at all, and then won on rendered area, because an
   * ad unit is routinely larger than the content player it interrupts.
   * Measured in a real browser on e2e/fixtures/b13-30s-ad-vs-content.html:
   * ad 1791, content 1500 — the advert won by 291. It is now 1391 to 1500.
   *
   * These pin the boundary from both sides so a future "tidy up the magic
   * number" edit has to argue with a red test rather than a comment.
   *
   * THEY ASSERT SCORES, NOT WINNERS, AND THAT IS DELIBERATE — it was measured,
   * not preferred. happy-dom has no layout engine, so `video()` stubs
   * getBoundingClientRect at the origin and every clip lands fully inside the
   * viewport with the same intersection term. An "ad beats content" arrangement
   * therefore has the unmuted content winning on ratio ALONE, and the whole
   * block still passed with the threshold reverted to 30. Verified by doing
   * exactly that. The WINNER-level proof needs real layout and lives one layer
   * up, in e2e/fixtures/b13-30s-ad-vs-content.html, where the tall ad pushes the
   * content player off-viewport and the ranking genuinely flips.
   * ========================================================================*/
  /* BOTH PAUSED, AND THAT IS THE MEASUREMENT, NOT A CONCESSION.
   *
   * These pairs are here to measure ONE term — the 65-second threshold — so the
   * gap between them has to contain nothing else. R-14 Option B later added a
   * second, PAGE-AWARE term (`-= 500` when another PLAYING candidate is >= 4x
   * as long), and with both videos playing a 600s reference is 40x the 15s
   * pre-roll, so it fires here too and the gap reads 400 + 500 = 900. Measured,
   * not predicted: these four tests went red at exactly 900 the moment the term
   * landed.
   *
   * Shortening the reference instead does not work, and the arithmetic says why:
   * to isolate term 1 the reference must be OVER 65s (or it takes the same
   * penalty) and UNDER 4x the pre-roll (or it triggers term 2). At 60s that is
   * (65, 240) and at 30s it is (65, 120), but at 15s it is (65, 60) — empty.
   * There is no reference length that isolates the threshold for a 15s pre-roll.
   *
   * Pausing both removes term 2 from the measurement entirely — it needs a
   * PLAYING accuser — while leaving term 1 untouched, since that one reads only
   * duration and muted. The expected value is still exactly 400 and these still
   * go red if the threshold moves. Term 2's own behaviour is measured on its own
   * terms in the block below; nothing about it is being tested here. */
  // Each pair is identical except for duration, so the gap IS the penalty.
  // 15 / 30 / 60 are the three pre-roll lengths that are actually sold.
  for (const seconds of [15, 30, 60]) {
    it(`penalises a muted ${seconds}s pre-roll — a length that actually ships`, () => {
      video({ label: "preroll", w: 640, h: 360, muted: true, duration: seconds, paused: true });
      video({ label: "reference", w: 640, h: 360, muted: true, duration: 600, paused: true });
      const r = pipEntry({ dryRun: true });
      const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
      expect(score("reference") - score("preroll")).toBe(400);
    });
  }

  it("applies the penalty at 64s and not at 65s — exactly 400 points apart", () => {
    // Identical in every other term, so the whole gap IS the penalty.
    video({ label: "just-under", w: 640, h: 360, muted: true, duration: 64 });
    video({ label: "at-threshold", w: 640, h: 360, muted: true, duration: 65 });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
    expect(r.winner?.label).toBe("at-threshold");
    expect(score("at-threshold") - score("just-under")).toBe(400);
  });

  it("leaves an UNMUTED short clip alone — the penalty needs both conditions", () => {
    // The term is `duration < 65 && muted`. A short clip with sound is somebody
    // watching something, not an advert, and must not be penalised for length.
    video({ label: "short-unmuted", w: 640, h: 360, muted: false, duration: 20 });
    video({ label: "short-muted", w: 640, h: 360, muted: true, duration: 20 });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
    // +200 for being unmuted, +400 for not being penalised.
    expect(score("short-unmuted") - score("short-muted")).toBe(600);
  });

  it("ACCEPTED COST: a genuine 45s muted clip is demoted too", () => {
    // Recorded rather than hidden. Raising the threshold to 65 buys pre-roll
    // rejection and charges for it here: a real, muted, 45-second clip takes
    // the same 400 an advert takes, and at `< 30` it took nothing. Signed off —
    // it is MUTED, so it is rarely what somebody wants floated, and it still
    // beats anything paused (1000) or off-screen (up to 500).
    // Both paused for the reason given above the pre-roll loop: with them
    // playing, the page-aware term fires too and the gap reads 900, which would
    // stop this test from measuring the cost of THIS threshold.
    video({ label: "genuine-45s", w: 640, h: 360, muted: true, duration: 45, paused: true });
    video({ label: "reference", w: 640, h: 360, muted: true, duration: 600, paused: true });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
    expect(score("reference") - score("genuine-45s")).toBe(400);
    // Still beats a paused long video: the cost is a demotion, not exclusion.
    expect(r.winner?.label).toBe("reference");
  });

  /* ==========================================================================
   * R-14 Option B — the PAGE-AWARE advert term. `-= 500` when another PLAYING
   * candidate is at least 4x as long as this one.
   * ==========================================================================
   * READ THE WARNING ON THE BLOCK ABOVE FIRST. happy-dom has no layout engine,
   * so `video()` stubs getBoundingClientRect and every candidate lands fully
   * inside the viewport with the same intersection and area terms. That makes
   * most winner-level assertions here vacuous, which is why these are written
   * as SCORE DELTAS between two candidates that differ in exactly one input.
   *
   * EVERY ONE OF THESE WAS MUTATION-CHECKED by deleting the term from
   * src/pip/entry.ts and re-running: each assertion below goes red without it.
   * An assertion that survives that deletion is not testing this term, and the
   * two obvious ones — "a paused long video does not accuse" and "two live
   * streams do not accuse each other" — are deliberately written as a
   * DIFFERENCE against a second arrangement rather than as a bare expected
   * value, because in their bare form they pass with the term gone.
   *
   * The identical stubbed rects that make winner assertions vacuous elsewhere
   * are the POINT in `the same-slot tie` below: E08's defect is two videos with
   * genuinely equal scores, and equal stubs reproduce it exactly rather than
   * approximating it.
   * ========================================================================*/
  it("penalises a short video when a longer PLAYING one shares the page — 500", () => {
    // Both UNMUTED, so the muted-gated term cannot fire on either: the whole
    // gap is the page-aware one. 600 >= 4 * 20, and 20 >= 4 * 600 is false.
    video({ label: "short", w: 640, h: 360, muted: false, duration: 20 });
    video({ label: "long", w: 640, h: 360, muted: false, duration: 600 });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
    expect(score("long") - score("short")).toBe(500);
  });

  it("fires at exactly 4x and not a hair under — the ratio is the threshold", () => {
    // 400 >= 4 * 100 is true, so `short` is penalised.
    video({ label: "short", w: 640, h: 360, muted: false, duration: 100 });
    video({ label: "long", w: 640, h: 360, muted: false, duration: 400 });
    const r = pipEntry({ dryRun: true });
    const at4x = r.candidates.find((c) => c.label === "long")!.score -
      r.candidates.find((c) => c.label === "short")!.score;

    document.body.innerHTML = "";
    // One second longer, and 400 >= 4 * 101 is false. Nothing else changed.
    video({ label: "short", w: 640, h: 360, muted: false, duration: 101 });
    video({ label: "long", w: 640, h: 360, muted: false, duration: 400 });
    const r2 = pipEntry({ dryRun: true });
    const under4x = r2.candidates.find((c) => c.label === "long")!.score -
      r2.candidates.find((c) => c.label === "short")!.score;

    expect(at4x).toBe(500);
    expect(under4x).toBe(0);
  });

  it("THE E08 CASE: an unmuted same-slot ad no longer wins on DOM order", () => {
    // The ad is FIRST in the DOM, which is what handed it the win: every
    // per-video term produced the same number for both — measured in a real
    // browser on e2e/fixtures/e08-unmuted-ad-same-slot.html as
    // 1991.3541666666665 apiece — and the tie fell through to insertion order.
    // Equal stubbed rects reproduce that tie exactly, so this winner assertion
    // is real: delete the term and the ad wins again.
    video({ label: "ad-roll", w: 640, h: 360, muted: false, duration: 15 });
    video({ label: "stream", w: 640, h: 360, muted: false, duration: Infinity });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
    expect(r.winner?.label).toBe("stream");
    expect(score("stream") - score("ad-roll")).toBe(500);
  });

  it("Infinity accuses but is never accused — 15 >= 4 * Infinity is false", () => {
    // The half that matters for live streams: a live stream must not be
    // demoted by the ad roll it is being interrupted by. Compared against a
    // SOLO run rather than against a bare number, so the assertion measures
    // the stream's score being untouched rather than restating the formula.
    video({ label: "live", w: 640, h: 360, muted: false, duration: Infinity });
    const alone = pipEntry({ dryRun: true }).candidates[0].score;

    document.body.innerHTML = "";
    video({ label: "live", w: 640, h: 360, muted: false, duration: Infinity });
    video({ label: "ad-roll", w: 640, h: 360, muted: false, duration: 15 });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;
    expect(score("live")).toBe(alone);
    expect(alone - score("ad-roll")).toBe(500);
  });

  it("two live streams do not accuse each other — Infinity >= 4 * Infinity is TRUE", () => {
    // The arithmetic really does say yes, so the term carries an isFinite
    // guard. Without it BOTH streams take -500 and stay equal to each other —
    // which is why this is asserted against the SOLO score and not against its
    // sibling. Not hypothetical: the fixture suite is full of Infinity
    // durations, because captureStream reports Infinity.
    video({ label: "a", w: 640, h: 360, muted: false, duration: Infinity });
    const alone = pipEntry({ dryRun: true }).candidates[0].score;

    document.body.innerHTML = "";
    video({ label: "a", w: 640, h: 360, muted: false, duration: Infinity });
    video({ label: "b", w: 640, h: 360, muted: false, duration: Infinity });
    const r = pipEntry({ dryRun: true });
    expect(r.candidates.map((c) => c.score)).toEqual([alone, alone]);
  });

  it("NaN and 0 durations never reach the term — the >5s filter drops them first", () => {
    // MEASURED rather than reasoned: `NaN > 5` and `0 > 5` are both false, so
    // the filter above the scorer discards these elements and they are neither
    // penalised nor able to penalise. readyState is 2 here on purpose, so the
    // duration filter is genuinely the one doing the work.
    video({ label: "nan", w: 640, h: 360, muted: false, duration: NaN });
    video({ label: "zero", w: 640, h: 360, muted: false, duration: 0 });
    video({ label: "long", w: 640, h: 360, muted: false, duration: 600 });
    const r = pipEntry({ dryRun: true });
    expect(r.candidates.map((c) => c.label)).toEqual(["long"]);

    // And the survivor scores exactly as it would alone: a dropped candidate
    // cannot accuse, so `long` is not demoted by the 0-second element.
    document.body.innerHTML = "";
    video({ label: "long", w: 640, h: 360, muted: false, duration: 600 });
    expect(r.candidates[0].score).toBe(pipEntry({ dryRun: true }).candidates[0].score);
  });

  it("the accuser must itself be PLAYING — a paused long video accuses nothing", () => {
    // Nothing is being interrupted by a paused video, so a short clip that is
    // actually playing is still what the user is watching. Written as the
    // DIFFERENCE between the two arrangements: asserted as a bare number, this
    // one would pass with the term deleted and prove nothing.
    video({ label: "short", w: 640, h: 360, muted: false, duration: 20 });
    video({ label: "long", w: 640, h: 360, muted: false, duration: 600, paused: true });
    const withPaused = pipEntry({ dryRun: true }).candidates.find((c) => c.label === "short")!.score;

    document.body.innerHTML = "";
    video({ label: "short", w: 640, h: 360, muted: false, duration: 20 });
    video({ label: "long", w: 640, h: 360, muted: false, duration: 600 });
    const withPlaying = pipEntry({ dryRun: true }).candidates.find(
      (c) => c.label === "short"
    )!.score;

    expect(withPaused - withPlaying).toBe(500);
  });

  it("THE CEILING: 400 + 500 < 1000, so no advert signal overturns `playing`", () => {
    // The invariant that fixes the magnitude from above. A video carrying BOTH
    // advert penalties — muted, under 65s, and a longer playing video on the
    // page — must still outrank an otherwise identical PAUSED one, or the
    // penalties would have swallowed the term that dominates the whole formula.
    video({ label: "worst-case", w: 640, h: 360, muted: true, duration: 15 });
    video({ label: "accuser", w: 640, h: 360, muted: true, duration: 600 });
    video({ label: "paused-ref", w: 640, h: 360, muted: true, duration: 600, paused: true });
    const r = pipEntry({ dryRun: true });
    const score = (label: string) => r.candidates.find((c) => c.label === label)!.score;

    // Both penalties really did land: 400 + 500 against an identical playing clip.
    expect(score("accuser") - score("worst-case")).toBe(900);
    // And 1000 - 900 of the playing term survives it.
    expect(score("worst-case") - score("paused-ref")).toBe(100);
    expect(r.winner?.label).toBe("accuser");
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

/* ============================================================================
 * pipEntry — prefs plumbing. THIS BLOCK ASSERTS NO CHANGE IN BEHAVIOUR.
 * ============================================================================
 * Every case below must end in the NATIVE window, because native is all this
 * function can do today. What is being measured is that the routing decision
 * can be CARRIED — warm from the worker's cache, cold from a page-side storage
 * read — without disturbing the path the free tier already takes. The Document
 * PiP branch lands in a later task, and when it does, any regression here is
 * attributable to it rather than to the plumbing.
 *
 * WHY THE ASYMMETRY IN THE COLD PATH IS SAFE (S-11): the WORKER's gesture scope
 * is turn-based — `await Promise.resolve()`, 0ms, no IPC, still loses it — but
 * the PAGE's transient activation is time-based, ~5s, and survives a suspension.
 * S-11 measured chrome.storage.local.get inside the injected frame at 1ms and
 * PiP still opened. That is the whole reason the read below is allowed to be
 * here and not in background.ts.
 *
 * These use this file's own `video()` builder rather than content.test.ts's
 * `makeScorableVideo`: the two produce the same scorable element, and a second
 * copy here would be one more thing to keep in step for no gain. Only one video
 * is on the page in each case, so nothing about the scoring formula is in play.
 * ==========================================================================*/
describe("pipEntry — prefs plumbing", () => {
  const FREE: PipPrefs = {
    tier: "free",
    enhancedWindow: true, // ON, and still native: the tier is what gates it.
    windowSize: "medium",
    rememberSizePerSite: true,
    inWindowControls: true,
    subtitles: false,
    geometry: {},
  };

  let requested: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // happy-dom implements no requestPictureInPicture at all, so without this
    // every case below would take the synchronous-TypeError branch and prove
    // nothing about whether PiP was actually asked for.
    requested = vi.fn(() => Promise.resolve());
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      value: requested,
      configurable: true,
      writable: true,
    });
  });

  // Both stubs live on shared objects. Leaving either in place would change the
  // environment for every test that runs after this file's block.
  afterEach(() => {
    delete (HTMLVideoElement.prototype as unknown as Record<string, unknown>)
      .requestPictureInPicture;
    delete (window as unknown as Record<string, unknown>).chrome;
    delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
  });

  /** happy-dom has no Document PiP, so `supported` reads false unless a test
   *  puts one here. Several cases below would otherwise route native for the
   *  WRONG reason and pass while proving nothing. */
  function stubDocumentPip() {
    (window as unknown as Record<string, unknown>).documentPictureInPicture = {
      requestWindow: () => Promise.resolve({}),
    };
  }

  /** The cold path's only I/O, stubbed at the shape entry.ts actually calls. */
  function stubStorage(get: (keys: string[]) => Promise<Record<string, unknown>>) {
    const spy = vi.fn(get);
    (window as unknown as Record<string, unknown>).chrome = { storage: { local: { get: spy } } };
    return spy;
  }

  it("routes to native when prefs say free, and reports the mode it chose", async () => {
    const v = video({ label: "v" });

    const result = pipEntry({ prefs: FREE });
    // BEFORE awaiting anything: the warm path may not suspend above the call,
    // which is the structural guarantee the free tier has always had.
    expect(v.requestPictureInPicture).toHaveBeenCalled();

    const r = await result;
    expect(r.mode).toBe("native");
    expect(r.outcome).toBe("PIP_OK");
  });

  it("reads no storage at all when the worker's cache answered", async () => {
    video({ label: "v" });
    const get = stubStorage(async () => ({}));

    await pipEntry({ prefs: FREE });
    expect(get).not.toHaveBeenCalled();
  });

  it("routes to native when prefs are ABSENT and no storage is reachable", async () => {
    // The cold-worker path with the fallback unavailable — happy-dom has no
    // chrome.storage unless a test puts one there. A floating window beats an
    // error, so this must still act, and it must do so WITHOUT suspending:
    // there is nothing to wait for.
    const v = video({ label: "v" });

    const result = pipEntry({ prefs: null });
    expect(v.requestPictureInPicture).toHaveBeenCalled();

    const r = await result;
    expect(r.mode).toBe("native");
    expect(r.outcome).toBe("PIP_OK");
  });

  it("reads prefs from the page when the worker was cold, and still goes native", async () => {
    video({ label: "v" });
    const get = stubStorage(async () => ({
      settings: { enhancedWindow: true },
      entitlement_cache: { tier: "pro" },
      geometry: {},
    }));

    // Pro AND enhancedWindow, but Document PiP is NOT stubbed here, so the
    // third condition fails and the route is native for a reason the routing
    // function actually decided rather than because nothing was wired up.
    const r = await pipEntry({ prefs: null });
    expect(get).toHaveBeenCalledWith(["settings", "entitlement_cache", "geometry"]);
    expect(r.mode).toBe("native");
    expect(r.outcome).toBe("PIP_OK");
  });

  it("carries a `document` decision without acting on it — INTERIM, by design", () => {
    // THE POINT OF THIS TASK, stated as an assertion. All three conditions are
    // true, so the decision is `document` and it survives the trip into the
    // injected body. NOTHING acts on it yet: the native window still opens, and
    // that is why a regression in the next task — the one that adds the second
    // branch — is attributable to that task and not to this plumbing.
    //
    // This test is expected to CHANGE when the enhanced window lands. Its job
    // until then is to stop the mismatch from being silent: for one commit,
    // `mode: "document"` describes the route taken, not the window opened.
    stubDocumentPip();
    const v = video({ label: "v" });

    const result = pipEntry({
      prefs: { ...FREE, tier: "pro", enhancedWindow: true },
    });

    expect(v.requestPictureInPicture).toHaveBeenCalled(); // the NATIVE call
    expect(requested).toHaveBeenCalledTimes(1);
    return (result as Promise<{ mode?: string; outcome?: string }>).then((r) => {
      expect(r.mode).toBe("document");
      expect(r.outcome).toBe("PIP_OK");
    });
  });

  it("still routes a PRO user native when the enhanced window is switched OFF", () => {
    // The setting is the second gate and it is independent of the tier.
    stubDocumentPip();
    video({ label: "v" });
    const result = pipEntry({ prefs: { ...FREE, tier: "pro", enhancedWindow: false } });
    return (result as Promise<{ mode?: string }>).then((r) => expect(r.mode).toBe("native"));
  });

  it("falls through to native when the page-side storage read REJECTS", async () => {
    video({ label: "v" });
    stubStorage(() => Promise.reject(new Error("storage is gone")));

    const r = await pipEntry({ prefs: null });
    expect(r.mode).toBe("native");
    expect(r.outcome).toBe("PIP_OK");
  });

  it("keeps the dryRun path synchronous and non-thenable", () => {
    video({ label: "v" });
    // `prefs: null` is the case that would send a non-dryRun call to storage.
    // The dryRun return has to happen ABOVE that, or content.ts's localScore()
    // lift of window.__pipCoord becomes a real race in every frame.
    const result = pipEntry({ dryRun: true, prefs: null });
    expect(typeof (result as { then?: unknown }).then).not.toBe("function");
    // No implementation ran, so there is no mode to report.
    expect(result.mode).toBeUndefined();
    expect(requested).not.toHaveBeenCalled();
  });
});
