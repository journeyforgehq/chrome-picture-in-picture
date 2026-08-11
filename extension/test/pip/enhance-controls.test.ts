/* ============================================================================
 * enhanceWindow — the in-window control bar and the subtitle track.
 * ============================================================================
 *
 * WHY THIS FEATURE EXISTS, so nobody later "simplifies" it away as chrome:
 * spike S-04 MEASURED that chrome.commands keyboard shortcuts DO NOT FIRE while
 * the floating PiP window has focus — they need a browser window focused. So
 * the instant a user clicks the floating window to interact with it is exactly
 * the instant their shortcuts stop working. Native PiP has only Chrome's own
 * hover controls; the Document PiP window is OUR html, so we can draw real
 * ones. That measurement is why these buttons are a headline Pro feature.
 *
 * WHAT THIS FILE CAN AND CANNOT SEE. happy-dom has no layout engine and no
 * cascade, so nothing here proves a single pixel. It pins BEHAVIOUR — which
 * element the buttons act on, what the seek arithmetic does at the boundary,
 * how the speed cycle advances, and that a disabled setting builds nothing at
 * all. e2e/dpip-controls.spec.ts pins the APPEARANCE, through computed style
 * inside a real PiP window. Both are required; neither substitutes.
 *
 * fakeWin() is copied from enhance.test.ts rather than shared, INCLUDING its
 * `CSSStyleSheet` property — see the header there. Without that property the
 * fake silently takes the <style> fallback and adopts nothing, which would make
 * every "the rule is in the sheet" assertion below measure the wrong branch.
 * ==========================================================================*/
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enhanceWindow } from "../../src/pip/enhance";

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

/** The rules a sheet actually parsed, as text. */
function cssTextOf(sheet: unknown): string {
  const rules = (sheet as CSSStyleSheet).cssRules;
  return Array.prototype.map.call(rules, (r: CSSRule) => r.cssText).join("\n");
}

const CONTROLS = { inWindowControls: true, subtitles: false };
const BARE = { inWindowControls: false, subtitles: false };

beforeEach(() => {
  document.body.innerHTML = '<div id="host"><video id="v"></video></div>';
  delete (window as unknown as { __pipHome?: unknown }).__pipHome;
  delete (window as unknown as { __pipWin?: unknown }).__pipWin;
});

