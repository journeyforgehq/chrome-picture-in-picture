/* ============================================================================
 * GROUP G, ROW G11 — "licence lapses mid-session => the next invocation uses
 * native, with NO PAYWALL INTERRUPTION."
 * ============================================================================
 *
 * WHY THIS IS A UNIT TEST AND NOT AN e2e. Task 16 left the choice open; this is
 * the reasoning, so the next person can disagree with it on the evidence rather
 * than on taste.
 *
 * 1. THE ROW NEEDS NO WINDOW. Its claim is about which BRANCH a click takes and
 *    about what the user is NOT shown. The observable difference between the
 *    two branches is the `mode` field on the object pipEntry returns — the same
 *    object either way. An e2e would have to open a real floating window to
 *    read a field it could read here, and would add an OS surface to the test
 *    without adding one bit of evidence.
 *
 * 2. THE INTERESTING WORD IS "MID-SESSION", AND THAT PART IS UNREACHABLE FROM A
 *    FIXTURE PAGE. The lapse is a TRANSITION: `entitlement_cache` is rewritten,
 *    storage.onChanged fires, and the worker's cache is rebuilt by
 *    createPrefsRefresher. All of that lives in the service worker. The fixture
 *    pages under e2e/ have no extension context at all — they hand pipEntry a
 *    prefs literal — so an e2e "lapse" would be nothing but a second literal
 *    with a different tier in it. Here the refresher is driven for real.
 *
 * 3. "NO PAYWALL INTERRUPTION" IS A NEGATIVE. An e2e can only fail to observe a
 *    paywall it was not looking for, which is the weakest possible form of the
 *    claim. The strong form is structural and it is asserted below: the toast
 *    is this product's ONLY feedback channel, its whole vocabulary is
 *    PIP_ERROR_CODES, and that vocabulary contains no upgrade prompt to show —
 *    so a paywall on this path is not merely absent, it is unspellable.
 *
 * WHAT THAT LEAVES UNCOVERED, stated rather than implied: nothing in this file
 * proves a lapsed user gets a real floating window, only that the click routes
 * to the native branch and reports success. The native branch itself is
 * measured against a real browser by e2e/gesture.spec.ts, and the "pro prefs,
 * unsupported browser => real native window" case by e2e/dpip-fallback.spec.ts
 * (G01). This row sits on top of both.
 * ==========================================================================*/
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pipEntry, type PipEntryResult } from "../../src/pip/entry";
import { decideMode } from "../../src/pip/router";
import { createPrefsRefresher, prefsFromStored, type PipPrefs } from "../../src/pip/prefs";
import { decideOutcome } from "../../src/background/action";
import { PIP_ERROR_CODES, messageFor } from "../../src/pip/errors";

/** The paying customer, mid-session: pro, opted in, on a browser that supports
 *  the enhanced window. */
const LICENSED: PipPrefs = {
  tier: "pro",
  enhancedWindow: true,
  windowSize: "medium",
  rememberSizePerSite: true,
  inWindowControls: true,
  subtitles: false,
  geometry: {},
};

/** THE SAME USER, AFTER THE LAPSE. Every field is identical except the tier —
 *  the setting they switched on is still on, the sizes they chose are still
 *  stored. That is what makes this a lapse and not a different user, and it is
 *  why `enhancedWindow: true` must stay true here. */
const LAPSED: PipPrefs = { ...LICENSED, tier: "free" };

/** A scorable <video>, built the way test/pip/entry-dpip.test.ts builds one:
 *  happy-dom simulates no media properties and has no layout engine, so the
 *  rect is stubbed too. requestPictureInPicture is stubbed PER ELEMENT because
 *  happy-dom implements no such method — without it the native branch would
 *  take the synchronous-TypeError path and prove the opposite of this row. */
function makeScorableVideo() {
  const v = document.createElement("video");
  const w = 640;
  const h = 360;
  Object.defineProperty(v, "videoWidth", { value: w, configurable: true });
  Object.defineProperty(v, "videoHeight", { value: h, configurable: true });
  Object.defineProperty(v, "readyState", { value: 2, configurable: true });
  Object.defineProperty(v, "paused", { value: false, configurable: true });
  Object.defineProperty(v, "duration", { value: 600, configurable: true });
  Object.defineProperty(v, "muted", { value: false, configurable: true });
  v.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h }) as DOMRect;
  v.dataset.label = "target";
  (v as unknown as Record<string, unknown>).requestPictureInPicture = vi.fn(() =>
    Promise.resolve()
  );
  document.body.append(v);
  return v as HTMLVideoElement & { requestPictureInPicture: ReturnType<typeof vi.fn> };
}

/** A documentPictureInPicture that WOULD work. Installed on purpose: if the
 *  lapsed click were routed to the document branch, this would succeed and the
 *  test would have to catch it by the spy rather than by an accidental failure. */
function installWorkingDocumentPip() {
  const requestWindow = vi.fn(async () => ({
    innerWidth: 400,
    innerHeight: 225,
    outerWidth: 400,
    outerHeight: 259,
    document: document.implementation.createHTMLDocument("pip"),
    resizeBy: vi.fn(),
    addEventListener: vi.fn(),
  }));
  (window as unknown as Record<string, unknown>).documentPictureInPicture = { requestWindow };
  return requestWindow;
}

beforeEach(() => {
  document.body.innerHTML = "";
  delete (window as unknown as Record<string, unknown>).__pipCoord;
  Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true });
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).documentPictureInPicture;
  delete (window as unknown as Record<string, unknown>).__pipWin;
});

