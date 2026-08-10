/* ============================================================================
 * decideOutcome — what, if anything, to tell the user after a click.
 * ============================================================================
 *
 * PURE. No chrome.*, no I/O, no side effects. The gesture-critical wiring in
 * background.ts must stay a thin shell around executeScript (see INVARIANT 1
 * there), so every branch worth testing lives here instead, where it can be
 * exercised exhaustively without a browser.
 *
 * The input is one PipEntryResult per injected frame. Success is SILENT: the
 * PiP window appearing is its own feedback, and a toast on top of it would be
 * noise. Only a failure earns the one channel this product has.
 * ==========================================================================*/

import type { PipEntryResult } from "../pip/entry";
import type { PipErrorCode } from "../pip/errors";

export interface ActionOutcome {
  toast: PipErrorCode | null;
}

export function decideOutcome(results: PipEntryResult[]): ActionOutcome {
  // Nothing was injectable at all — chrome://, the Web Store, the PDF viewer.
  // There is no page to draw a toast into; the caller falls back to the icon
  // tooltip, which is why RESTRICTED_URL's severity is "tooltip".
  if (results.length === 0) return { toast: "RESTRICTED_URL" };

  // Some frame actually reached requestPictureInPicture()/exit. Its verdict
  // wins outright: whatever the other frames reported, arbitration already
  // picked this one.
  const actor = results.find((r) => r.acted && r.outcome);
  if (actor) {
    if (actor.outcome === "PIP_OK" || actor.outcome === "PIP_EXITED") return { toast: null };
    if (actor.errorName === "SecurityError") return { toast: "IFRAME_BLOCKED" };
    // NOT PIP_UNAVAILABLE. Reaching this line means entry.ts got past its
    // `document.pictureInPictureEnabled` guard — that guard returns the
    // `pip-unavailable` REASON below without ever calling the API — so
    // picture-in-picture was enabled and the request was refused for another
    // cause, almost always a spent user activation. See errors.ts.
    if (actor.errorName === "NotAllowedError") return { toast: "PIP_REFUSED" };
    return { toast: "NO_VIDEO" };
  }

  // Nobody acted. Pick the most specific explanation present anywhere, so a
  // subframe that knows WHY beats a top frame that merely found nothing.
  // `not-winner` is deliberately absent: standing down is arbitration working,
  // not a failure, and it falls through to NO_VIDEO.
  const reasons = new Set(results.map((r) => r.reason));
  if (reasons.has("pip-unavailable")) return { toast: "PIP_UNAVAILABLE" };
  if (reasons.has("pip-disabled-by-site")) return { toast: "SITE_DISABLED" };
  if (reasons.has("not-ready")) return { toast: "NOT_READY" };
  return { toast: "NO_VIDEO" };
}
