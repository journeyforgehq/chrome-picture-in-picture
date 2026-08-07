import { defineConfig } from "@playwright/test";

// Visual specs are SEPARATE from the billing e2e suite on purpose.
//
// They assert computed style and screenshots against the dev-only preview
// gallery on :4173, so they need a gallery build + static server and NOT the
// billing suite's globalSetup (which builds the extension and spawns a local
// wrangler worker — irrelevant here, and slow).
//
// The main playwright.config.ts testIgnores these, so `npm run e2e` stays the
// billing loop and `npm run e2e:visual` stays the pixel check. Neither can
// silently start depending on the other's fixtures.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*-visual.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
  webServer: {
    command: "npm run preview:build && npm run preview:serve",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
