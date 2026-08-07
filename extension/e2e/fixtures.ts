// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { test as base, expect } from "@playwright/test";
import { launchExtension, type ExtensionHandle } from "./harness/extension";

/** Playwright test extended with a per-test loaded extension. */
export const test = base.extend<{ ext: ExtensionHandle }>({
  ext: async ({}, use) => {
    const ext = await launchExtension();
    await use(ext);
    await ext.close();
  },
});

export { expect };
