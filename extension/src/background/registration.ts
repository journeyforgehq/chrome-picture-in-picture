/// <reference types="chrome" />

/* ============================================================================
 * Dynamic registration of the embedded-player content script.
 * ============================================================================
 *
 * This script only makes sense once the user has granted the optional
 * <all_urls> host permission (see manifest.json: optional_host_permissions).
 * Because that grant happens at runtime, registration is dynamic
 * (chrome.scripting.registerContentScripts) rather than a static
 * content_scripts manifest block.
 *
 * Every call below is guarded by a getRegisteredContentScripts check FIRST.
 * That is not defensive habit — a spike measured the real rejection
 * behaviour of the scripting API and both guards are load-bearing:
 *
 *   - registerContentScripts REJECTS on a duplicate id with
 *     `Error: Duplicate script ID 'x'`. It does NOT resolve as a no-op.
 *     Without the guard, calling ensureRegistered() a second time (e.g. from
 *     both chrome.runtime.onStartup and chrome.permissions.onAdded in the
 *     same session) would throw an unhandled rejection in the service
 *     worker.
 *
 *   - unregisterContentScripts REJECTS on an id that is not currently
 *     registered with `Error: Nonexistent script ID 'x'`. Without the guard,
 *     ensureUnregistered() throws for every user who revokes a permission
 *     they never enabled embedded players under in the first place — which
 *     is the default state for most users. This was the one concrete code
 *     change the spike forced.
 *
 * Separately (not something this file can fix): Chrome does NOT
 * auto-unregister a dynamic content script when the host permission it
 * depended on is revoked. A spike reduced permissions.getAll().origins to
 * [] and the script was still registered and still running. That is why
 * ensureUnregistered() is wired to chrome.permissions.onRemoved in
 * background.ts — it is load-bearing there, not belt-and-braces.
 * ==========================================================================*/

export const SCRIPT_ID = "pip-embedded";

const SCRIPT_OPTIONS: chrome.scripting.RegisteredContentScript = {
  id: SCRIPT_ID,
  matches: ["<all_urls>"],
  allFrames: true,
  runAt: "document_idle",
  js: ["content.js"],
  persistAcrossSessions: true,
};

export async function ensureRegistered(): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length > 0) return;
  await chrome.scripting.registerContentScripts([SCRIPT_OPTIONS]);
}

export async function ensureUnregistered(): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length === 0) return;
  await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
}
