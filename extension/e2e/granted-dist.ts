import { execSync } from "node:child_process";
import { chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCRIPT_ID,
  SCRIPT_OPTIONS,
  ensureRegistered,
  ensureUnregistered,
} from "../src/background/registration";

/* ============================================================================
 * A build of this extension with <all_urls> ALREADY GRANTED, for the two specs
 * that cannot run without it.
 * ============================================================================
 *
 * WHY A SEPARATE BUILD EXISTS AT ALL
 * ----------------------------------
 * The shipped manifest asks for <all_urls> as an OPTIONAL host permission, so a
 * real user grants it at runtime through chrome.permissions.request(). That
 * path is unreachable from automation: the confirmation bubble is a native,
 * out-of-process browser surface, and a spike measured
 * chrome.permissions.request() behind a real click in an extension page simply
 * NEVER SETTLING under Playwright — no resolve, no reject, no bubble the driver
 * can see.
 *
 * So the permission is granted the only other way there is: STATICALLY, in a
 * COPY of the built manifest. `npm run build` produces dist/ from the real
 * src/static/manifest.json; this module copies dist/ to .tmp-granted-dist/ and
 * rewrites only the two permission keys in the copy.
 *
 * src/static/manifest.json IS NEVER TOUCHED. test/manifest.test.ts pins the
 * exact permission allowlist (R-04) and would fail — correctly — the moment
 * <all_urls> became a required host permission of the shipped product. The
 * whole point of this file is to get the machinery under test without moving
 * that line.
 *
 * WHAT A GREEN RUN UNDER THIS BUILD PROVES, AND WHAT IT DOES NOT
 * --------------------------------------------------------------
 * PROVES: the machinery that runs once the permission is held — dynamic content
 * script registration, cross-frame messaging, sender.frameId, tabs.sendMessage
 * with { frameId } — against the real Chrome APIs.
 *
 * DOES NOT PROVE: the granting itself. Nothing here exercises
 * chrome.permissions.request(), the consent bubble, or the options-page UI that
 * calls it. Nor does it prove that the SHIPPED manifest's optional-permission
 * flow reaches this state — only that this state behaves correctly once
 * reached. Read any green run in arbitration.spec.ts / registration.spec.ts
 * with that boundary in mind.
 * ==========================================================================*/

const HERE = dirname(fileURLToPath(import.meta.url));

/** template/extension */
export const EXTENSION_DIR = resolve(HERE, "..");
/** The ordinary production build, as `npm run build` writes it. */
export const DIST_DIR = resolve(EXTENSION_DIR, "dist");
/** The patched copy Chrome actually loads for these specs. Git-ignored. */
export const GRANTED_DIST_DIR = resolve(EXTENSION_DIR, ".tmp-granted-dist");

/**
 * Build dist/ and mirror it into .tmp-granted-dist/ with <all_urls> promoted
 * from optional to required.
 *
 * `optional_host_permissions` is REMOVED rather than left alongside: Chrome
 * refuses to load a manifest that lists the same origin as both required and
 * optional, and a refusal here surfaces as "no service worker ever appeared",
 * which says nothing about the cause.
 */
