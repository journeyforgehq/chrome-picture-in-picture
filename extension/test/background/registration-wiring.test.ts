import { describe, it, expect, beforeAll } from "vitest";
import { createContext, runInContext } from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCRIPT_ID } from "../../src/background/registration";

/* ============================================================================
 * IS THE UNREGISTER ACTUALLY WIRED TO permissions.onRemoved? In the SHIPPED
 * bundle, not in the source.
 * ============================================================================
 *
 * WHY THIS EXISTS AS ITS OWN LAYER
 * --------------------------------
 * One measurement makes this listener load-bearing rather than defensive:
 *
 *   CHROME DOES NOT AUTO-UNREGISTER A DYNAMIC CONTENT SCRIPT WHEN THE HOST
 *   PERMISSION IT DEPENDED ON IS REVOKED. A spike reduced
 *   permissions.getAll().origins to [] and the script was still registered and
 *   still running on every page.
 *
 * So `chrome.permissions.onRemoved -> ensureUnregistered()` is the ONLY thing
 * that stops the content script after a user revokes site access from
 * chrome://extensions. Delete the listener and the extension keeps running on
 * every page the user believed they had just locked it out of — which makes the
 * store listing's central claim false — and nothing else in this repo notices.
 *
 * WHY NOT IN THE BROWSER, WITH e2e/registration.spec.ts
 * ----------------------------------------------------
 * Because the event cannot be made to fire under automation, in either
 * direction. chrome.permissions.request() never settles behind a Playwright
 * click (the confirmation bubble is out-of-process), so the optional permission
 * can never be granted at runtime; and chrome.permissions.remove() operates
 * only on OPTIONAL permissions, so it cannot revoke the statically-granted
 * origin the e2e build uses instead. There is no path to a real onRemoved.
 *
 * The coverage is therefore split, deliberately, and neither half is redundant:
 *
 *   THIS FILE                       — that the shipped worker WIRES onRemoved
 *                                     to the unregister call.
 *   e2e/registration.spec.ts        — that unregistering actually STOPS the
 *                                     script running, in a real browser.
 *
 * WHAT THIS DOES NOT PROVE. The chrome object below is a stub, so this says
 * nothing about Chrome's own event delivery — only that a listener is
 * registered on `permissions.onRemoved` and that invoking it reaches
 * `unregisterContentScripts`. That is exactly the link the e2e layer cannot
 * see, and no more.
 *
 * It reads the BUILT bundle rather than importing background.ts because the
 * wiring lives in a top-level `if (typeof chrome !== "undefined")` block that
 * only runs when the module is evaluated as a service worker would evaluate it.
 * Same technique, and the same private-output-dir rule, as
 * test/injected-bundle.test.ts — see the comment on OUT_DIR there.
 * ==========================================================================*/

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ⚠️ ITS OWN BUNDLE, for the reason spelled out in test/injected-bundle.test.ts:
// several test files rebuild the shared dist/, some of them in DEV mode, and
// vitest runs files concurrently. Reading dist/ here would make this test's
// subject depend on scheduling.
const OUT_DIR = path.resolve(__dirname, "../../.tmp-registration-wiring");
const BUNDLE = path.resolve(OUT_DIR, "background.js");

interface Harness {
  onRemoved: (() => void) | null;
  onAdded: ((p: { origins?: string[] }) => void) | null;
  calls: string[];
  unregisterFilters: unknown[];
  registerArgs: unknown[];
  settings: Record<string, unknown>;
}

/**
 * Evaluate the built service worker with a recording chrome stub and hand back
 * both the captured permission listeners and the log of scripting calls.
 *
 * `registered` starts NON-EMPTY on purpose: ensureUnregistered() guards on
 * getRegisteredContentScripts() first and returns early when nothing is
 * registered, so a stub that reported an empty table would let the unregister
 * assertion below pass vacuously for the wrong reason.
 */
