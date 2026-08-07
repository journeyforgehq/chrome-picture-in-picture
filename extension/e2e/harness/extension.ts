// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { chromium, type BrowserContext } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIST_DIR } from "./config";

export interface ExtensionHandle {
  context: BrowserContext;
  extensionId: string;
  close(): Promise<void>;
}

/**
 * Launch Chrome-for-Testing with the built extension loaded unpacked. Each call
 * gets a fresh temp user-data-dir, so every test starts as a brand-new install
 * (fresh device id, empty chrome.storage). Headed by default (extensions);
 * set HEADLESS=1 to run headless-new in CI.
 */
export async function launchExtension(): Promise<ExtensionHandle> {
  const userDataDir = mkdtempSync(join(tmpdir(), "ext-e2e-"));
  const headless = process.env.HEADLESS === "1";
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  // The MV3 service worker's URL host is the extension id.
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  const extensionId = new URL(sw.url()).host;

  return {
    context,
    extensionId,
    async close() {
      await context.close();
    },
  };
}
