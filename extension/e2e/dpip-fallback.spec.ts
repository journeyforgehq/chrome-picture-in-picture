import { test, expect, type Page } from "@playwright/test";
import { startServers } from "./serve";
import { pipEntry, type PipEntryResult } from "../src/pip/entry";
import { decideOutcome } from "../src/background/action";
import { messageFor, severityFor } from "../src/pip/errors";

/* ============================================================================
 * GROUP G, ROWS G01 AND G02 — the two ways the enhanced window does not happen.
 * ============================================================================
 *
 * The full Group G coverage table, including the three rows CI cannot prove,
 * lives in ONE place: the header of e2e/dpip-window.spec.ts, mirrored into
 * e2e/README.md. Read it there rather than trusting a green run here.
 *
 *   G01  documentPictureInPicture ABSENT   => native, SILENTLY — not an error
 *   G02  requestWindow() REJECTS           => toast, and the native window
 *                                             opens IN THE SAME CLICK
 *
 * Both rows are about a PAYING customer with the enhanced window switched ON:
 * the fixtures hand pipEntry `tier: "pro", enhancedWindow: true`, so the only
 * thing that can send either click to the native window is the failure the
 * fixture stubs in. A run where a stub silently failed would come back "the
 * enhanced window opened" and prove nothing, which is why each fixture reports
 * how it stubbed and each test asserts that before it clicks.
 *
 * WHAT THIS FILE ADDS OVER test/pip/entry-dpip.test.ts, which already drives
 * both branches against a fake: the fallback ends in a REAL
 * requestPictureInPicture(), and native PiP — unlike requestWindow, see below —
 * genuinely enforces user activation under automation. G02's native call is
 * made from inside a PROMISE REJECTION HANDLER, i.e. after a suspension, so
 * this is where S-11's "the page's activation is TIME-based (~5s) and survives
 * a suspension" stops being a claim in a comment and becomes a window that
 * either opens or does not. happy-dom cannot tell you that.
 *
 * The toast half of G02 is asserted by feeding the REAL, browser-produced
 * PipEntryResult through the REAL decideOutcome() in Node. The worker's
 * executeScript(showToast) call is not reachable from here (no extension
 * context on a plain fixture page); it is pinned in
 * test/background/registration-wiring.test.ts against the shipped bundle.
 *
 * NO `test.use({ viewport: null, channel: "chromium" })` HERE, DELIBERATELY.
 * dpip-window.spec.ts and dpip-controls.spec.ts both carry those two
 * declarations because they MEASURE the enhanced window's size, and both the
 * default emulated viewport and the old headless shell corrupt that
 * measurement. Neither test below opens an enhanced window at all — that is the
 * point of both rows — so neither has a size to be corrupted, and declaring an
 * environment a spec does not need is how per-file requirements turn into
 * inherited noise nobody can justify later.
 *
 * NOT ASSERTED ANYWHERE IN THIS FILE, and it must stay that way:
 * requestWindow()'s own gesture requirement. S-12 ran a no-gesture control in
 * every arm — bundled Chromium and real Chrome, viewport: null and default —
 * and requestWindow opened a window EVERY TIME without user activation. Under
 * automation the requirement is simply not enforced, so any assertion about it
 * here would pass for the wrong reason and then be believed. S-10 measured it
 * by hand (NotAllowedError) and the release smoke sheet re-checks it.
 * ==========================================================================*/

declare global {
  interface Window {
    /** g01-no-dpip.html: which route actually removed the API. */
    __dpipStubMode?: string;
    /** g01-no-dpip.html: `typeof window.documentPictureInPicture` after stubbing. */
    __dpipTypeof?: string;
  }
}

const G01 = "http://localhost:3000/g01-no-dpip.html";
const G02 = "http://localhost:3000/g02-reject.html";

let servers: { close(): Promise<void> };

test.beforeAll(() => {
  servers = startServers();
});

test.afterAll(async () => {
  await servers.close();
});

test.beforeEach(async ({ page }) => {
  // THE SHIPPED FUNCTION, SERIALIZED THE WAY CHROME SERIALIZES IT. A
  // ReferenceError from it in the page is a genuine rule-1 violation in
  // src/pip/entry.ts's header — report it, do not paper over it here.
  await page.addInitScript(`window.__pipEntry = ${pipEntry.toString()}`);
});

async function open(page: Page, url: string): Promise<void> {
  const head = await fetch(url, { method: "HEAD" });
  expect(head.status, `fixture not found: ${url}`).toBe(200);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "true");
}

async function clickAndSettle(page: Page): Promise<PipEntryResult & { harnessError?: string }> {
  await page.click("#open");
  await page.waitForFunction(() => window.__lastSettled === true);
  const result = (await page.evaluate(() => window.__lastResult))!;
  const state = await page.evaluate(() => document.documentElement.dataset.fixtureState ?? "[]");
  expect(result?.harnessError, `\n  fixture state: ${state}\n`).toBeUndefined();
  return result;
}

/** Did a REAL native PiP window open? The element is the only handle a page
 *  gets on it, and it is set asynchronously, so this polls. */
