import { test, expect } from "@playwright/test";
import {
  clearRegistrations,
  ensureRegisteredInPage,
  ensureUnregisteredInPage,
  launchGranted,
  readFrames,
  registeredScripts,
  tabIdFor,
  type GrantedExtension,
} from "./granted-dist";
import { startServers } from "./serve";
import { SCRIPT_ID, SCRIPT_OPTIONS } from "../src/background/registration";

/* ============================================================================
 * The embedded-player registration lifecycle, against the REAL chrome.scripting.
 * ============================================================================
 *
 * WHAT PROTECTS WHAT
 * ------------------
 * The store listing's central claim is that this extension touches nothing else
 * in your browser: three permissions, no static content_scripts block, and site
 * access only if you hand it over. The dynamic content script is the one thing
 * that can violate that claim, and one measurement is why:
 *
 *   CHROME DOES NOT AUTO-UNREGISTER A DYNAMIC CONTENT SCRIPT WHEN THE HOST
 *   PERMISSION IT DEPENDED ON IS REVOKED. A spike reduced
 *   permissions.getAll().origins to [] and the script was still registered and
 *   still running on every page.
 *
 * So chrome.permissions.onRemoved -> ensureUnregistered() is load-bearing: if
 * it breaks, the content script keeps running on every page after the user took
 * access away, and the claim becomes false. The half of that this file can
 * reach — that unregistering actually stops the script from running — is
 * asserted below in a real browser. The other half (that onRemoved is WIRED to
 * ensureUnregistered in the shipped worker) is asserted in
 * test/background/registration-wiring.test.ts; see "WHAT THIS DOES NOT PROVE".
 *
 * WHY IT IS NOT ENOUGH THAT test/background/registration.test.ts EXISTS
 * --------------------------------------------------------------------
 * That file drives the same two functions against an in-memory array whose
 * rejection behaviour was TYPED BY HAND from a spike's notes. It is a good
 * test of the guards, and it is worthless as evidence about Chrome: if the real
 * API stopped rejecting on a duplicate id tomorrow, the stub would keep
 * rejecting and the unit suite would stay green while the guards it justifies
 * became cargo cult. The last test in this file re-measures that premise
 * directly, so the stub can be corrected rather than trusted.
 *
 * WHAT THIS DOES NOT PROVE — READ BEFORE TRUSTING IT
 * --------------------------------------------------
 * 1. THE GRANT. <all_urls> is granted STATICALLY in a throwaway copy of the
 *    manifest (see granted-dist.ts). chrome.permissions.request() is
 *    undriveable under automation — its confirmation bubble is out-of-process
 *    and a spike measured the call simply never settling. Nothing here
 *    exercises asking for the permission.
 *
 * 2. THE REVOCATION. For the same reason in reverse, this cannot revoke:
 *    chrome.permissions.remove() only operates on OPTIONAL permissions, and in
 *    this build the origin is a required one. So chrome.permissions.onRemoved
 *    never fires here and no test below observes it. What it is wired to is
 *    asserted against the SHIPPED background bundle in
 *    test/background/registration-wiring.test.ts instead; what happens once
 *    ensureUnregistered() runs is asserted here.
 * ==========================================================================*/

const FIXTURE = "http://localhost:3000/e06-vimeo-embed.html";
const CHILD_URL = "http://127.0.0.1:3001/_embed-child.html";

let servers: { close(): Promise<void> };
let ext: GrantedExtension;

test.beforeAll(async () => {
  servers = startServers();
  ext = await launchGranted();
});

test.afterAll(async () => {
  await ext?.close();
  await servers?.close();
});

// One browser for the whole file (launching a persistent context with an
// unpacked extension costs seconds), so every test starts from an explicitly
// empty registration table rather than from its predecessor's leftovers.
test.beforeEach(async () => {
  await clearRegistrations(ext);
});

