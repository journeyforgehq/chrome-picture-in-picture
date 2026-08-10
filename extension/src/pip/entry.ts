/* ============================================================================
 * pipEntry — THE INJECTED FUNCTION. READ THIS BEFORE YOU TOUCH IT.
 * ============================================================================
 *
 * This function is shipped to the page by
 *   chrome.scripting.executeScript({ func: pipEntry })
 * which serializes it with Function.prototype.toString() and evaluates the
 * resulting SOURCE TEXT inside the target frame. The module this file compiles
 * to does not exist over there. Four rules follow, all of them measured
 * rather than assumed:
 *
 * 1. NO OUTSIDE IDENTIFIERS. The body may not reference anything declared
 *    outside itself — no imports, no module-level constants, no helper
 *    functions, no closure variables. TypeScript compiles such a reference
 *    happily and the user gets a ReferenceError in their browser. Every helper
 *    lives inside the body. (Types are fine: they are erased before
 *    .toString() ever sees the source.) test/pip/entry.test.ts rebuilds this
 *    function from its own source text in a bare scope to catch violations.
 *
 * 2. NO `await` ANYWHERE, AND NOTHING MAY SUSPEND ABOVE
 *    requestPictureInPicture(). Transient user activation is spent by the first
 *    suspension point, and PiP then fails with NotAllowedError. Two spike runs
 *    died on this — the second one inside the fix for the first.
 *
 *    The precise invariant is "the CALL happens synchronously inside the
 *    gesture turn", not "the function returns synchronously". The activation is
 *    already spent by the time the call returns, so observing its RESULT costs
 *    nothing — and the real-PiP branch does exactly that, returning
 *    `promise.then(...)` so an asynchronous rejection is reported instead of
 *    swallowed (see rule 3). It uses `.then`, never `async`/`await`: three
 *    tests in test/pip/entry.test.ts assert that no `await` appears anywhere in
 *    this source and that pipEntry is not an async function.
 *
 *    THE dryRun PATH STAYS STRICTLY SYNCHRONOUS. content.ts's localScore()
 *    temporarily lifts window.__pipCoord around a dryRun call and relies on
 *    nothing being able to observe the window in between. Only the real-PiP
 *    branch is ever thenable; a test pins that too.
 *
 * 3. REPORT THE ASYNCHRONOUS REJECTION. MEASURED: a gesture-less
 *    requestPictureInPicture() does NOT throw — it returns a promise and
 *    rejects it with NotAllowedError, so a try/catch around the call sees
 *    nothing. This function used to swallow that with `.catch(() => {})` and
 *    return an optimistic PIP_OK, which made background/action.ts's
 *    SecurityError -> IFRAME_BLOCKED and NotAllowedError -> PIP_REFUSED
 *    toasts UNREACHABLE: the user clicked, no window opened, and nothing was
 *    said. For a product whose only feedback channel is that toast, silence on
 *    failure is the worst possible outcome. Both failure shapes — synchronous
 *    throw and asynchronous rejection — now return the same
 *    { outcome: "THREW", errorName } result.
 *
 * 4. THIS FRAME MAY NOT BE THE ONE THAT ACTS. Every frame gets injected, and a
 *    measurement caught three frames all calling PiP with the last one
 *    silently winning. Arbitration is pre-computed by the content script into
 *    window.__pipCoord = { isWinner }. When that is absent — the ordinary case
 *    — the top frame acts and subframes stand down.
 * ==========================================================================*/

export interface PipEntryOptions {
  dryRun?: boolean;
}

export interface PipCandidate {
  label: string;
  score: number;
  width: number;
  height: number;
}

export type PipEntryReason =
  | "none-found"
  | "not-ready"
  | "pip-disabled-by-site"
  | "not-winner"
  | "pip-unavailable";

export interface PipEntryResult {
  frame: "TOP" | "SUBFRAME";
  acted: boolean;
  winner: PipCandidate | null;
  candidates: PipCandidate[];
  reason?: PipEntryReason;
  outcome?: "PIP_OK" | "PIP_EXITED" | "THREW";
  errorName?: string;
}

/**
 * dryRun is synchronous BY CONTRACT — see rule 2. The overload keeps that
 * promise in the type system so content.ts's localScore() can read .winner off
 * the result without a cast, and so a future edit that made the dryRun path
 * thenable would fail to compile rather than silently turn localScore's
 * __pipCoord lift into a race.
 */
