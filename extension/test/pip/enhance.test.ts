/* ============================================================================
 * enhanceWindow — the boundary, and the stylesheet that has to cross it.
 * ============================================================================
 *
 * TWO THINGS ABOUT THE FAKE WINDOW BELOW ARE DELIBERATE AND WERE MEASURED.
 *
 * 1. IT CARRIES ITS OWN `CSSStyleSheet`. The plan's first draft of this fake
 *    omitted it, and every run took the <style>-element fallback instead of the
 *    adoptedStyleSheets path — win.__adopted.length came back 0. That is a
 *    defect in the INSTRUMENT, not the code: a real Document PiP `Window`
 *    always exposes its own constructor, and enhanceWindow is REQUIRED to use
 *    the PiP window's one rather than the bare global. A sheet constructed in
 *    the opener's realm belongs to the opener's document, and assigning it to
 *    another document's adoptedStyleSheets throws "Sharing constructed
 *    stylesheets in multiple documents is not allowed". So the fake grows the
 *    property the real object has; the implementation keeps the cross-realm
 *    lookup that production needs.
 *
 * 2. THE CSS IS READ OFF `cssRules`, NOT `String(sheet)`. MEASURED under
 *    happy-dom: `String(new CSSStyleSheet())` is "[object Object]" — a
 *    CSSStyleSheet does not stringify to its rules in any engine — so a
 *    `String(...)` assertion could only ever match by accident or not at all.
 *    cssTextOf() joins the parsed rules, which is a STRONGER check than the
 *    source string would have been: it proves the declaration survived parsing
 *    into the sheet rather than merely appearing in a string that was handed to
 *    replaceSync.
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
    // See note 1 in the header. A PiP Window has this; a bare object literal
    // does not, and without it this fake silently measures the fallback branch.
    CSSStyleSheet: globalThis.CSSStyleSheet,
    innerWidth: 400,
    innerHeight: 225,
    addEventListener: vi.fn(),
    close: vi.fn(),
    __adopted: adopted,
  };
}

/** The rules a sheet actually parsed, as text. See note 2 in the header. */
function cssTextOf(sheet: unknown): string {
  const rules = (sheet as CSSStyleSheet).cssRules;
  return Array.prototype.map.call(rules, (r: CSSRule) => r.cssText).join("\n");
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"><video id="v"></video></div>';
  delete (window as unknown as { __pipHome?: unknown }).__pipHome;
  delete (window as unknown as { __pipWin?: unknown }).__pipWin;
});