test("register -> getRegisteredContentScripts reports exactly the shipped options", async () => {
  expect(await registeredScripts(ext)).toEqual([]);

  await ensureRegisteredInPage(ext);

  const registered = await registeredScripts(ext);
  const ctx = `\n  ${JSON.stringify(registered)}\n`;
  expect(registered.length, ctx).toBe(1);

  // Every field of SCRIPT_OPTIONS survived the round trip through the real API.
  // `allFrames` is the one that matters most here and is the easiest to lose in
  // a refactor: without it the script never reaches the embedded player, which
  // is the entire feature. Chrome adds defaults of its own (`world`,
  // `matchOriginAsFallback`), so this is a superset check, and the two added
  // keys are then pinned explicitly below.
  expect(registered[0], ctx).toMatchObject(SCRIPT_OPTIONS as unknown as Record<string, unknown>);
  expect(registered[0].id, ctx).toBe(SCRIPT_ID);
  // ISOLATED, not MAIN. content.ts writes window.__pipCoord for pipEntry to
  // read, and pipEntry arrives via chrome.scripting.executeScript, which is
  // also ISOLATED. A script registered into MAIN would write the flag where
  // nothing reads it — and would expose it to the page, which the removal of
  // the `data-…-present` marker was specifically about.
  expect(registered[0].world ?? "ISOLATED", ctx).toBe("ISOLATED");
});

test("the registered script actually runs in page frames, cross-origin child included", async () => {
  await ensureRegisteredInPage(ext);

  const page = await ext.context.newPage();
  await page.goto(FIXTURE);
  const tabId = await tabIdFor(ext, FIXTURE);

  // "Registered" is not "running". getRegisteredContentScripts only reports
  // what the API was told; this asserts the script's own guard flag from inside
  // both documents' isolated worlds.
  await expect
    .poll(async () => (await readFrames(ext, tabId)).filter((f) => f.injected).length, {
      timeout: 15_000,
      intervals: Array<number>(300).fill(25),
      message: "\n  the registered content script never appeared in the page's frames\n",
    })
    .toBe(2);

  const frames = await readFrames(ext, tabId);
  const ctx = `\n  ${JSON.stringify(frames)}\n`;
  expect(frames.map((f) => f.url).sort(), ctx).toEqual([FIXTURE, CHILD_URL].sort());
  for (const f of frames) expect(f.injected, ctx).toBe(true);

  await page.close();
});

test("unregister -> gone, and the script no longer runs on a fresh page load", async () => {
  await ensureRegisteredInPage(ext);

  // Establish that it WAS running, so the absence asserted below is a change
  // rather than a page that never had the script to begin with.
  const before = await ext.context.newPage();
  await before.goto(FIXTURE);
  const beforeTab = await tabIdFor(ext, FIXTURE);
  await expect
    .poll(async () => (await readFrames(ext, beforeTab)).filter((f) => f.injected).length, {
      timeout: 15_000,
      intervals: Array<number>(300).fill(25),
    })
    .toBe(2);
  await before.close();

  await ensureUnregisteredInPage(ext);
  expect(await registeredScripts(ext)).toEqual([]);

  // A FRESH LOAD, in a new tab. The already-loaded document keeps whatever ran
  // in it — unregistering does not reach back into existing frames — so
  // re-checking the old tab would be measuring the wrong thing entirely.
  const after = await ext.context.newPage();
  await after.goto(FIXTURE);
  const afterTab = await tabIdFor(ext, FIXTURE);

  // Wait for the page to be settled the same way the positive case does (two
  // frames present), then assert the script is absent from both. Without this
  // wait the assertion could pass simply because the iframe had not loaded yet.
  await expect
    .poll(async () => (await readFrames(ext, afterTab)).length, {
      timeout: 15_000,
      intervals: Array<number>(300).fill(25),
    })
    .toBe(2);

  const frames = await readFrames(ext, afterTab);
  const ctx =
    `\n  ${JSON.stringify(frames)}\n` +
    "\n  The content script still ran after unregistering. This is the store\n" +
    "  listing's claim: revoking access must actually stop it.\n";
  for (const f of frames) {
    expect(f.injected, ctx).toBe(false);
    expect(f.coord, ctx).toBeNull();
  }

  await after.close();
});

