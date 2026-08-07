// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
/// <reference types="chrome" />
import type { StorageArea, DeviceIdStores } from "./device-id";

/**
 * Wraps one chrome.storage.{sync,local} area (callback-based API) into the
 * StorageArea Promise shape the billing client (getDeviceId, createEntitlement)
 * expects. Rejects if chrome.runtime.lastError is set after the callback fires,
 * matching Chrome's documented error-signaling convention for storage.* calls.
 */
function wrapArea(area: chrome.storage.StorageArea): StorageArea {
  return {
    get(key: string): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        area.get(key, (items) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve(items ?? {});
        });
      });
    },
    set(obj: Record<string, unknown>): Promise<void> {
      return new Promise((resolve, reject) => {
        area.set(obj, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve();
        });
      });
    },
  };
}

/** Real chrome.storage.sync + chrome.storage.local pair for getDeviceId(). */
export function chromeSyncLocalStores(): DeviceIdStores {
  return {
    sync: wrapArea(chrome.storage.sync),
    local: wrapArea(chrome.storage.local),
  };
}

/** Real chrome.storage.local-backed StorageArea for the entitlement cache. */
export function chromeLocalStore(): StorageArea {
  return wrapArea(chrome.storage.local);
}