describe("in-window controls", () => {
  it("pause and play act on the moved video element", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const pause = vi.fn();
    Object.defineProperty(video, "pause", { value: pause, configurable: true });
    Object.defineProperty(video, "paused", { value: false, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    (win.document.querySelector('[aria-label="Pause"]') as HTMLButtonElement).click();
    expect(pause).toHaveBeenCalled();
  });

  it("calls play() when the video is paused", () => {
    // The other half of the toggle. Without this the play branch is untested
    // code that only runs in front of a user.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, "play", { value: play, configurable: true });
    Object.defineProperty(video, "paused", { value: true, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    (win.document.querySelector('[data-pip="play"]') as HTMLButtonElement).click();
    expect(play).toHaveBeenCalled();
  });

  it("gives the play/pause button a STABLE selector as well as a flipping label", () => {
    /* The aria-label is the accessible NAME OF THE ACTION, so it has to flip
     * between "Play" and "Pause" as the state changes — a button that announces
     * "Pause" while it would start playback is an accessibility defect, not a
     * convenience. But that makes aria-label a moving target for any test or
     * later feature that needs to find the button, so every control also
     * carries a data-pip hook that never changes. Both halves are asserted
     * here: drop the hook and the e2e spec's locators start depending on
     * playback state; freeze the label and screen-reader users are misled. */
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    Object.defineProperty(video, "paused", { value: true, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    const btn = win.document.querySelector('[data-pip="play"]') as HTMLButtonElement;
    expect(btn.getAttribute("aria-label")).toBe("Play");
    expect(win.document.querySelector('[data-pip="back"]')).not.toBeNull();
    expect(win.document.querySelector('[data-pip="forward"]')).not.toBeNull();
    expect(win.document.querySelector('[data-pip="speed"]')).not.toBeNull();
  });

  it("relabels itself when the video reports a play event", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    let paused = true;
    Object.defineProperty(video, "paused", { get: () => paused, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    const btn = win.document.querySelector('[data-pip="play"]') as HTMLButtonElement;
    expect(btn.getAttribute("aria-label")).toBe("Play");
    paused = false;
    video.dispatchEvent(new Event("play"));
    expect(btn.getAttribute("aria-label")).toBe("Pause");
  });

  it("seek buttons move currentTime by ten seconds and never below zero", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { value: 4, writable: true, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    (win.document.querySelector('[aria-label="Back ten seconds"]') as HTMLButtonElement).click();
    expect(video.currentTime).toBe(0);
    (win.document.querySelector('[aria-label="Forward ten seconds"]') as HTMLButtonElement).click();
    expect(video.currentTime).toBe(10);
  });

  it("speed cycles 1 -> 1.25 -> 1.5 -> 2 -> 0.5 and back", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ win: win as never, opts: CONTROLS });
    const btn = win.document.querySelector('[aria-label="Playback speed"]') as HTMLButtonElement;
    for (const want of [1.25, 1.5, 2, 0.5, 1]) {
      btn.click();
      expect(video.playbackRate).toBe(want);
    }
  });

  it("advances to the next HIGHER step from a rate that is not on the list", () => {
    /* The obvious implementation is steps.indexOf(rate), and it is wrong: a site
     * that set 1.75 (YouTube offers it; so does every HTML5 player menu) is not
     * in the list, indexOf returns -1, and the click lands on steps[(-1+1)%5] —
     * steps[0] — so the user's first press SLOWS THE VIDEO DOWN from 1.75 to 1
     * with no way to tell why. Picking the smallest step strictly greater than
     * the current rate is the same cycle for every on-list rate (the list is a
     * rotation of the sorted order) and is defined for every off-list one. */
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    video.playbackRate = 1.75;

    enhanceWindow({ win: win as never, opts: CONTROLS });
    (win.document.querySelector('[data-pip="speed"]') as HTMLButtonElement).click();
    expect(video.playbackRate).toBe(2);
  });

  it("wraps to the slowest step from a rate above every step", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    video.playbackRate = 3;

    enhanceWindow({ win: win as never, opts: CONTROLS });
    (win.document.querySelector('[data-pip="speed"]') as HTMLButtonElement).click();
    expect(video.playbackRate).toBe(0.5);
  });

  it("shows the video's REAL starting rate, not a hardcoded 1x", () => {
    // A bar that reads "1×" over a video playing at 1.5 is worse than no
    // readout: it is a confident lie about the thing the user came to check.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    video.playbackRate = 1.5;

    enhanceWindow({ win: win as never, opts: CONTROLS });
    const btn = win.document.querySelector('[data-pip="speed"]') as HTMLButtonElement;
    expect(btn.textContent).toBe("1.5×");
  });

  it("keeps a running time readout in step with the video", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 600, configurable: true });
    Object.defineProperty(video, "currentTime", { value: 65, writable: true, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    video.dispatchEvent(new Event("timeupdate"));
    expect(win.document.querySelector(".pip-time")!.textContent).toBe("1:05 / 10:00");
  });

  it("says 'live' rather than NaN for a stream with no duration", () => {
    // captureStream() and every real live stream report duration === Infinity.
    // "NaN:NaN" in the corner of the window is the visible symptom.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: Infinity, configurable: true });

    enhanceWindow({ win: win as never, opts: CONTROLS });
    expect(win.document.querySelector(".pip-time")!.textContent).toBe("0:00 / live");
  });

  it("carries the bar's own rules in the SAME adopted sheet as the video's", () => {
    // Not a second sheet and not an inline style attribute: the bar has to be
    // styled by the sheet that already crossed the boundary, or it renders as
    // unstyled buttons stacked in the top-left of the window.
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: CONTROLS });
    expect(win.__adopted.length).toBe(1);
    const css = cssTextOf(win.__adopted[0]);
    expect(css).toMatch(/\.pip-bar\s*\{[^}]*position\s*:\s*absolute/);
    // MEASURED: happy-dom expands the `outline` shorthand into its longhands
    // when it parses, so `outline:` never appears in cssRules text. Matching
    // the longhands is the stronger assertion anyway — it proves the shorthand
    // was UNDERSTOOD, not merely echoed back.
    expect(css).toMatch(/\.pip-btn:focus\s*\{[^}]*outline-style\s*:\s*solid/);
    expect(css).toMatch(/\.pip-btn:focus\s*\{[^}]*outline-width\s*:\s*2px/);
    // :focus, NOT :focus-visible — see the note in src/options/OptionsView.tsx:
    // Chrome only matches :focus-visible on a programmatic .focus() when the
    // preceding interaction was keyboard-ish, so a :focus-visible-only ring is
    // invisible to the Playwright focus() check that guards it.
    expect(css).not.toMatch(/\.pip-btn:focus-visible/);
    expect(css).toMatch(/video::cue/);
  });

  it("omits the bar entirely when the setting is off", () => {
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: BARE });
    expect(win.document.querySelector(".pip-bar")).toBeNull();
  });

  it("detaches its video listeners on restore, leaving nothing bound to the page", () => {
    /* The video goes back to the page; the bar's document does not. Listeners
     * left on the element would keep firing into a torn-down window for the
     * rest of the page's life, once per PiP session. Rule 4's spirit: restore
     * puts things back the way they were, including the invisible parts. */
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const remove = vi.spyOn(video, "removeEventListener");
    const api = enhanceWindow({ win: win as never, opts: CONTROLS });
    api.restore();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain("timeupdate");
    expect(events).toContain("play");
    expect(events).toContain("pause");
    expect(events).toContain("ratechange");
  });
});

