/* ============================================================================
 * pip state — storage accessors. TRUSTED EXTENSION CONTEXTS ONLY.
 * ============================================================================
 *
 * Unlike entry.ts and toast.ts, this module is NEVER injected into a page via
 * chrome.scripting.executeScript / Function.prototype.toString(). It is a
 * normal module imported by the service worker and by the options page, so
 * normal imports and module scope are fine here — the "no outside identifiers"
 * constraint on those two files does not apply to this one. It must NOT be
 * imported by the content script: getActivePip/setActivePip touch
 * storage.session, which is closed to content scripts (see note 2 below).
 *
 * Two measured facts shape what follows:
 *
 * 1. MV3 service workers are terminated after ~30s idle. No module-level
 *    variable can be trusted to survive between invocations, so there is
 *    deliberately NO in-memory cache here. Every function reads storage fresh
 *    on every call.
 *
 * 2. chrome.storage.session defaults to TRUSTED_CONTEXTS, and that default is
 *    correct. A spike measured that this blocks content scripts with
 *    `Error: Access to storage is not allowed from this context.` — an error
 *    opaque enough that widening the access level is the tempting WRONG first
 *    move. It is not needed: the same spike traced every message type and
 *    confirmed no content script reads or writes the active-PiP record. And
 *    the access level is per-STORE, not per-key, so widening it would expose
 *    the entire session store to every content script on every page, not
 *    just the one value someone wanted. The storage-area method that widens
 *    it must appear nowhere in this file, or anywhere else in src/ — see
 *    test/pip/state.test.ts for the enforced guard.
 * ==========================================================================*/

import type { SizePreset } from "./geometry";

export interface PipSettings {
  /** Requests <all_urls> when switched on; reaches videos inside embedded players. */
  embeddedPlayers: boolean;
  /** The toast. Off means silent failure, which some users prefer. */
  toastEnabled: boolean;
  /** PRO. The Document PiP window. Default OFF and it must stay that way: the
   *  enhanced window carries a 34px title bar showing the site's domain, and
   *  shipping that silently is exactly what earned SuperPiP its 3.8 rating. */
  enhancedWindow: boolean;
  /** PRO. Which preset the enhanced window opens at when an origin has no
   *  remembered size. */
  windowSize: SizePreset;
  /** PRO. Remember the size per site after the user resizes the window. */
  rememberSizePerSite: boolean;
  /** PRO. Draw play/pause, seek and speed controls inside the window. S-04 is
   *  why this matters rather than being a nicety: chrome.commands do NOT fire
   *  while the floating window has focus, so in-window controls are the only
   *  control surface available at exactly the moment a user reaches for one. */
  inWindowControls: boolean;
  /** PRO. Force the video's text tracks to `showing` inside the window. */
  subtitles: boolean;
}

export const DEFAULT_SETTINGS: PipSettings = {
  embeddedPlayers: false,
  toastEnabled: true,
  enhancedWindow: false,
  windowSize: "medium",
  rememberSizePerSite: true,
  inWindowControls: true,
  subtitles: false,
};

export interface ActivePip {
  tabId: number;
  frameId: number;
  label: string;
}

const SETTINGS_KEY = "settings";
const ACTIVE_PIP_KEY = "activePip";

export async function getSettings(): Promise<PipSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const value = stored[SETTINGS_KEY] as Partial<PipSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...value };
}

/** Merges the patch over current settings, persists, and returns the MERGED result. */
export async function setSettings(patch: Partial<PipSettings>): Promise<PipSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getActivePip(): Promise<ActivePip | null> {
  const stored = await chrome.storage.session.get(ACTIVE_PIP_KEY);
  const value = stored[ACTIVE_PIP_KEY] as ActivePip | undefined;
  return value ?? null;
}

export async function setActivePip(v: ActivePip): Promise<void> {
  await chrome.storage.session.set({ [ACTIVE_PIP_KEY]: v });
}

export async function clearActivePip(): Promise<void> {
  await chrome.storage.session.remove(ACTIVE_PIP_KEY);
}
