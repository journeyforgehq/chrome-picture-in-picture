/// <reference types="chrome" />
/* ============================================================================
 * content.ts — the WRITE side of frame arbitration.
 * ============================================================================
 *
 * A page can hold many frames, each with a video. A spike measured three frames
 * all calling requestPictureInPicture() with the LAST one silently winning —
 * non-deterministic, and the user's video is whichever frame the scheduler
 * happened to run last. Somebody has to pick.
 *
 * It cannot be picked during the click. Transient user activation is spent by
 * the first await, and any cross-frame round trip inside the gesture destroys
 * it (see INVARIANT 1 in background.ts, and rule 2 in pip/entry.ts). So the
 * verdict has to be sitting in the frame BEFORE the click, where a synchronous
 * read can find it. pipEntry reads exactly one thing:
 *
 *     window.__pipCoord ? __pipCoord.isWinner === true : (window === window.top)
 *
 * This file writes it. The loop is:
 *
 *     frame  --PIP_SCORE_REPORT-->  worker      (worker reads sender.frameId)
 *     worker --PIP_COORD-------->   each frame  (tabs.sendMessage + {frameId})
 *
 * chrome.webNavigation would enumerate a tab's frames directly, but adding that
 * permission is off the table — the three-permission manifest is the product's
 * central claim (see test/manifest.test.ts). Frames therefore self-register:
 * sender.frameId comes free on every runtime message, and a frame that has
 * navigated away is detected by tabs.sendMessage rejecting, which is the only
 * liveness signal available without webNavigation.
 *
 * TWO THINGS IN HERE ARE LOAD-BEARING AND NON-OBVIOUS:
 *
 * 1. THE GUARD SITS ABOVE addListener. A spike measured that
 *    scripting.executeScript and scripting.registerContentScripts share ONE
 *    isolated world per extension per frame, and that the FILE BODY runs on
 *    every injection: three injections, three evaluations. With the guard above
 *    the registration the body still ran three times but the listener was added
 *    once. Without it, that frame holds three onMessage listeners and answers
 *    every message three times.
 *
 * 2. THIS BUNDLE MUST NEVER IMPORT antd OR ui-kit/, transitively either.
 *    webpack/separation-guard.cjs fails the build on it. pipEntry is the only
 *    import here, and it is dependency-free by construction.
 * ==========================================================================*/

import { pipEntry } from "../pip/entry";
import { PIP_COORD, PIP_SCORE_REPORT, PIP_SCORE_REQUEST } from "../pip/messages";

export { PIP_COORD, PIP_SCORE_REPORT, PIP_SCORE_REQUEST };

export interface PipCoord {
  isWinner: boolean;
  updatedAt: number;
}

declare global {
  interface Window {
    /** Set once per isolated world; keeps the listener from being added twice. */
    __pipInjected?: boolean;
    /** The pre-computed verdict pipEntry reads synchronously inside the click. */
    __pipCoord?: PipCoord;
  }
}

/**
 * Minimum gap between two score reports from one frame, in ms.
 *
 * WHY 1000. The events we listen on (play/pause/loadeddata/visibilitychange)
 * are not rare: an autoplaying feed, an ad break, a seek, or a page that
 * re-attaches its player fires them in bursts, and every one of them would
 * otherwise be a structured-clone message to the service worker — enough
 * traffic to keep the worker alive purely by accident, on every tab, forever.
 *
 * The ceiling on the interval is the only thing the user can feel: a click
 * arriving inside a stale window is arbitrated on scores up to 1s old. That
 * costs nothing, because the worst case is not "no PiP" — it is the previous
 * frame acting, and the very next click is correct. The floor is that the
 * report must survive the burst, which the TRAILING edge below guarantees: the
 * last state in a burst is always sent, just late. A leading-only throttle
 * would report the state at the START of an ad break and never correct it.
 */
export const SCORE_THROTTLE_MS = 1000;

/** Legacy presence marker on <html>. Kept so nothing observable was dropped. */
export const MARKER_ATTR = "data-picture-in-picture-present";

/** Set a presence marker on <html>. Idempotent. */
export function markPresent(doc: Document): void {
  doc.documentElement.setAttribute(MARKER_ATTR, "true");
}