describe("subtitles", () => {
  it("turns on a subtitles track when asked, and leaves it alone when not", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const track = { kind: "subtitles", mode: "disabled" };
    Object.defineProperty(video, "textTracks", { value: [track], configurable: true });

    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: true } });
    expect(track.mode).toBe("showing");
  });

  it("leaves the track untouched when the setting is off", () => {
    // The half the test above claims in its name but never checks. Turning
    // captions on for someone who did not ask is as wrong as failing to turn
    // them on for someone who did.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const track = { kind: "subtitles", mode: "disabled" };
    Object.defineProperty(video, "textTracks", { value: [track], configurable: true });

    enhanceWindow({ win: win as never, opts: BARE });
    expect(track.mode).toBe("disabled");
  });

  it("accepts a 'captions' track too — the same feature under the other kind", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const track = { kind: "captions", mode: "disabled" };
    Object.defineProperty(video, "textTracks", { value: [track], configurable: true });

    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: true } });
    expect(track.mode).toBe("showing");
  });

  it("skips kinds that are not subtitles and takes the first that is", () => {
    // "metadata" and "chapters" tracks are common and showing one paints raw
    // cue text over the video.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const meta = { kind: "metadata", mode: "disabled" };
    const subs = { kind: "subtitles", mode: "disabled" };
    const second = { kind: "subtitles", mode: "disabled" };
    Object.defineProperty(video, "textTracks", {
      value: [meta, subs, second],
      configurable: true,
    });

    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: true } });
    expect(meta.mode).toBe("disabled");
    expect(subs.mode).toBe("showing");
    expect(second.mode).toBe("disabled");
  });

  it("does not throw on a video with no textTracks at all", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    Object.defineProperty(video, "textTracks", { value: undefined, configurable: true });

    expect(() =>
      enhanceWindow({ win: win as never, opts: { inWindowControls: true, subtitles: true } })
    ).not.toThrow();
    expect(win.document.querySelector(".pip-bar")).not.toBeNull();
  });
});

describe("enhanceWindow with controls — serialization safety", () => {
  it("builds the bar with no identifier from outside its own body", () => {
    // Rule 1, re-checked on the path this task added: buildControls and every
    // helper it uses are nested inside enhanceWindow, so rebuilding the
    // function from its own source text in a bare scope must still work.
    // A module-level `STEPS` constant would compile and then ReferenceError in
    // the user's browser; here it fails in CI instead.
    const rebuilt = new Function(`return (${enhanceWindow.toString()})`)() as typeof enhanceWindow;
    const win = fakeWin();
    expect(() =>
      rebuilt({ win: win as never, opts: { inWindowControls: true, subtitles: true } })
    ).not.toThrow();
    expect(win.document.querySelector(".pip-bar")).not.toBeNull();
    expect(win.document.querySelectorAll(".pip-btn").length).toBe(4);
  });
});