export function buildGrantedDist(): void {
  execSync("npm run build", { cwd: EXTENSION_DIR, stdio: "inherit" });

  const srcManifest = join(DIST_DIR, "manifest.json");
  if (!existsSync(srcManifest)) {
    throw new Error(`dist build produced no manifest.json at ${DIST_DIR}`);
  }

  rmSync(GRANTED_DIST_DIR, { recursive: true, force: true });
  cpSync(DIST_DIR, GRANTED_DIST_DIR, { recursive: true });

  const manifest = JSON.parse(readFileSync(srcManifest, "utf8")) as Record<string, unknown>;
  manifest.host_permissions = ["<all_urls>"];
  delete manifest.optional_host_permissions;
  writeFileSync(join(GRANTED_DIST_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

export interface GrantedExtension {
  context: BrowserContext;
  extensionId: string;
  /** An extension page with full chrome.* bindings. See the note below. */
  ext: Page;
  close(): Promise<void>;
}

/**
 * Launch Chrome with the granted build loaded, and open one extension page.
 *
 * THE EXTENSION PAGE IS THE INSTRUMENT, NOT THE SERVICE WORKER — but not for
 * the reason first recorded here, which was wrong.
 *
 * The original note said serviceWorker.evaluate() sees a `chrome` object
 * carrying only { loadTimes, csi }, i.e. no extension bindings ever. S-11
 * measured that this is the PRE-BINDING WINDOW, not a property of the worker:
 * poll for ~136ms after the 'serviceworker' event and the full surface appears
 * (action, commands, permissions, runtime, scripting, storage, tabs, windows).
 * A test that gives up in that window concludes "no bindings" and is wrong.
 *
 * The real reasons to keep options.html as the instrument:
 *  - it is stable across worker termination, which MV3 does on ~30s idle; and
 *  - Playwright's evaluate() sends CDP Runtime.evaluate with userGesture:true,
 *    so anything driven through sw.evaluate() silently carries a user gesture.
 *    S-11's first no-gesture control was invalidated by exactly this. Never
 *    arrange the ABSENCE of a gesture with evaluate().
 *
 * The worker's own state is read indirectly, from the chrome.storage.session
 * key it writes.
 */
export async function launchGranted(): Promise<GrantedExtension> {
  const userDataDir = mkdtempSync(join(tmpdir(), "pip-granted-e2e-"));
  const headless = process.env.HEADLESS === "1";
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args: [
      `--disable-extensions-except=${GRANTED_DIST_DIR}`,
      `--load-extension=${GRANTED_DIST_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Same declared override as playwright.fixtures.config.ts: without it
      // Chrome's autoplay policy silently leaves the fixtures' unmuted videos
      // paused, and a paused video scores 1000 instead of 2000. Arbitration
      // would still pick the same frame here, but the score it recorded would
      // be measuring the autoplay policy rather than the fixture.
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  const extensionId = new URL(sw.url()).host;

  const ext = await context.newPage();
  await ext.goto(`chrome-extension://${extensionId}/options.html`);

  return {
    context,
    extensionId,
    ext,
    async close() {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

/* ============================================================================
 * Running the SHIPPED registration functions against the REAL chrome.scripting.
 * ==========================================================================*/

/**
 * Evaluate `ensureRegistered` / `ensureUnregistered` INSIDE the extension page,
 * from their own source text.
 *
 * WHY NOT A COPY OF THE LOGIC. The entire point of both e2e specs is that
 * test/background/registration.test.ts drives those two functions against a
 * hand-written in-memory stub. Re-typing "check first, then call" here would
 * reproduce the same problem one layer up: a green run that proves the test's
 * copy is guarded, not the shipped one.
 *
 * HOW. Same trick detection.spec.ts uses for pipEntry — `new Function` over the
 * function's own `.toString()` — with the one difference that these two are NOT
 * self-contained: they close over SCRIPT_ID and SCRIPT_OPTIONS. Those two are
 * imported from the same module and bound as parameters, so the values are the
 * shipped ones, not transcriptions.
 *
 * THIS IS ALSO AN ASSERTION. If someone gives either function a THIRD free
 * variable, the rebuild throws ReferenceError and both specs go red rather than
 * quietly testing something else.
 */
async function runEnsure(
  ext: GrantedExtension,
  fn: typeof ensureRegistered | typeof ensureUnregistered
): Promise<void> {
  const failure = await ext.ext.evaluate(
    async ({ src, scriptId, options }) => {
      try {
        const rebuilt = new Function(
          "SCRIPT_ID",
          "SCRIPT_OPTIONS",
          "return (" + src + ")"
        )(scriptId, options) as () => Promise<void>;
        await rebuilt();
        return null;
      } catch (e) {
        return String((e as Error)?.stack ?? e);
      }
    },
    { src: fn.toString(), scriptId: SCRIPT_ID, options: SCRIPT_OPTIONS as unknown as object }
  );
  expect(
    failure,
    `\n  The shipped ${fn.name}() threw inside the extension page.\n` +
      `  A ReferenceError here means it grew a free variable beyond\n` +
      `  SCRIPT_ID / SCRIPT_OPTIONS; anything else is a real defect.\n`
  ).toBeNull();
}

/** Run the shipped ensureRegistered() against the real API. */
export function ensureRegisteredInPage(ext: GrantedExtension): Promise<void> {
  return runEnsure(ext, ensureRegistered);
}

/** Run the shipped ensureUnregistered() against the real API. */
export function ensureUnregisteredInPage(ext: GrantedExtension): Promise<void> {
  return runEnsure(ext, ensureUnregistered);
}

/** Whatever chrome.scripting currently reports as registered, verbatim. */
export function registeredScripts(
  ext: GrantedExtension
): Promise<chrome.scripting.RegisteredContentScript[]> {
  return ext.ext.evaluate(() => chrome.scripting.getRegisteredContentScripts());
}

/**
 * Clear ALL dynamic registrations. Both specs share one browser across their
 * tests (a persistent context with an unpacked extension is expensive to
 * launch), so each test starts from a known-empty registration table rather
 * than from whatever its predecessor left behind.
 */
export async function clearRegistrations(ext: GrantedExtension): Promise<void> {
  await ext.ext.evaluate(async () => {
    const all = await chrome.scripting.getRegisteredContentScripts();
    if (all.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: all.map((s) => s.id) });
    }
  });
}

/* ============================================================================
 * Reading page state from the ISOLATED world.
 * ==========================================================================*/

/** One frame's view of arbitration, as content.js left it. */
export interface FrameView {
  frameId: number;
  url: string;
  /** content.js's guard flag: true iff the content script ran in this frame. */
  injected: boolean;
  coord: { isWinner: boolean; updatedAt: number } | null;
}

/** The tab id Chrome has for `url`. Available because the host permission is held. */
export async function tabIdFor(ext: GrantedExtension, url: string): Promise<number> {
  const tabs = await ext.ext.evaluate((u) => chrome.tabs.query({ url: u }), url);
  expect(tabs.map((t) => t.url), `\n  no tab found for ${url}\n`).toContain(url);
  return tabs[0].id as number;
}

/**
 * Every frame of `tabId`, with `__pipInjected` and `__pipCoord` as they stand.
 *
 * MUST go through chrome.scripting.executeScript, NOT page.evaluate. Both flags
 * live in the extension's ISOLATED world — that is the whole reason the page
 * cannot see them and the reason pipEntry (also injected into the isolated
 * world) can. page.evaluate runs in the MAIN world and would report `undefined`
 * for both, on a perfectly healthy page.
 */
export async function readFrames(ext: GrantedExtension, tabId: number): Promise<FrameView[]> {
  const results = await ext.ext.evaluate(
    (tid) =>
      chrome.scripting.executeScript({
        target: { tabId: tid, allFrames: true },
        func: () => {
          const w = window as unknown as Record<string, unknown>;
          return {
            url: location.href,
            injected: w.__pipInjected === true,
            coord: (w.__pipCoord as FrameView["coord"]) ?? null,
          };
        },
      }),
    tabId
  );
  return results.map((r) => ({
    frameId: r.frameId,
    ...(r.result as { url: string; injected: boolean; coord: FrameView["coord"] }),
  }));
}