async function nativePipLabel(page: Page): Promise<string | null> {
  await expect
    .poll(async () => await page.evaluate(() => document.pictureInPictureElement !== null), {
      timeout: 5000,
      message:
        "no native picture-in-picture window opened — the fallback returned " +
        "PIP_OK but nothing is floating",
    })
    .toBe(true);
  return await page.evaluate(
    () => (document.pictureInPictureElement as HTMLElement | null)?.dataset.label ?? null
  );
}

test.describe("the enhanced window's two failure routes @dpip", () => {
  test("G01 — with documentPictureInPicture absent, a Pro click gets the NATIVE window, silently", async ({
    page,
    context,
  }) => {
    await open(page, G01);

    /* THE FIXTURE'S OWN PRECONDITION. Without this, a browser that simply never
     * had the API and a stub that silently failed produce the same green
     * result, for opposite reasons — and only one of them is this row. */
    const stub = await page.evaluate(() => ({
      mode: window.__dpipStubMode,
      typeofApi: window.__dpipTypeof,
      live: typeof (window as unknown as { documentPictureInPicture?: unknown })
        .documentPictureInPicture,
    }));
    console.log(`  G01 stub: ${JSON.stringify(stub)}`);
    expect(stub.typeofApi, "the fixture did not manage to remove the API").toBe("undefined");
    expect(stub.live, "the API came back between fixture setup and the click").toBe("undefined");

    const result = await clickAndSettle(page);
    const ctx = `\n  __lastResult: ${JSON.stringify(result)}\n`;
    console.log(`  G01 result: ${JSON.stringify(result)}`);

    // NATIVE, and never the document branch: `supported` is false, so routeTo
    // sends the click to native BEFORE anything is attempted.
    expect(result.mode, ctx).toBe("native");
    expect(result.outcome, ctx).toBe("PIP_OK");
    expect(result.errorName, ctx).toBeUndefined();
    /* `fellBackFrom` ABSENT is the "silently" in this row, and it is a
     * different claim from `mode === "native"`. Nothing was ATTEMPTED and
     * failed here — the browser never had the API — so reporting a fallback
     * would make decideOutcome show a paying customer "Enhanced window
     * unavailable" on a browser where the enhanced window was never on offer. */
    expect(result.fellBackFrom, ctx).toBeUndefined();

    // A real floating window, not just an optimistic result object.
    expect(await nativePipLabel(page), ctx).toBe("target");

    // NOT AN ERROR: the real toast decision function, fed the real result.
    expect(decideOutcome([result]).toast, ctx).toBeNull();

    // And no Document PiP window was opened behind our back: one such window
    // would arrive in this context as a second page.
    expect(context.pages().filter((p) => p !== page).length, ctx).toBe(0);
  });

  test("G02 — when requestWindow REJECTS, the native window opens in the SAME click and the toast says so", async ({
    page,
    context,
  }) => {
    await open(page, G02);

    const stub = await page.evaluate(() => ({
      mode: window.__dpipStubMode,
      isStub: (
        window as unknown as {
          documentPictureInPicture?: { requestWindow?: { __isStub?: boolean } };
        }
      ).documentPictureInPicture?.requestWindow?.__isStub,
    }));
    console.log(`  G02 stub: ${JSON.stringify(stub)}`);
    expect(
      stub.isStub,
      "the rejecting requestWindow stub is not in place, so this test would " +
        "open a REAL enhanced window and assert nothing about this row"
    ).toBe(true);

    const result = await clickAndSettle(page);
    const ctx = `\n  __lastResult: ${JSON.stringify(result)}\n`;
    console.log(`  G02 result: ${JSON.stringify(result)}`);

    expect(result.outcome, ctx).toBe("PIP_OK");
    // The window the user actually got...
    expect(result.mode, ctx).toBe("native");
    // ...and the one that was tried first. Without this a pro user quietly
    // getting the free window is indistinguishable from a free-tier click.
    expect(result.fellBackFrom, ctx).toBe("document");

    /* IN THE SAME CLICK. There was ONE page.click() in this test, and the
     * native call that produced this window was made from inside
     * requestWindow's rejection handler — i.e. after a suspension. Native PiP
     * does enforce activation under automation (gesture.spec.ts's no-gesture
     * control measures the NotAllowedError), so a floating window here is
     * evidence that the activation survived the suspension, which is exactly
     * what S-11's time-based-activation finding claims. */
    expect(await nativePipLabel(page), ctx).toBe("target");

    // No enhanced window was left behind by the failed attempt.
    expect(context.pages().filter((p) => p !== page).length, ctx).toBe(0);

    /* THE TOAST HALF, through the REAL decision function. `info`, not
     * `blocked`: the click worked and the user got a floating window — a
     * red-flavoured toast would tell a paying customer their purchase broke. */
    const outcome = decideOutcome([result]);
    expect(outcome.toast, ctx).toBe("ENHANCED_UNAVAILABLE");
    expect(severityFor("ENHANCED_UNAVAILABLE")).toBe("info");
    console.log(`  G02 toast: ${outcome.toast} — "${messageFor("ENHANCED_UNAVAILABLE")}"`);
  });
});
