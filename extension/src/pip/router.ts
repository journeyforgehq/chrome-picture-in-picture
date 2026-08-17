/* The one place that decides which PiP implementation a click gets.
 *
 * PURE — no chrome.*, no I/O, no DOM. It is called from inside the injected
 * function, where every branch has to be cheap and none may suspend.
 *
 * The spec (§Message contract) says this is "resolved by pip-router in the
 * worker, never decided page-side". S-11 measured that it cannot be: reading
 * the tier in chrome.action.onClicked requires an await, and the worker's
 * gesture scope is turn-based — `await Promise.resolve()`, 0ms, no IPC, still
 * loses the gesture. Amendment A-04. The worker supplies a CACHE of the inputs
 * synchronously; this function consumes them wherever it runs.
 */
import type { Tier } from "../contract";

export type PipMode = "native" | "document";

export interface RouteInput {
  tier: Tier;
  enhancedWindow: boolean;
  /** `"documentPictureInPicture" in window` — evaluated in the target frame. */
  documentPipSupported: boolean;
}

/** Native is the default and every failure routes back to it. The enhanced
 *  window requires all three conditions; anything else still floats a video. */
export function decideMode(input: RouteInput): PipMode {
  if (input.tier !== "pro") return "native";
  if (!input.enhancedWindow) return "native";
  if (!input.documentPipSupported) return "native";
  return "document";
}
