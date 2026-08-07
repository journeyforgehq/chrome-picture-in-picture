/// <reference types="chrome" />
import { config } from "../billing/config";

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
}
