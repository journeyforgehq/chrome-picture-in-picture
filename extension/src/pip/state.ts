/* ============================================================================
 * pip state — storage accessors. THIS FILE RUNS ONLY IN THE SERVICE WORKER.
 * ============================================================================
 *
 * Unlike entry.ts and toast.ts, this module is NEVER injected into a page via
 * chrome.scripting.executeScript / Function.prototype.toString(). It is a
 * normal module imported by the service worker, so normal imports and module
 * scope are fine here — the "no outside identifiers" constraint on those two
 * files does not apply to this one.
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

export interface PipSettings {
  /** Requests <all_urls> when switched on; reaches videos inside embedded players. */
  embeddedPlayers: boolean;
  /** The toast. Off means silent failure, which some users prefer. */
  toastEnabled: boolean;
}

export const DEFAULT_SETTINGS: PipSettings = { embeddedPlayers: false, toastEnabled: true };

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