export function pipEntry(options: PipEntryOptions & { dryRun: true }): PipEntryResult;
export function pipEntry(options?: PipEntryOptions): PipEntryResult | Promise<PipEntryResult>;
export function pipEntry(options: PipEntryOptions = {}): PipEntryResult | Promise<PipEntryResult> {
  const dryRun = options.dryRun === true;
  const isTop = window === window.top;
  const frame: "TOP" | "SUBFRAME" = isTop ? "TOP" : "SUBFRAME";

  // --- frame arbitration -----------------------------------------------
  const coord = (window as any).__pipCoord;
  const isWinner = coord ? coord.isWinner === true : isTop;
  if (!isWinner) {
    return { frame, acted: false, winner: null, candidates: [], reason: "not-winner" };
  }

  // --- second click puts the video back --------------------------------
  if (!dryRun && document.pictureInPictureElement) {
    const exiting = document.exitPictureInPicture();
    if (exiting && typeof exiting.catch === "function") {
      exiting.catch(function () {
        /* the window was already gone; nothing to report */
      });
    }
    return { frame, acted: true, winner: null, candidates: [], outcome: "PIP_EXITED" };
  }

  // The ONLY place `pip-unavailable` is produced, and it happens BEFORE any
  // call to requestPictureInPicture(). That ordering is what lets action.ts
  // treat a later NotAllowedError as PIP_REFUSED rather than "turned off":
  // getting past this line proves picture-in-picture is enabled here.
  if (!document.pictureInPictureEnabled) {
    return { frame, acted: false, winner: null, candidates: [], reason: "pip-unavailable" };
  }

  // --- collect every <video>, descending into OPEN shadow roots --------
  // Closed roots are unreachable by design: `shadowRoot` reads null there, so
  // those videos simply never become candidates. That degrades to "not found",
  // which is the intended behaviour — it must never throw.
  const videos: HTMLVideoElement[] = [];
  const collect = function (root: Document | ShadowRoot): void {
    let elements: Element[];
    try {
      elements = Array.prototype.slice.call(root.querySelectorAll("*"));
    } catch (_e) {
      return;
    }
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.tagName === "VIDEO") videos.push(el as HTMLVideoElement);
      const sub = (el as HTMLElement).shadowRoot;
      if (sub) collect(sub);
    }
  };
  collect(document);

  // --- filter, recording the strongest rejection reason ----------------
  let sawDisabled = false;
  let sawNotReady = false;

  interface Scored {
    el: HTMLVideoElement;
    candidate: PipCandidate;
    area: number;
    order: number;
    /** Kept for the PAGE-AWARE term below, which cannot run until all are in. */
    duration: number;
    playing: boolean;
  }
  const scored: Scored[] = [];

  for (let i = 0; i < videos.length; i++) {
    const el = videos[i];

    if (el.disablePictureInPicture === true || el.hasAttribute("disablepictureinpicture")) {
      sawDisabled = true;
      continue;
    }
    if (el.readyState < 2) {
      sawNotReady = true;
      continue;
    }
    if (!el.videoWidth || !el.videoHeight) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 100) continue;

    const style = window.getComputedStyle(el);
    if (style) {
      if (style.display === "none") continue;
      if (style.visibility === "hidden") continue;
      const opacity = parseFloat(style.opacity);
      if (!isNaN(opacity) && opacity <= 0.1) continue;
    }

    const duration = el.duration;
    // Live streams report Infinity and MUST survive the short-clip filter.
    if (duration !== Infinity && !(duration > 5)) continue;

    // --- score ---------------------------------------------------------
    const area = rect.width * rect.height;
    const viewW = window.innerWidth || 0;
    const viewH = window.innerHeight || 0;
    const overlapW = Math.max(0, Math.min(rect.right, viewW) - Math.max(rect.left, 0));
    const overlapH = Math.max(0, Math.min(rect.bottom, viewH) - Math.max(rect.top, 0));
    const ratio = area > 0 ? (overlapW * overlapH) / area : 0;

    let score = 0;
    score += el.paused ? 0 : 1000;
    score += el.muted ? 0 : 200;
    score += ratio * 500;
    score += Math.min(area / 200000, 1) * 300;
    // R-14, term 1 of 2. 65 seconds, not 30.
    // 15s, 30s and 60s are the three pre-roll lengths that are actually sold,
    // and at `< 30` the last two collected no penalty at all and then won on
    // rendered area, because an ad unit is routinely larger than the content
    // player it interrupts (measured on b13: ad 1791, content 1500). 65 clears
    // 60s with margin for a slate or a duration that reports slightly long.
    // ACCEPTED COST: a genuinely short MUTED clip is penalised. It is muted, so
    // it is rarely what somebody wants floated, and every other term still
    // favours a real video.
    // This term is per-video and gated on MUTED, so it says nothing about an
    // unmuted advert. Term 2 — the page-aware one, below this loop — is the one
    // that does, and it needs every candidate's duration before it can score
    // any of them. That is why this function scores in two passes.
    if (duration < 65 && el.muted) score -= 400;

    const label = el.dataset.label || el.id || "video-" + i;
    scored.push({
      el: el,
      candidate: { label: label, score: score, width: rect.width, height: rect.height },
      area: area,
      order: i,
      duration: duration,
      playing: !el.paused,
    });
  }

  /* ==========================================================================
   * R-14, term 2 of 2 — THE PAGE-AWARE ONE. Option B.
   * ==========================================================================
   * Every other term above is per-video, and that is precisely why term 1 could
   * not settle the case this one exists for. Gated on `el.muted`, it never
   * fires on an UNMUTED advert — and a pre-roll playing at player volume is not
   * muted. Measured on e2e/fixtures/e08-unmuted-ad-same-slot.html, an unmuted
   * 15s ad in the same slot as a live stream scored 1991.3541666666665 against
   * the stream's 1991.3541666666665 — bit-identical, every per-video term
   * cancelling — and the ad won because it was earlier in the DOM. A coin flip,
   * not a decision.
   *
   * THE SIGNAL: an advert is short RELATIVE TO THE CONTENT IT INTERRUPTS,
   * whether or not it has sound. A 15s roll beside a 40-minute stream is
   * unambiguous. Two 10-minute videos on one page are not, and correctly get
   * nothing — the term is a comparison, so it has no cliff to sit on the wrong
   * side of, which is the whole reason it is shaped this way rather than as
   * another absolute threshold.
   *
   * MEASURED ARITHMETIC, not assumed:
   *   Infinity >= 4 * 15        -> true   a live stream penalises an ad roll
   *   15       >= 4 * Infinity  -> false  nothing penalises the stream
   *   Infinity >= 4 * Infinity  -> TRUE, and that is why the isFinite guard is
   *                               here: without it two live streams — and the
   *                               fixture suite is full of them, since
   *                               captureStream reports Infinity — would
   *                               penalise each other symmetrically.
   *   NaN and 0 cannot reach this loop at all: the `duration > 5` filter above
   *   drops both (NaN > 5 is false, 0 > 5 is false). isFinite would exclude NaN
   *   anyway, and `x >= 4 * NaN` is false in either direction.
   *
   * WHY 500. It has to clear the largest lead an advert holds anywhere in the
   * measured suite: on b13 the ad led on geometry alone by 291 (ad 1791 vs
   * content 1500) while muted, and the same ad UNMUTED — this term's actual
   * case — would also keep the +200 audio bonus, so 491. 500 clears that, and
   * on e08 it converts a 0-point tie into a 500-point decision.
   * The ceiling is +1000, the playing term, and the invariant is stronger than
   * "this term alone stays under it": 400 + 500 = 900 < 1000, so even a video
   * carrying BOTH advert penalties still outranks an otherwise identical PAUSED
   * one. No combination of advert signals can overturn `playing`.
   * NOT COVERED, stated rather than implied: an ad that is fully on screen
   * against content that is entirely off it leads by up to 800 (500 of
   * intersection + 300 of area), and no penalty below 1000 can be both large
   * enough for that and small enough to keep the invariant above. At that point
   * the advert is the only video the user can actually see.
   * ========================================================================*/
  for (let i = 0; i < scored.length; i++) {
    const mine = scored[i];
    if (!isFinite(mine.duration)) continue;
    for (let j = 0; j < scored.length; j++) {
      if (j === i) continue;
      const other = scored[j];
      // A PAUSED long video does not accuse anything: nothing is being
      // interrupted, so a short clip that is actually playing is still the
      // thing the user is watching.
      if (!other.playing) continue;
      if (other.duration >= 4 * mine.duration) {
        mine.candidate.score -= 500;
        break;
      }
    }
  }

  scored.sort(function (a, b) {
    if (b.candidate.score !== a.candidate.score) return b.candidate.score - a.candidate.score;
    if (b.area !== a.area) return b.area - a.area;
    return a.order - b.order;
  });

  const candidates = scored.map(function (s) {
    return s.candidate;
  });

  if (scored.length === 0) {
    const reason: PipEntryReason = sawDisabled
      ? "pip-disabled-by-site"
      : sawNotReady
        ? "not-ready"
        : "none-found";
    return { frame, acted: false, winner: null, candidates: candidates, reason: reason };
  }

  const best = scored[0];

  if (dryRun) {
    return { frame, acted: true, winner: best.candidate, candidates: candidates };
  }

  // ONE shape for BOTH failure modes. PiP can fail two ways — a synchronous
  // throw, and a promise rejection — and the two used to be reported
  // differently (the rejection was not reported at all). Building the result in
  // one place is what keeps them from drifting apart again.
  //
  // Not `instanceof Error`: the failure can cross a realm boundary, where the
  // page's Error is a different constructor than ours.
  const failed = function (err: { name?: string } | null | undefined): PipEntryResult {
    return {
      frame,
      acted: true,
      winner: best.candidate,
      candidates: candidates,
      outcome: "THREW",
      errorName: (err && err.name) || "Error",
    };
  };
  const entered: PipEntryResult = {
    frame,
    acted: true,
    winner: best.candidate,
    candidates: candidates,
    outcome: "PIP_OK",
  };

  // NOTHING may suspend above this line — see rule 2 in the header block.
  // (The two declarations above are plain assignments; they cannot suspend.)
  try {
    const entering = best.el.requestPictureInPicture();

    // The activation was already spent by the call above, so observing the
    // result costs nothing — and NOT observing it is what made the failure
    // toasts unreachable. `.then`, never async/await: see rule 2. Guarded
    // rather than assumed: a stub or an older engine may return undefined.
    if (entering && typeof entering.then === "function") {
      return entering.then(function () {
        return entered;
      }, failed);
    }
    return entered;
  } catch (err) {
    return failed(err as { name?: string } | null | undefined);
  }
}
