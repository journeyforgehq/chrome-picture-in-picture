/// <reference types="chrome" />
import { config } from "../billing/config";
import { decideOutcome } from "./action";
import { pickWinner, recordScore, pruneFrame, dropTab, type TabScores } from "./arbitrate";
import { PIP_COORD, PIP_SCORE_REPORT } from "../pip/messages";
import { pipEntry } from "../pip/entry";
import type { PipEntryResult } from "../pip/entry";
import { showToast } from "../pip/toast";
import { messageFor, severityFor } from "../pip/errors";
import { getSettings, setSettings, setActivePip, clearActivePip } from "../pip/state";
import { ensureRegistered, ensureUnregistered } from "./registration";

export interface InstalledDetails {
  reason: string; // chrome.runtime.OnInstalledReason, kept as string for pure-function testability
}

/**
 * Pure decision logic for chrome.runtime.onInstalled: open the welcome page
 * exactly once, only on a fresh install, only if WELCOME_URL is configured.
 * `openTab` is injected so this is testable without a real chrome.tabs API.
 */
export function handleInstalled(
  details: InstalledDetails,
  welcomeUrl: string,
  openTab: (url: string) => void
): void {
  if (details.reason !== "install") return;
  if (!welcomeUrl) return;
  openTab(welcomeUrl);
}

/**
 * Pure decision logic for chrome.runtime.setUninstallURL: returns the URL to
 * register when the extension is removed, or null when none is configured (or
 * the configured value is malformed — a bad URL must not throw at SW startup).
 *
 * The extension `version` is appended as `?v=` so uninstall feedback can be
 * bucketed by release. PRIVACY: only the version is ever appended — never the
 * deviceId or any identifier. `setUninstallURL` sends the page (and thus the
 * user's IP) to your server on removal, so we keep the payload non-identifying.
 */
export function uninstallUrl(configuredUrl: string, version: string): string | null {
  if (!configuredUrl) return null;
  try {
    const u = new URL(configuredUrl);
    if (version) u.searchParams.set("v", version);
    return u.toString();
  } catch {
    return null;
  }
}

export interface RelayMessage {
  type: string;
  [key: string]: unknown;
}

export interface RelayResult {
  handled: boolean;
}

/**
 * Message relay stub. No message types are handled yet — this exists as
 * the single place future features register runtime.onMessage handlers,
 * kept as a pure function so routing logic stays unit-testable.
 */
export function handleMessage(_message: RelayMessage): RelayResult {
  return { handled: false };
}

/* ============================================================================
 * Frame arbitration — the worker half. See src/content/content.ts for the why.
 * ============================================================================
 *
 * There is no API here that can enumerate a tab's frames: chrome.webNavigation
 * would, and the three-permission manifest forbids it (R-04). So frames
 * announce themselves, and `sender.frameId` — which arrives free on every
 * runtime message — is the frame table. The verdict goes back with
 * chrome.tabs.sendMessage(tabId, msg, { frameId }), which needs a host
 * permission for that tab but NOT the "tabs" permission.
 *
 * None of this runs inside a click. The gesture path (below) reads a value
 * that was already written; nothing here can put the user activation at risk.
 * ==========================================================================*/

const FRAME_SCORES_KEY = "frameScores";

async function readFrameScores(): Promise<TabScores> {
  const stored = await chrome.storage.session.get(FRAME_SCORES_KEY);
  return (stored[FRAME_SCORES_KEY] as TabScores | undefined) ?? {};
}

async function writeFrameScores(all: TabScores): Promise<void> {
  await chrome.storage.session.set({ [FRAME_SCORES_KEY]: all });
}

// Reports from different frames of the same tab arrive interleaved, and each
// one is a read-modify-write on ONE storage key. Two in flight at once and the
// later write clobbers the earlier frame's entry. Serialising them costs
// nothing (they are already throttled to ~1/s/frame) and removes the race
// outright. Module state does not survive worker termination, which is fine:
// the chain just restarts empty, and storage is the real state.
let arbitrationChain: Promise<void> = Promise.resolve();

function enqueueArbitration(tabId: number, frameId: number, score: number | null): void {
  arbitrationChain = arbitrationChain
    .then(() => arbitrateTab(tabId, frameId, score))
    .catch(() => undefined);
}

async function arbitrateTab(tabId: number, frameId: number, score: number | null): Promise<void> {
  let all = recordScore(await readFrameScores(), tabId, frameId, score);
  const frames = Object.keys(all[tabId] ?? {}).map(Number);
  const winner = pickWinner(all[tabId] ?? {});

  // A frame that has navigated away rejects here, and that rejection is the
  // ONLY liveness signal available without webNavigation — so it is also how
  // stale entries get pruned. Nothing else ever removes them.
  const dead: number[] = [];
  await Promise.all(
    frames.map(async (id) => {
      try {
        await chrome.tabs.sendMessage(
          tabId,
          { type: PIP_COORD, isWinner: id === winner },
          { frameId: id }
        );
      } catch {
        dead.push(id);
      }
    })
  );

  for (const id of dead) all = pruneFrame(all, tabId, id);
  await writeFrameScores(all);
}

