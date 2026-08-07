/// <reference types="chrome" />
import { config } from "../billing/config";
import { decideOutcome } from "./action";
import { pipEntry } from "../pip/entry";
import type { PipEntryResult } from "../pip/entry";
import { showToast } from "../pip/toast";
import { messageFor, severityFor } from "../pip/errors";
import { getSettings, setActivePip, clearActivePip } from "../pip/state";

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
