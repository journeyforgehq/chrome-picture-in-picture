/* ============================================================================
 * enhanceWindow — THE SECOND INJECTION. READ THIS BEFORE YOU TOUCH IT.
 * ============================================================================
 *
 * pipEntry opened the Document PiP window inside the click gesture and stashed
 * the handle on window.__pipWin. It comes back BLACK AND EMPTY. This function
 * is what turns it into a player: it adopts a stylesheet into the PiP document
 * and moves the page's <video> across.
 *
 * It ships to the page the same way pipEntry does —
 *   chrome.scripting.executeScript({ func: enhanceWindow })
 * serializes it with Function.prototype.toString() and evaluates that SOURCE
 * TEXT inside the target frame — so RULE 1 APPLIES HERE EXACTLY AS IT DOES
 * THERE:
 *
 * 1. NO OUTSIDE IDENTIFIERS. The body may not reference anything declared
 *    outside itself — no imports, no module-level constants, no helper
 *    functions, no closure variables. TypeScript compiles such a reference
 *    happily and the user gets a ReferenceError in their browser. Every helper
 *    lives inside the body. (`import type` is erased before .toString() ever
 *    sees this source and is fine — but a RUNTIME import from ./prefs would
 *    drag ./state, and therefore storage.session, into the content chunk, which
 *    is closed to content scripts, S-07. This file imports NOTHING.)
 *
 * 2. THE BOUNDARY AND ITS STYLES SHIP TOGETHER. The PiP window is a SEPARATE
 *    Document: the page's CSS does not follow the video into it, so a video
 *    moved across with no stylesheet renders as an unstyled 300x150 box in a
 *    white scrolling page. new CSSStyleSheet(), replaceSync() and the
 *    adoptedStyleSheets assignment are three consecutive statements below and
 *    they stay that way. Splitting "create the boundary" from "make styles work
 *    in the boundary" across two functions — or two tasks — is the single
 *    biggest source of "all tests pass, nothing renders". This is the same rule
 *    src/pip/toast.ts follows for its shadow root, and for the same reason S-06
 *    chose adoptedStyleSheets over a web-accessible stylesheet file: the latter
 *    makes the extension fingerprintable.
 *
 *    THE CONSTRUCTOR MUST BE THE PiP WINDOW'S OWN. `new win.CSSStyleSheet()`,
 *    never the bare `new CSSStyleSheet()` a shadow root can get away with: a
 *    sheet constructed in the opener's realm belongs to the opener's document,
 *    and assigning it to another document's adoptedStyleSheets throws
 *    "Sharing constructed stylesheets in multiple documents is not allowed".
 *
 * 3. NO `await` — not for activation reasons (this runs long after the gesture
 *    was spent, which is the whole point of it being a second injection) but
 *    because test/injected-bundle.test.ts holds every injected function to the
 *    same shipped-text rule, and because there is nothing here to wait for.
 *
 * 4. RESTORE PUTS THE VIDEO BACK WHERE IT CAME FROM. Not into document.body —
 *    the site's player layout has to survive the round trip, or every use of
 *    the feature leaves a permanent visible regression on the page the user
 *    was on. The original parent AND the original next sibling are recorded
 *    before the move and used by insertBefore on the way back.
 *
 * SCOPE. `opts.inWindowControls` and `opts.subtitles` are accepted and IGNORED
 * here on purpose: in-window controls and subtitles are Task 10, close/restore
 * messaging is Task 11, resize persistence is Task 12. Each gets its own visual
 * verification, which is why the plan splits them.
 * ==========================================================================*/

export interface EnhanceOptions {
  inWindowControls: boolean;
  subtitles: boolean;
}

export interface EnhanceApi {
  restore(): void;
}

export function enhanceWindow(input: { win?: Window | null; opts: EnhanceOptions }): EnhanceApi {
  /* `win` is OPTIONAL, and that is not a convenience. A Window is not
   * structured-cloneable, so it cannot travel through executeScript's `args`;
   * in production this reads window.__pipWin, which pipEntry stashed during the
   * gesture turn. The parameter exists so a unit test can inject a fake without
   * a global. */
  const win = input.win || (window as unknown as { __pipWin?: Window }).__pipWin;
  if (!win) return { restore: function () { /* no window to decorate */ } };
  // DELIBERATELY UNREAD IN THIS TASK. `opts.inWindowControls` and
  // `opts.subtitles` are accepted and ignored — see the SCOPE note in the
  // header. It is bound rather than left on `input` so Task 10 adds behaviour
  // here without also having to re-establish the parameter and its plumbing.
  const opts = input.opts;
  const doc = win.document;

  const noop = { restore: function () { /* nothing was moved */ } };
  if (doc.querySelector("video")) return noop; // already enhanced

  const video = document.querySelector("video") as HTMLVideoElement | null;
  if (!video) return noop;

  /* THE `!important` ON THE VIDEO RULE IS LOAD-BEARING. MEASURED, not assumed.
   *
   * The page's STYLESHEETS do not follow the video across the document
   * boundary — that is the whole reason this sheet exists. But the element's
   * `style` ATTRIBUTE is part of the element, so it travels with it, and every
   * real player sets one: YouTube writes an explicit pixel width and height
   * inline, and so does the fixture harness. In the cascade the style attribute
   * outranks any selector, so plain `video{width:100%}` LOSES to it.
   *
   * The symptom is precisely the one this task exists to prevent: e2e measured
   * the moved video laying out at 640x360 inside a 400x225 window — the sheet
   * adopted, `adoptedStyleSheets.length === 1`, every DOM assertion green, and
   * the user looking at a video cropped by its own container.
   *
   * An author `!important` declaration beats a normal declaration in the style
   * attribute, so this wins without touching the element. That matters: clearing
   * the inline style would mutate the PAGE'S element and would have to be undone
   * on restore, and any restore that did not run exactly once would leave the
   * site's player permanently resized. `!important` reverses itself the moment
   * the video goes home, because the rule stops applying. */
  const css =
    "html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#000;" +
    "font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff}" +
    ".pip-stage{position:relative;width:100%;height:100%}" +
    "video{width:100%!important;height:100%!important;object-fit:contain!important;" +
    "max-width:none!important;max-height:none!important;" +
    "display:block;background:#000}";

  try {
    const sheet = new (win as unknown as { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet();
    (sheet as unknown as { replaceSync(t: string): void }).replaceSync(css);
    (doc as unknown as { adoptedStyleSheets: unknown[] }).adoptedStyleSheets = [sheet];
  } catch (_e) {
    // Constructable stylesheets are the primary route; a <style> element is the
    // fallback so an older engine still gets a styled window rather than a
    // white box with a video in it.
    const el = doc.createElement("style");
    el.textContent = css;
    doc.head.appendChild(el);
  }

  const home = { parent: video.parentNode, next: video.nextSibling };
  (window as unknown as { __pipHome?: unknown }).__pipHome = home;

  const stage = doc.createElement("div");
  stage.className = "pip-stage";
  doc.body.appendChild(stage);
  stage.appendChild(video);

  const restore = function () {
    const h = (window as unknown as { __pipHome?: { parent: Node | null; next: Node | null } })
      .__pipHome;
    if (h && h.parent) h.parent.insertBefore(video, h.next);
    else document.body.appendChild(video);
    delete (window as unknown as { __pipHome?: unknown }).__pipHome;
    delete (window as unknown as { __pipWin?: unknown }).__pipWin;
  };
  win.addEventListener("pagehide", restore);
  return { restore: restore };
}