/**
 * This frame's score for the tab-wide contest, or null when it has no
 * candidate at all.
 *
 * The __pipCoord dance is deliberate and must not be "simplified" away.
 * pipEntry is the single source of scoring truth (entry.ts is frozen — the
 * click path evaluates its SOURCE TEXT in the page), but its very first act is
 * to obey __pipCoord and return `not-winner`. A frame that has been told to
 * stand down would therefore report null forever and could never win the tab
 * back, no matter what its video did. So we lift the verdict for the duration
 * of the measurement and put it back.
 *
 * This is safe because pipEntry is entirely synchronous: no other code — page,
 * extension, or injected — can observe the window between these two lines.
 */
export function localScore(): number | null {
  const saved = window.__pipCoord;
  window.__pipCoord = { isWinner: true, updatedAt: Date.now() };
  try {
    return pipEntry({ dryRun: true }).winner?.score ?? null;
  } catch {
    // Scoring must never take the page down. A frame that throws is a frame
    // with no candidate, as far as arbitration is concerned.
    return null;
  } finally {
    if (saved === undefined) delete window.__pipCoord;
    else window.__pipCoord = saved;
  }
}

function setCoord(isWinner: boolean): void {
  window.__pipCoord = { isWinner, updatedAt: Date.now() };
}

/**
 * Install the arbitration listener + reporters in this frame. Safe to call any
 * number of times; only the first call does anything.
 */
export function installContentScript(): void {
  // ── THE GUARD. FIRST STATEMENT, ABOVE EVERYTHING. See note 1 in the header.
  if (window.__pipInjected) return;
  window.__pipInjected = true;

  // ── Seed the verdict SYNCHRONOUSLY, before any message can be sent.
  // A page that has just loaded has not coordinated yet. Without this seed
  // every frame reads "no coord" and falls back to `window === window.top`,
  // which is the same answer for the top frame but leaves subframes
  // unarbitrated the moment a content script exists in them at all. Seeding to
  // the top-frame default means the pre-coordination state is exactly the
  // no-content-script state: one actor, deterministically.
  setCoord(window === window.top);

  markPresent(document);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; isWinner?: boolean } | null;
    if (!msg || typeof msg.type !== "string") return false;

    if (msg.type === PIP_SCORE_REQUEST) {
      sendResponse({ score: localScore() });
      return false;
    }
    if (msg.type === PIP_COORD) {
      setCoord(msg.isWinner === true);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // ── Reporting, throttled (trailing edge). See SCORE_THROTTLE_MS.
  let lastSentAt = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const send = (): void => {
    lastSentAt = Date.now();
    try {
      const p = chrome.runtime.sendMessage({
        type: PIP_SCORE_REPORT,
        score: localScore(),
      }) as unknown as Promise<unknown> | undefined;
      // "Receiving end does not exist" is routine, not exceptional: the worker
      // may be asleep, or the extension may have been reloaded out from under
      // this orphaned world. Swallow it — the next event re-reports.
      if (p && typeof (p as Promise<unknown>).catch === "function") {
        (p as Promise<unknown>).catch(() => undefined);
      }
    } catch {
      /* context invalidated */
    }
  };

  const report = (): void => {
    if (pending !== null) return;
    const wait = Math.max(0, SCORE_THROTTLE_MS - (Date.now() - lastSentAt));
    if (wait === 0) {
      send();
      return;
    }
    pending = setTimeout(() => {
      pending = null;
      send();
    }, wait);
  };

  // Capture phase: <video> media events do not bubble, so a listener on the
  // document only sees them during capture. Passive: we never preventDefault,
  // and saying so keeps us off the page's input-latency critical path.
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener("play", report, opts);
  document.addEventListener("pause", report, opts);
  document.addEventListener("loadeddata", report, opts);
  document.addEventListener("visibilitychange", report, opts);

  send(); // once on install, unthrottled — this is the frame announcing itself
}

// Runtime entry point. Guarded so importing this module under vitest (where
// there is no chrome.*) does not auto-install and steal the tests' listener.
if (typeof document !== "undefined" && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  installContentScript();
}
