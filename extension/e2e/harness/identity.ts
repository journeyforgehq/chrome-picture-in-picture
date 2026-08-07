// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { Page } from "@playwright/test";

/**
 * Read the persisted device id from chrome.storage.local. Must be called on an
 * extension page (popup.html/options.html) where chrome.* is available. The key
 * "device_id" matches src/billing/device-id.ts.
 */
export async function readDeviceId(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        chrome.storage.local.get("device_id", (r) => resolve((r.device_id as string) ?? ""));
      }),
  );
}

/**
 * Poll chrome.storage.local until the popup's async init has written the device
 * id, then return it. IMPORTANT: the popup renders its default "free" state on
 * mount BEFORE init completes (src/popup/popup.tsx uses useState<Tier>("free")),
 * so waiting on the visible "Free" text is NOT a reliable readiness gate for a
 * storage read — the write may not have landed yet. Poll the actual write.
 */
export async function waitForDeviceId(page: Page, timeoutMs = 8000): Promise<string> {
  return page.evaluate(
    (timeout) =>
      new Promise<string>((resolve, reject) => {
        const start = Date.now();
        const tick = () => {
          chrome.storage.local.get("device_id", (r) => {
            const id = (r.device_id as string) ?? "";
            if (id) return resolve(id);
            if (Date.now() - start > timeout) return reject(new Error("device_id not written within timeout"));
            setTimeout(tick, 100);
          });
        };
        tick();
      }),
    timeoutMs,
  );
}

/**
 * Read the cached entitlement tier from chrome.storage.local. The key
 * "entitlement_cache" and its { tier } shape match src/billing/entitlement.ts.
 */
export async function readCachedTier(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        chrome.storage.local.get("entitlement_cache", (r) => {
          const c = r.entitlement_cache as { tier?: string } | undefined;
          resolve(c?.tier ?? "free");
        });
      }),
  );
}