test("ensureRegistered() twice does not throw and leaves exactly one registration", async () => {
  // The real-API version of the unit test's second case. Two chrome.runtime
  // events can both ask for registration in one session (onStartup and
  // permissions.onAdded), and the raw API rejects on a duplicate id — see the
  // last test. The guard is what makes the second call harmless.
  await ensureRegisteredInPage(ext);
  await ensureRegisteredInPage(ext);
  expect(await registeredScripts(ext)).toHaveLength(1);
});

test("ensureUnregistered() on nothing does not throw", async () => {
  // THE DEFAULT STATE FOR MOST USERS. Anyone who revokes a permission they
  // never enabled embedded players under lands exactly here, and the raw API
  // rejects on an id that is not registered. Unguarded, this is an unhandled
  // rejection in the service worker on a perfectly ordinary user action.
  expect(await registeredScripts(ext)).toEqual([]);
  await ensureUnregisteredInPage(ext);
  expect(await registeredScripts(ext)).toEqual([]);
});

test("THE STUB'S PREMISE: the raw API still rejects on duplicate and nonexistent ids", async () => {
  /* ------------------------------------------------------------------------
   * This is the one test in the file that deliberately calls chrome.scripting
   * UNGUARDED. test/background/registration.test.ts's stub was hand-written
   * from a spike's notes, and both guards in registration.ts are justified
   * ENTIRELY by those two rejections. If Chrome ever makes either call
   * idempotent, the stub becomes a fiction that keeps the unit suite green
   * while describing a browser that no longer exists — so the premise is
   * re-measured here, in the browser, on every run.
   *
   * The message text is asserted as a substring, not verbatim: Chrome is
   * entitled to reword it. The behaviour under test is REJECTING, and the
   * distinguishing fragment is enough to prove it rejected for the stated
   * reason rather than for some unrelated one.
   * ----------------------------------------------------------------------*/
  const measured = await ext.ext.evaluate(async (opts) => {
    const options = opts as chrome.scripting.RegisteredContentScript;
    const attempt = async (fn: () => Promise<unknown>): Promise<string> => {
      try {
        await fn();
        return "RESOLVED";
      } catch (e) {
        return String((e as Error)?.message ?? e);
      }
    };

    const nonexistent = await attempt(() =>
      chrome.scripting.unregisterContentScripts({ ids: [options.id] })
    );
    const first = await attempt(() => chrome.scripting.registerContentScripts([options]));
    const duplicate = await attempt(() => chrome.scripting.registerContentScripts([options]));
    return { nonexistent, first, duplicate };
  }, SCRIPT_OPTIONS as unknown as object);

  const ctx = `\n  measured: ${JSON.stringify(measured, null, 2)}\n`;
  console.log(`  raw chrome.scripting behaviour: ${JSON.stringify(measured)}`);

  // The control: registering into an empty table resolves. If this ever failed,
  // the two rejections either side of it would prove nothing.
  expect(measured.first, ctx).toBe("RESOLVED");

  expect(
    measured.duplicate,
    "\n  registerContentScripts NO LONGER REJECTS ON A DUPLICATE ID.\n" +
      "  If this is what changed, the getRegisteredContentScripts guard in\n" +
      "  src/background/registration.ts is no longer load-bearing AND the stub\n" +
      "  in test/background/registration.test.ts is describing a browser that no\n" +
      "  longer exists. Correct the stub before relaxing anything." +
      ctx
  ).toContain(`Duplicate script ID '${SCRIPT_ID}'`);

  expect(
    measured.nonexistent,
    "\n  unregisterContentScripts NO LONGER REJECTS ON AN UNREGISTERED ID.\n" +
      "  Same conclusion as above, for the other guard — the one that fires for\n" +
      "  every user who never enabled embedded players." +
      ctx
  ).toContain(`Nonexistent script ID '${SCRIPT_ID}'`);
});