function loadWorker(): Harness {
  const h: Harness = {
    onRemoved: null,
    onAdded: null,
    calls: [],
    unregisterFilters: [],
    registerArgs: [],
    settings: {},
  };
  let registered = [{ id: SCRIPT_ID }];

  const noop = (): void => undefined;
  const emitter = () => ({ addListener: noop });

  const chrome = {
    runtime: {
      onInstalled: { addListener: noop },
      onMessage: { addListener: noop },
      onStartup: emitter(),
      setUninstallURL: noop,
      getManifest: () => ({ version: "0.0.0" }),
    },
    tabs: { create: noop, onRemoved: emitter(), sendMessage: async () => undefined },
    storage: {
      local: {
        get: async () => ({ settings: h.settings }),
        set: async (v: Record<string, unknown>) => {
          Object.assign(h.settings, (v.settings as Record<string, unknown>) ?? {});
        },
      },
      session: { get: async () => ({}), set: async () => undefined, remove: async () => undefined },
      sync: { get: async () => ({}), set: async () => undefined },
    },
    permissions: {
      getAll: async () => ({ origins: [] }),
      onAdded: {
        addListener: (fn: (p: { origins?: string[] }) => void) => {
          h.onAdded = fn;
        },
      },
      onRemoved: {
        addListener: (fn: () => void) => {
          h.onRemoved = fn;
        },
      },
    },
    scripting: {
      executeScript: async () => [],
      getRegisteredContentScripts: async () => {
        h.calls.push("getRegisteredContentScripts");
        return registered.slice();
      },
      registerContentScripts: async (scripts: unknown[]) => {
        h.calls.push("registerContentScripts");
        h.registerArgs.push(scripts);
        registered = scripts as { id: string }[];
      },
      unregisterContentScripts: async (filter: unknown) => {
        h.calls.push("unregisterContentScripts");
        h.unregisterFilters.push(filter);
        registered = [];
      },
    },
    action: { onClicked: { addListener: noop }, setTitle: async () => undefined },
  };

  const context = createContext({ chrome, console, setTimeout, clearTimeout, URL });
  runInContext(readFileSync(BUNDLE, "utf8"), context, { filename: BUNDLE });
  return h;
}

/** The listeners hand off to a detached async IIFE; let its microtasks drain. */
async function drain(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeAll(async () => {
  const require_ = createRequire(import.meta.url);
  const webpack = require_("webpack");
  const prodConfig = require_("../../webpack/webpack.prod.cjs");

  const stats = await new Promise<{ hasErrors(): boolean; toString(o: unknown): string }>(
    (resolve, reject) => {
      webpack(
        { ...prodConfig, output: { ...prodConfig.output, path: OUT_DIR, clean: true } },
        (err: Error | null, s: never) => (err ? reject(err) : resolve(s))
      );
    }
  );
  if (stats.hasErrors()) {
    throw new Error("webpack failed:\n" + stats.toString({ all: false, errors: true }));
  }
  expect(existsSync(BUNDLE), `expected a production bundle at ${BUNDLE}`).toBe(true);
}, 120_000);

describe("the shipped service worker's permission wiring", () => {
  it("registers a chrome.permissions.onRemoved listener at all", () => {
    // Without this the two tests below would both pass vacuously the day the
    // listener is deleted: `h.onRemoved?.()` on null is a silent no-op.
    const h = loadWorker();
    expect(
      h.onRemoved,
      "dist/background.js registered NO chrome.permissions.onRemoved listener. " +
        "Revoking site access would leave the content script registered and running."
    ).not.toBeNull();
  });

  it("that listener unregisters the content script", async () => {
    const h = loadWorker();
    h.onRemoved!();
    await drain();

    expect(
      h.calls,
      `onRemoved fired but chrome.scripting calls were: ${JSON.stringify(h.calls)}`
    ).toContain("unregisterContentScripts");
    // The guard runs FIRST — that is what keeps the call from rejecting with
    // `Nonexistent script ID` for every user who never enabled embedded players.
    expect(h.calls.indexOf("getRegisteredContentScripts")).toBeLessThan(
      h.calls.indexOf("unregisterContentScripts")
    );
    expect(h.unregisterFilters).toEqual([{ ids: [SCRIPT_ID] }]);
  });

  it("and turns the embeddedPlayers setting back off, so the UI stops claiming it is on", async () => {
    const h = loadWorker();
    h.settings.embeddedPlayers = true;
    h.onRemoved!();
    await drain();
    expect(h.settings.embeddedPlayers).toBe(false);
  });

  it("the symmetric onAdded listener registers, but only for <all_urls>", async () => {
    const h = loadWorker();
    expect(h.onAdded).not.toBeNull();

    // An unrelated origin must not turn the feature on. Without the guard, any
    // future optional permission this extension adds would silently register
    // the all-frames content script as a side effect.
    h.onAdded!({ origins: ["https://example.com/*"] });
    await drain();
    expect(h.calls).toEqual([]);

    h.onAdded!({ origins: ["<all_urls>"] });
    await drain();
    expect(h.calls).toContain("getRegisteredContentScripts");
    expect(h.settings.embeddedPlayers).toBe(true);
  });
});
