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
 * 5. THE CONTROL BAR IS NOT DECORATION. Spike S-04 MEASURED that
 *    chrome.commands shortcuts DO NOT FIRE while the floating PiP window has
 *    focus — they need a browser window focused. So the moment the user clicks
 *    the floating window is the moment their keyboard shortcuts stop working,
 *    and native PiP offers only Chrome's own hover controls. This window is our
 *    HTML, so it gets real buttons. That is why buildControls lives here rather
 *    than being deferred as polish.
 *
 * 6. RESTORE ALSO REPORTS. The worker's `activePip` record is what makes the
 *    next toolbar click choose "exit" over "open", and Chrome gives the worker
 *    no notification that a Document PiP window closed. So restore sends
 *    PIP_DPIP_CLOSED — after the video is home, never before, and swallowing
 *    every failure, because a sleeping worker must not be able to strand the
 *    user's <video> in a window that is going away.
 *
 * SCOPE. Resize persistence is Task 12 and gets its own visual verification,
 * which is why the plan splits it out.
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
    "display:block;background:#000}" +
    /* THE BAR. It is `position:absolute` inside the `position:relative` stage,
     * so it floats OVER the bottom of the video rather than stealing height
     * from it — a bar in the flow would shrink the video every time the window
     * was resized and reintroduce the letterboxing the sheet above exists to
     * remove. It is hidden at rest (`opacity:0`) and revealed by hover so the
     * window is a clean video when nobody is pointing at it; `:focus-within` is
     * the keyboard half of the same reveal, without which a Tab into the bar
     * would move focus to something invisible.
     *
     * `:focus`, NOT `:focus-visible`, on .pip-btn — the same decision
     * src/options/OptionsView.tsx documents at length: Chrome only matches
     * :focus-visible on a programmatic .focus() when the preceding interaction
     * was already keyboard-ish, so a :focus-visible-only ring is invisible to a
     * Playwright focus() check and therefore silently regressable. The e2e spec
     * asserts this outline through getComputedStyle; make it :focus-visible and
     * that assertion stops being able to see it.
     *
     * No `!important` here, unlike the video rule above: these elements are
     * built by this function in this document and nothing ever writes a style
     * attribute on them. The video's `!important` is there because the PAGE'S
     * element arrives carrying the page's inline sizing. */
    ".pip-bar{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;" +
    "align-items:center;padding:8px 10px;background:rgba(0,0,0,.62);" +
    "opacity:0;transition:opacity .15s ease}" +
    ".pip-stage:hover .pip-bar,.pip-bar:focus-within{opacity:1}" +
    ".pip-btn{appearance:none;border:0;border-radius:4px;background:rgba(255,255,255,.14);" +
    "color:#fff;font:inherit;padding:4px 9px;cursor:pointer;min-width:34px}" +
    ".pip-btn:hover{background:rgba(255,255,255,.26)}" +
    ".pip-btn:focus{outline:2px solid #1677ff;outline-offset:2px}" +
    ".pip-time{margin-left:auto;font-variant-numeric:tabular-nums;opacity:.85}" +
    /* Cues are painted by the UA inside the video box, so they are not styleable
     * from the page's sheet — but they ARE from this document's, and the UA
     * default is small and unbacked over a bright frame. */
    "video::cue{font-size:14px;background:rgba(0,0,0,.72)}";

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

  /* SUBTITLES BEFORE CONTROLS. Showing the track can make the UA lay cues out
   * inside the video box, and the bar is positioned over that box — doing it in
   * this order means the first frame the user sees is already the final one.
   *
   * FIRST subtitles-or-captions track only, and `break`. Turning on all of them
   * paints two languages over each other; "captions" is the same feature under
   * the other kind, and skipping "metadata"/"chapters" matters because showing
   * one of those paints raw cue text across the frame. `textTracks` is guarded
   * because a <video> whose source is a MediaStream may not expose one. */
  const tracks = video.textTracks;
  if (opts.subtitles && tracks) {
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === "subtitles" || tracks[i].kind === "captions") {
        const track = tracks[i];
        track.mode = "showing";
        /* LIFT THE CUES ABOVE THE CONTROL BAR.
         *
         * Cues render at the BOTTOM of the video box by default, which is
         * exactly where the bar sits. With both Pro switches on, the cue text
         * and the buttons draw on top of each other and neither is readable.
         * FOUND BY LOOKING AT A SCREENSHOT — every computed-style assertion in
         * dpip-controls.spec.ts passed while this was happening, because each
         * element is individually correct and only their overlap is wrong.
         *
         * `line` is the only lever: ::cue is a pseudo-element and CSS gives it
         * no positioning properties, so this cannot be fixed in the stylesheet.
         * A negative value counts lines up from the bottom, so -3 clears a
         * ~37px bar at the 14px ::cue size with a margin to spare. Applied on
         * cuechange as well as now, because cues stream in after load and each
         * arrives with its own default line.
         *
         * Only when the bar is actually there — with controls off, the default
         * bottom position is the right one and moving cues would be a
         * regression against every other player's placement. */
        if (opts.inWindowControls) {
          const lift = function () {
            const cues = track.cues;
            if (!cues) return;
            let changed = false;
            for (let c = 0; c < cues.length; c++) {
              const cue = cues[c] as VTTCue;
              if (cue.line !== -3) {
                cue.line = -3;
                changed = true;
              }
            }
            /* THE MODE TOGGLE IS THE FIX, NOT BELT-AND-BRACES.
             *
             * Measured: setting `line` on a cue that is ALREADY ACTIVE updates
             * the property but does not re-flow the rendered box — a probe read
             * back `line: -3, snapToLines: true` while the screenshot still
             * showed the cue sitting on top of the buttons. Chrome lays the cue
             * out when it becomes active and does not watch it afterwards.
             * Toggling the track's mode forces that layout to be redone.
             *
             * `changed` is what makes this terminate: the toggle re-fires
             * cuechange, the second pass finds every line already -3, and it
             * stops. Without the guard this is an infinite loop. */
            if (changed && track.mode === "showing") {
              track.mode = "hidden";
              track.mode = "showing";
            }
          };
          lift();
          track.addEventListener("cuechange", lift);
        }
        break;
      }
    }
  }

  // Returns its own teardown: the video goes home on restore, the bar's
  // document does not, and listeners left bound to the page's element would
  // keep firing into a torn-down window once per PiP session, forever.
  const detach = opts.inWindowControls ? buildControls(doc, stage, video) : null;

  /* RUNS AT MOST ONCE. `restore` is reachable from two directions — the
   * pagehide listener below, and the handle this function returns — so a close
   * that also triggers an explicit teardown calls it twice. The second call
   * would find `__pipHome` already deleted and fall through to the
   * `document.body.appendChild` fallback, YANKING the already-restored video out
   * of the site's player and dropping it at the end of the body: a visible,
   * permanent regression on the user's page, produced by the one function whose
   * whole job is to prevent one. It would also report the window closed a second
   * time, clearing an activePip record that may by then belong to a NEW window.
   *
   * A closure flag, not a `__pipHome` check: the record is page-global and a
   * later session legitimately writes a new one. */
  let restored = false;
  const restore = function () {
    if (restored) return;
    restored = true;
    if (detach) detach();
    const h = (window as unknown as { __pipHome?: { parent: Node | null; next: Node | null } })
      .__pipHome;
    if (h && h.parent) h.parent.insertBefore(video, h.next);
    else document.body.appendChild(video);
    delete (window as unknown as { __pipHome?: unknown }).__pipHome;
    delete (window as unknown as { __pipWin?: unknown }).__pipWin;

    /* TELL THE WORKER, and deliberately AFTER the video is back.
     *
     * The worker wrote `activePip` when it opened this window and reads it on
     * the next toolbar click to choose between "open" and "exit". Nothing in
     * Chrome tells it the window went away, so without this message the next
     * click takes the EXIT branch against a window that no longer exists and
     * does NOTHING — a dead toolbar button with no error and no toast.
     *
     * ORDER IS THE POINT. Restoring the user's video is what the user can SEE;
     * this is bookkeeping. A terminated worker makes sendMessage reject with
     * "Could not establish connection" — routine, not exceptional — and a throw
     * from here must never be able to strand the <video> inside a closing
     * window. Hence: move first, message second, and swallow both shapes of
     * failure (the promise form REJECTS, the callback form THROWS synchronously
     * once the extension context is invalidated).
     *
     * `chrome.runtime` is absent in a plain page context and `.id` goes
     * undefined after an extension update or reload mid-session, so both are
     * checked rather than assumed.
     *
     * The type is INLINED rather than imported from ./messages — rule 1: this
     * body is shipped as source text and may name no outside identifier. The
     * two spellings are held together by a test that reads this file. */
    try {
      const c = (
        window as unknown as {
          chrome?: { runtime?: { id?: string; sendMessage?: (m: unknown) => unknown } };
        }
      ).chrome;
      if (c && c.runtime && c.runtime.id && c.runtime.sendMessage) {
        const p = c.runtime.sendMessage({ type: "PIP_DPIP_CLOSED" });
        if (p && typeof (p as Promise<unknown>).catch === "function") {
          (p as Promise<unknown>).catch(function () {
            /* worker asleep; the video is already home, which is what matters */
          });
        }
      }
    } catch (_e) {
      /* extension context invalidated */
    }
  };
  win.addEventListener("pagehide", restore);
  return { restore: restore };

  /* ------------------------------------------------------------------------
   * NESTED ON PURPOSE — RULE 1. This is a function DECLARATION inside
   * enhanceWindow's body, so it is hoisted (the call above it is fine) and it
   * travels inside the source text executeScript ships. Lifted to module scope
   * it would compile, pass every unit test that imports the module, and
   * ReferenceError in the user's browser.
   * ----------------------------------------------------------------------*/
  function buildControls(d: Document, mount: HTMLElement, v: HTMLVideoElement): () => void {
    const bar = d.createElement("div");
    bar.className = "pip-bar";

    const button = function (id: string, label: string, aria: string, onClick: () => void) {
      const b = d.createElement("button");
      b.className = "pip-btn";
      b.type = "button";
      b.textContent = label;
      b.setAttribute("aria-label", aria);
      /* A STABLE HOOK ALONGSIDE THE MOVING LABEL. The play button's aria-label
       * is the name of the ACTION and therefore has to flip between "Play" and
       * "Pause" as playback changes — a button that announces "Pause" while it
       * would start playback misinforms exactly the users who depend on it
       * most. That makes aria-label useless as a SELECTOR, because what it says
       * depends on when you look. data-pip never changes, so tests and any
       * later feature address the controls by it and the label stays free to
       * tell the truth. */
      b.setAttribute("data-pip", id);
      b.addEventListener("click", onClick);
      bar.appendChild(b);
      return b;
    };

    const play = button("play", "❚❚", "Pause", function () {
      if (v.paused) void v.play();
      else v.pause();
    });
    button("back", "−10s", "Back ten seconds", function () {
      v.currentTime = Math.max(0, v.currentTime - 10);
    });
    button("forward", "+10s", "Forward ten seconds", function () {
      v.currentTime = v.currentTime + 10;
    });
    const speed = button("speed", "1×", "Playback speed", function () {
      /* NOT `steps.indexOf(v.playbackRate)`. indexOf returns -1 for any rate
       * that is not in this list — and a site can set one: 1.75 is on YouTube's
       * own menu and on most HTML5 player menus. `(-1 + 1) % 5` is 0, so the
       * user's first press on a 1.75x video SLOWS IT DOWN to 1x with nothing to
       * explain why, and the same press on a 3x video does too.
       *
       * "Smallest step strictly greater than the current rate, wrapping to the
       * smallest step" is the identical cycle for every on-list rate — the list
       * 1, 1.25, 1.5, 2, 0.5 is a rotation of its own sorted order, which is
       * what makes that true — and it is DEFINED for every off-list one: 1.75
       * goes up to 2, 3 wraps to 0.5. It also does not depend on an exact
       * float match, so a rate the browser rounded still advances. */
      const steps = [0.5, 1, 1.25, 1.5, 2];
      let next = steps[0];
      for (let i = 0; i < steps.length; i++) {
        if (steps[i] > v.playbackRate) {
          next = steps[i];
          break;
        }
      }
      v.playbackRate = next;
      sync();
    });

    const time = d.createElement("span");
    time.className = "pip-time";
    bar.appendChild(time);

    const fmt = function (s: number): string {
      // captureStream() and every real live stream report Infinity, and
      // currentTime is NaN before metadata lands. Both would render "NaN:NaN".
      if (!isFinite(s)) return "live";
      const m = Math.floor(s / 60);
      const r = Math.floor(s % 60);
      return m + ":" + (r < 10 ? "0" : "") + r;
    };
    const sync = function () {
      play.textContent = v.paused ? "▶" : "❚❚";
      play.setAttribute("aria-label", v.paused ? "Play" : "Pause");
      // Read BACK off the element rather than echoing what was assigned: the UA
      // clamps playbackRate, and a readout that reported the request instead of
      // the result would be confidently wrong at the edges.
      const rate = isFinite(v.playbackRate) ? v.playbackRate : 1;
      speed.textContent = rate + "×";
      time.textContent = fmt(v.currentTime) + " / " + fmt(v.duration);
    };
    // `ratechange` is here and not only in the speed handler because the PAGE
    // can change the rate too — the bar has to follow the video, not its own
    // last click.
    const events = ["timeupdate", "play", "pause", "ratechange"];
    for (let i = 0; i < events.length; i++) v.addEventListener(events[i], sync);
    // Called before the bar is mounted so the first painted frame already shows
    // the video's REAL state — a hardcoded "1×" over a video the site started
    // at 1.5x is a confident lie about the one thing the readout is for.
    sync();

    mount.appendChild(bar);
    return function () {
      for (let i = 0; i < events.length; i++) v.removeEventListener(events[i], sync);
    };
  }
}