// --- chrome.* wiring (untested shell; exercised by e2e in a later plan) ---
if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  // Register the post-uninstall feedback page. setUninstallURL persists, but we
  // (re)set it on every service-worker startup so a URL change in a later
  // release takes effect — the call is idempotent and cheap.
  if (chrome.runtime.setUninstallURL) {
    const version = chrome.runtime.getManifest?.().version ?? "";
    const url = uninstallUrl(config.UNINSTALL_URL, version);
    if (url) chrome.runtime.setUninstallURL(url);
  }

  chrome.runtime.onInstalled.addListener((details) => {
    handleInstalled(details, config.WELCOME_URL, (url) => {
      chrome.tabs.create({ url });
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const result = handleMessage(message as RelayMessage);
    sendResponse(result);
    return false;
  });

  // Frame self-registration. Returns false (no async sendResponse): the frame
  // is telling, not asking, and holding the channel open for a verdict it will
  // receive on its own listener anyway would just be a second round trip.
  chrome.runtime.onMessage.addListener((message, sender) => {
    const msg = message as { type?: string; score?: unknown } | null;
    if (!msg || msg.type !== PIP_SCORE_REPORT) return false;
    // sender.tab is absent for messages from the options page; frameId
    // is 0 for a top frame, so `!frameId` would be wrong here.
    const tabId = sender.tab?.id;
    if (tabId === undefined || sender.frameId === undefined) return false;
    const score = typeof msg.score === "number" ? msg.score : null;
    enqueueArbitration(tabId, sender.frameId, score);
    return false;
  });

  // A closed tab's frames can never report again; without this the session map
  // grows for the life of the browser. (tabs.onRemoved needs no permission —
  // only the url/title/favIconUrl fields are gated by "tabs".)
  chrome.tabs.onRemoved?.addListener((tabId) => {
    arbitrationChain = arbitrationChain
      .then(async () => {
        const all = await readFrameScores();
        const next = dropTab(all, tabId);
        if (next !== all) await writeFrameScores(next);
      })
      .catch(() => undefined);
  });

  /* ==========================================================================
   * Embedded-player content-script registration lifecycle. See
   * src/background/registration.ts for why every call there is guarded.
   * ========================================================================*/

  // Restart survival is UNVERIFIED. The automated spike could not settle it:
  // Chrome treated every relaunch of an unpacked extension as a fresh
  // install, onStartup never fired, and there is no automated path to an
  // extension Chrome considers "installed". This re-assert is correct
  // EITHER WAY — if registrations do survive a restart this is a harmless
  // no-op (ensureRegistered guards on getRegisteredContentScripts first); if
  // they do not survive, this is what re-establishes them. Leave it until a
  // human verifies restart behaviour manually.
  chrome.runtime.onStartup?.addListener(() => {
    void (async () => {
      const settings = await getSettings();
      if (settings.embeddedPlayers) await ensureRegistered();
    })();
  });

  // LOAD-BEARING, not belt-and-braces. A spike measured that Chrome does NOT
  // auto-unregister a dynamically-registered content script when the host
  // permission it depended on is revoked from chrome://extensions: with
  // permissions.getAll().origins reduced to [], the script was still
  // registered and still ran on every page. Without this listener the
  // content script would keep running after the user believes they revoked
  // access, which would make the store listing's central claim false.
  chrome.permissions.onRemoved?.addListener(() => {
    void (async () => {
      await ensureUnregistered();
      await setSettings({ embeddedPlayers: false });
    })();
  });

  chrome.permissions.onAdded?.addListener((p) => {
    if (!p.origins?.includes("<all_urls>")) return;
    void (async () => {
      await setSettings({ embeddedPlayers: true });
      await ensureRegistered();
    })();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INVARIANT 1 — executeScript MUST be the first statement here, with NO await
  // before it. Transient user activation does not survive an await in the service
  // worker: a spike run failed because `await chrome.permissions.getAll()` sat on
  // this line and the injected script arrived with hasBeenActive false.
  // DIAGNOSTICS AND PERSISTENCE GO AFTER, INSIDE THE .then().
  //
  // One call serves both permission modes: under activeTab this reaches the top
  // frame only; with <all_urls> granted it reaches every frame. pipEntry
  // arbitrates in-frame, so the worker never has to ask which mode it is in —
  // and asking would itself have been a fatal await.
  // ═══════════════════════════════════════════════════════════════════════════
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;
    const tabId = tab.id;

    const injection = chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: pipEntry,
      args: [{}],
    });

    void (async () => {
      let frames: chrome.scripting.InjectionResult<PipEntryResult>[];
      try {
        frames = (await injection) as chrome.scripting.InjectionResult<PipEntryResult>[];
      } catch {
        // executeScript rejects on chrome://, the Web Store and the PDF viewer.
        await chrome.action.setTitle({ tabId, title: messageFor("RESTRICTED_URL") });
        return;
      }

      const results = frames.map((f) => f.result).filter(Boolean) as PipEntryResult[];
      const { toast } = decideOutcome(results);

      const winnerFrame = frames.find((f) => f.result?.acted && f.result?.outcome === "PIP_OK");
      if (winnerFrame?.result) {
        await setActivePip({
          tabId,
          frameId: winnerFrame.frameId ?? 0,
          label: winnerFrame.result.winner?.label ?? "",
        });
      } else if (results.some((r) => r.outcome === "PIP_EXITED")) {
        await clearActivePip();
      }

      if (!toast) return;
      if (!(await getSettings()).toastEnabled) return;
      if (severityFor(toast) === "tooltip") {
        await chrome.action.setTitle({ tabId, title: messageFor(toast) });
        return;
      }
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: showToast,
        args: [{ text: messageFor(toast), severity: severityFor(toast) as "info" | "blocked" }],
      });
    })();
  });
}
