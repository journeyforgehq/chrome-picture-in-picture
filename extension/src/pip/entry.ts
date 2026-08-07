/* ============================================================================
 * pipEntry — THE INJECTED FUNCTION. READ THIS BEFORE YOU TOUCH IT.
 * ============================================================================
 *
 * This function is shipped to the page by
 *   chrome.scripting.executeScript({ func: pipEntry })
 * which serializes it with Function.prototype.toString() and evaluates the
 * resulting SOURCE TEXT inside the target frame. The module this file compiles
 * to does not exist over there. Three rules follow, all of them measured
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
 * 2. NO `await` ABOVE requestPictureInPicture(). Transient user activation is
 *    spent by the first suspension point, and PiP then throws
 *    NotAllowedError. Two spike runs died on this — the second one inside the
 *    fix for the first. The whole function is synchronous, and it stays that
 *    way. A test asserts no `await` appears before the call in the source.
 *
 * 3. THIS FRAME MAY NOT BE THE ONE THAT ACTS. Every frame gets injected, and a
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

export function pipEntry(options: PipEntryOptions = {}): PipEntryResult {
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
    if (duration < 30 && el.muted) score -= 400;

    const label = el.dataset.label || el.id || "video-" + i;
    scored.push({
      el: el,
      candidate: { label: label, score: score, width: rect.width, height: rect.height },
      area: area,
      order: i,
    });
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

  // NOTHING may suspend above this line — see rule 2 in the header block.
  try {
    const entering = best.el.requestPictureInPicture();
    if (entering && typeof entering.catch === "function") {
      entering.catch(function () {
        /* rejected asynchronously; the caller reports via its own channel */
      });
    }
    return {
      frame,
      acted: true,
      winner: best.candidate,
      candidates: candidates,
      outcome: "PIP_OK",
    };
  } catch (err) {
    // Not `instanceof Error`: the throw can cross a realm boundary, and the
    // page's Error is a different constructor than ours.
    const thrown = err as { name?: string } | null | undefined;
    return {
      frame,
      acted: true,
      winner: best.candidate,
      candidates: candidates,
      outcome: "THREW",
      errorName: (thrown && thrown.name) || "Error",
    };
  }
}
