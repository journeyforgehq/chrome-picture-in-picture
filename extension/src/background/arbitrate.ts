/* ============================================================================
 * arbitrate — which frame acts. PURE. No chrome.*, no I/O.
 * ============================================================================
 *
 * The worker cannot enumerate a tab's frames: that needs chrome.webNavigation,
 * and the manifest's three-permission allowlist is not negotiable (R-04,
 * test/manifest.test.ts). Frames therefore self-register by messaging the
 * worker, which reads sender.frameId for free, and this module turns the
 * resulting pile of reports into one verdict.
 *
 * Everything here is a value transform, so the decision is exhaustively
 * testable without a browser — the same split as action.ts/decideOutcome.
 * ==========================================================================*/

/** frameId -> that frame's best score, or null when it has no candidate. */
export type FrameScores = Record<number, number | null>;

/** tabId -> its frames' scores. */
export type TabScores = Record<number, FrameScores>;

/**
 * Given every frame's reported score, which frameId should act? Null when
 * nobody has a candidate.
 *
 * Ties break toward the LOWEST frameId. Frame 0 is the top frame, so a tie
 * between the page and an embed resolves to the page — the same answer the
 * extension gives with no content script installed at all, which makes
 * arbitration a refinement of the default rather than a different regime.
 */
export function pickWinner(scores: FrameScores): number | null {
  let winner: number | null = null;
  let best = -Infinity;

  for (const key of Object.keys(scores)) {
    const frameId = Number(key);
    if (!Number.isFinite(frameId)) continue;

    const score = scores[frameId];
    // null = "no candidate here". NaN survives a JSON/structured-clone round
    // trip from a misbehaving frame and would poison every comparison.
    if (typeof score !== "number" || Number.isNaN(score)) continue;

    if (score > best || (score === best && winner !== null && frameId < winner)) {
      best = score;
      winner = frameId;
    }
  }

  return winner;
}

/** Copy-on-write: record one frame's score for one tab. */
export function recordScore(
  all: TabScores,
  tabId: number,
  frameId: number,
  score: number | null
): TabScores {
  return { ...all, [tabId]: { ...(all[tabId] ?? {}), [frameId]: score } };
}

/**
 * Forget a frame. Called when tabs.sendMessage to it rejects — a frame that
 * navigated away cannot receive, and without webNavigation that rejection is
 * the ONLY liveness signal there is.
 */
export function pruneFrame(all: TabScores, tabId: number, frameId: number): TabScores {
  const frames = all[tabId];
  if (!frames || !(frameId in frames)) return all;

  const next = { ...frames };
  delete next[frameId];

  const out = { ...all };
  if (Object.keys(next).length === 0) delete out[tabId];
  else out[tabId] = next;
  return out;
}

/** Forget a whole tab, so the session map cannot grow without bound. */
export function dropTab(all: TabScores, tabId: number): TabScores {
  if (!(tabId in all)) return all;
  const out = { ...all };
  delete out[tabId];
  return out;
}