describe("G11 — the licence lapses mid-session", () => {
  it("the SAME settings record routes to two different windows before and after", () => {
    // decideMode is the single source of truth entry.ts's inlined copy is held
    // to; the tier is the only input that changed.
    const shared = { enhancedWindow: true, documentPipSupported: true };
    expect(decideMode({ ...shared, tier: "pro" })).toBe("document");
    expect(decideMode({ ...shared, tier: "free" })).toBe("native");
  });

  it("the worker's prefs cache FOLLOWS the lapse instead of holding the old tier", async () => {
    /* THE "MID-SESSION" PART. The worker does not re-read storage on every
     * click — it keeps a cache and refreshes it from storage.onChanged. So the
     * question this row really asks is whether that cache tracks a lapse, and
     * this drives the real refresher over a storage stub that lapses between
     * reads.
     *
     * The second read returns `entitlement_cache: null`, which is literally
     * what Entitlement.clear() writes — a revoked or expired licence is a
     * CLEARED cache, not a record saying "free". prefsFromStored folds missing
     * and null into the same unknown-is-free branch, which is the fail-closed
     * behaviour this row depends on. */
    const reads = [
      { settings: { enhancedWindow: true }, entitlement_cache: { tier: "pro", checkedAt: 1 } },
      { settings: { enhancedWindow: true }, entitlement_cache: null },
    ];
    let n = 0;
    const seen: (PipPrefs | null)[] = [];
    const refresh = createPrefsRefresher(
      async () => reads[Math.min(n++, reads.length - 1)],
      (p) => seen.push(p)
    );

    await refresh();
    expect(seen[0]?.tier).toBe("pro");
    await refresh();
    expect(seen[1]?.tier).toBe("free");

    // The setting the user switched on is untouched by the lapse — it is the
    // ENTITLEMENT that went away, and it alone must decide the route.
    expect(seen[1]?.enhancedWindow).toBe(true);
    expect(
      decideMode({
        tier: seen[1]!.tier,
        enhancedWindow: seen[1]!.enhancedWindow,
        documentPipSupported: true,
      })
    ).toBe("native");
  });

  it("an unknown cache is read as FREE, never as pro", () => {
    // The same widening on the page-side cold path. Guessing pro would hand the
    // paid window to every install whose cache had not been written.
    expect(prefsFromStored({}).tier).toBe("free");
    expect(prefsFromStored({ entitlement_cache: null }).tier).toBe("free");
    expect(prefsFromStored({ entitlement_cache: { tier: "free", checkedAt: 1 } }).tier).toBe("free");
  });

  it("the next invocation opens the NATIVE window and never touches documentPictureInPicture", async () => {
    const video = makeScorableVideo();
    const requestWindow = installWorkingDocumentPip();

    // The control: while the licence held, this same page took the other branch.
    const licensed = (await pipEntry({ prefs: LICENSED })) as PipEntryResult;
    expect(licensed.mode).toBe("document");
    expect(requestWindow).toHaveBeenCalledTimes(1);
    delete (window as unknown as Record<string, unknown>).__pipWin;

    const lapsed = (await pipEntry({ prefs: LAPSED })) as PipEntryResult;

    expect(lapsed.mode).toBe("native");
    expect(lapsed.outcome).toBe("PIP_OK");
    // NOT ATTEMPTED — not attempted and recovered from. A lapsed licence must
    // not spend a request on a window the user is no longer entitled to.
    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(video.requestPictureInPicture).toHaveBeenCalledTimes(1);
  });

  it("does NOT report a fallback — the user did not lose a window, they lost a licence", async () => {
    /* `fellBackFrom` is what makes decideOutcome say "Enhanced window
     * unavailable — opened the standard one instead". That sentence is TRUE
     * when requestWindow failed and FALSE after a lapse: nothing failed, and a
     * user whose subscription ended does not need to be told their product is
     * broken every time they click. This is the difference between this row and
     * G02, expressed in one field. */
    makeScorableVideo();
    installWorkingDocumentPip();

    const lapsed = (await pipEntry({ prefs: LAPSED })) as PipEntryResult;
    expect(lapsed.fellBackFrom).toBeUndefined();
    expect(lapsed.errorName).toBeUndefined();
    expect(decideOutcome([lapsed]).toast).toBeNull();
  });

  it("NO PAYWALL INTERRUPTION — there is no upgrade prompt in the vocabulary to show", () => {
    /* THE STRUCTURAL FORM OF THE NEGATIVE. The toast is the only channel this
     * product has (there is no popup), PIP_ERROR_CODES is its entire
     * vocabulary, and decideOutcome is the only thing that picks from it. A
     * paywall on the click path is therefore not merely absent from the current
     * branch — it is unspellable. If someone later adds an upgrade code, this
     * fails, and the conversation about interrupting a click with a sales
     * message happens BEFORE it ships rather than after. */
    const salesy = /UPGRADE|PAYWALL|SUBSCRIB|TRIAL|PURCHASE|BUY|EXPIRED|LAPSED/i;
    for (const code of PIP_ERROR_CODES) {
      expect(code, `${code} reads like a sales prompt`).not.toMatch(salesy);
      expect(messageFor(code), `the ${code} message reads like a sales prompt`).not.toMatch(
        /upgrade|subscribe|renew|buy |purchase|payment/i
      );
    }
  });
});