describe("enhanceWindow", () => {
  it("adopts a stylesheet into the PiP document — the boundary is crossed here or nowhere", () => {
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    expect(win.__adopted.length).toBe(1);
  });

  it("kills overflow on html and body — the scrollbars that cost SuperPiP its rating", () => {
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    const css = cssTextOf(win.__adopted[0]);
    expect(css).toMatch(/overflow\s*:\s*hidden/);
    // The rule that carries it has to be the one that covers BOTH roots: a
    // scrollbar on either element is a scrollbar the user sees.
    expect(css).toMatch(/html\s*,\s*body/);
  });

  it("sizes the video to the window instead of leaving it at the 300x150 default", () => {
    // The page's CSS does not follow the video across the document boundary, so
    // without this rule the moved element lays out at the intrinsic default in
    // the corner of a black window. This is the assertion the e2e spec then
    // re-measures through real computed style.
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    const css = cssTextOf(win.__adopted[0]);
    expect(css).toMatch(/object-fit\s*:\s*contain/);
    expect(css).toMatch(/margin\s*:\s*0/);
  });

  it("wins against the page's INLINE sizing, which travels with the element", () => {
    /* MEASURED IN e2e/dpip-visual.spec.ts, and it is the reason `!important` is
     * on this rule. A page's STYLESHEETS do not cross the document boundary,
     * but its `style` ATTRIBUTE is part of the element and goes with it — and
     * every real player sets one (YouTube writes explicit pixel dimensions
     * inline; so does the fixture harness). The style attribute outranks any
     * selector, so the first version of this sheet lost to it and the e2e probe
     * measured a 640x360 video inside a 400x225 window, with
     * adoptedStyleSheets.length === 1 and every DOM assertion green.
     *
     * happy-dom has no cascade to re-measure that with, so this asserts the
     * DECLARATION rather than its effect; the e2e spec asserts the effect. Both
     * are needed — this one is what stops the `!important` being tidied away by
     * someone who cannot see why it is there. */
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    const css = cssTextOf(win.__adopted[0]);
    expect(css).toMatch(/width\s*:\s*100%\s*!\s*important/);
    expect(css).toMatch(/height\s*:\s*100%\s*!\s*important/);
    expect(css).toMatch(/object-fit\s*:\s*contain\s*!\s*important/);
  });

  it("falls back to a <style> element when the engine has no constructable sheets", () => {
    // The catch branch is not decoration — it is what keeps an older engine from
    // showing a white box with a video in it. Without a test it is dead code
    // that nobody notices is broken until it is the only path left.
    const win = fakeWin() as unknown as { CSSStyleSheet?: unknown; document: Document; __adopted: unknown[] };
    delete win.CSSStyleSheet;
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    expect(win.__adopted.length).toBe(0);
    const style = win.document.querySelector("style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toMatch(/overflow\s*:\s*hidden/);
  });

  it("moves the video into the PiP document and remembers where it came from", () => {
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    expect(win.document.contains(video)).toBe(true);
    expect(document.getElementById("v")).toBeNull();
    expect((window as never as { __pipHome?: unknown }).__pipHome).toBeTruthy();
  });

  it("restores the video to its ORIGINAL PARENT, not to document.body", () => {
    // Dropping it into body would leave the site's player layout broken after
    // every use — a silent, permanent regression on the page the user was on.
    const win = fakeWin();
    const video = document.getElementById("v") as HTMLVideoElement;
    const api = enhanceWindow({
      win: win as never,
      opts: { inWindowControls: false, subtitles: false },
    });
    api.restore();
    expect(document.getElementById("host")!.contains(video)).toBe(true);
  });

  it("restores the video to its ORIGINAL POSITION among its siblings", () => {
    // insertBefore(video, home.next), not appendChild: a player with controls or
    // a caption track after the <video> would otherwise come back reordered.
    document.body.innerHTML =
      '<div id="host"><video id="v"></video><div id="controls"></div></div>';
    const win = fakeWin();
    const api = enhanceWindow({
      win: win as never,
      opts: { inWindowControls: false, subtitles: false },
    });
    api.restore();
    const host = document.getElementById("host")!;
    expect(Array.from(host.children).map((c) => c.id)).toEqual(["v", "controls"]);
  });

  it("clears both globals on restore, so a later click starts from a clean slate", () => {
    const win = fakeWin();
    (window as unknown as { __pipWin?: unknown }).__pipWin = win;
    const api = enhanceWindow({
      win: win as never,
      opts: { inWindowControls: false, subtitles: false },
    });
    api.restore();
    expect((window as unknown as { __pipHome?: unknown }).__pipHome).toBeUndefined();
    expect((window as unknown as { __pipWin?: unknown }).__pipWin).toBeUndefined();
  });

  it("registers restore on the window's own pagehide — closing the window returns the video", () => {
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    expect(win.addEventListener).toHaveBeenCalledWith("pagehide", expect.any(Function));
  });

  it("is idempotent — a second call does not move the video twice", () => {
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    const before = win.document.querySelectorAll("video").length;
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    expect(win.document.querySelectorAll("video").length).toBe(before);
  });

  it("reads window.__pipWin when no handle is passed — production has no other route", () => {
    // A Window is not structured-cloneable, so it cannot cross executeScript's
    // `args`. If this stopped working, the injection would decorate nothing and
    // the user would be left looking at the black window pipEntry opened.
    const win = fakeWin();
    (window as unknown as { __pipWin?: unknown }).__pipWin = win;
    const video = document.getElementById("v") as HTMLVideoElement;
    enhanceWindow({ opts: { inWindowControls: false, subtitles: false } });
    expect(win.document.contains(video)).toBe(true);
  });

  it("does nothing at all when there is no window — no throw, no orphaned video", () => {
    const api = enhanceWindow({ win: null, opts: { inWindowControls: false, subtitles: false } });
    expect(document.getElementById("v")).not.toBeNull();
    expect(() => api.restore()).not.toThrow();
  });

  it("does nothing when the page has no video", () => {
    document.body.innerHTML = '<div id="host"></div>';
    const win = fakeWin();
    enhanceWindow({ win: win as never, opts: { inWindowControls: false, subtitles: false } });
    expect(win.__adopted.length).toBe(0);
    expect((window as unknown as { __pipHome?: unknown }).__pipHome).toBeUndefined();
  });
});

describe("enhanceWindow — serialization safety", () => {
  it("references no identifier outside its own body", () => {
    // executeScript ships the SOURCE TEXT of this function into the page. Rebuild
    // it from that text in a bare scope: if the body touched an import or a
    // module constant, this throws ReferenceError — which is what would happen
    // in the page, except here it happens in CI. Same guard as pipEntry's.
    const rebuilt = new Function(`return (${enhanceWindow.toString()})`)() as typeof enhanceWindow;
    const win = fakeWin();
    expect(() =>
      rebuilt({ win: win as never, opts: { inWindowControls: false, subtitles: false } })
    ).not.toThrow();
    expect(win.__adopted.length).toBe(1);
  });

  it("is not an async function and ships no await", () => {
    expect(enhanceWindow.constructor.name).toBe("Function");
    expect(enhanceWindow.toString()).not.toMatch(/\bawait\b/);
  });
});
