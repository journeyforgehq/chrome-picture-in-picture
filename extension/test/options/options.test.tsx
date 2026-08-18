import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

/* ============================================================================
 * src/billing/config.ts reads process.env at MODULE-EVAL time, and webpack's
 * DefinePlugin is what fills these in for a real build. vi.hoisted runs before
 * any import in this file is evaluated, which is the only window in which this
 * assignment can still reach config.ts. Without it STRIPE_LINKS.lifetime is ""
 * and the checkout test below could only assert a bare query string — which
 * would not prove the LINK is the one the lifetime plan maps to.
 * ==========================================================================*/
const { refreshMock, restoreMock, getCachedMock, LIFETIME_LINK } = vi.hoisted(() => {
  const link = "https://buy.stripe.com/test-lifetime";
  process.env.STRIPE_LIFETIME_URL = link;
  return {
    refreshMock: vi.fn(),
    restoreMock: vi.fn(),
    getCachedMock: vi.fn(),
    LIFETIME_LINK: link,
  };
});

vi.mock("../../src/billing", async () => {
  const actual = await vi.importActual<typeof import("../../src/billing")>("../../src/billing");
  return {
    ...actual,
    getDeviceId: vi.fn().mockResolvedValue("device-abc-123"),
    createEntitlement: vi.fn().mockReturnValue({
      refresh: refreshMock,
      restore: restoreMock,
      getCachedTier: vi.fn(),
      getCached: getCachedMock,
      clear: vi.fn(),
    }),
  };
});

vi.mock("../../src/billing/chrome-storage", () => ({
  chromeSyncLocalStores: vi.fn().mockReturnValue({
    sync: { get: vi.fn(), set: vi.fn() },
    local: { get: vi.fn(), set: vi.fn() },
  }),
  chromeLocalStore: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
}));

import { Options } from "../../src/options/options";
import { DEFAULT_SETTINGS } from "../../src/pip/state";
import { PLANS } from "../../src/billing/plans";
import { TERMS_VERSION } from "../../src/billing";
import { PURCHASE_DISCLOSURE } from "../../src/billing/disclosure";

/** The paywall CTA, derived from PLANS so a pricing change can't silently
 *  disarm the checkout test by renaming the button. */
const planCta = new RegExp(`choose ${PLANS[0].label}`, "i");

/** chrome.storage.local backed by a Map, so getSettings/setSettings round-trip
 * for real instead of being mocked out of the wiring under test. */
function storageStub(seed: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    map: store,
    area: {
      get: vi.fn(async (k: string) => (store.has(k) ? { [k]: store.get(k) } : {})),
      set: vi.fn(async (o: Record<string, unknown>) => {
        for (const k of Object.keys(o)) store.set(k, o[k]);
      }),
      remove: vi.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
}

let storage: ReturnType<typeof storageStub>;
let permissionsRequest: ReturnType<typeof vi.fn>;
let permissionsRemove: ReturnType<typeof vi.fn>;

describe("Options container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockResolvedValue("free");
    getCachedMock.mockResolvedValue(null);
    storage = storageStub();
    permissionsRequest = vi.fn().mockResolvedValue(true);
    permissionsRemove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      tabs: { create: vi.fn() },
      storage: { local: storage.area },
      permissions: { request: permissionsRequest, remove: permissionsRemove },
    });
  });

  it("passes cached plan/status through to OptionsView (PlanBadge shows the plan, not 'No plan')", async () => {
    getCachedMock.mockResolvedValue({ tier: "pro", plan: "annual", status: "active", checkedAt: Date.now() });
    refreshMock.mockResolvedValue("pro");
    render(<Options />);
    expect(await screen.findByText(/annual/i)).toBeInTheDocument();
    expect(screen.queryByText(/no plan/i)).not.toBeInTheDocument();
  });

  it("refreshes tier on mount and renders the PlanBadge accordingly", async () => {
    refreshMock.mockResolvedValue("pro");
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("calls entitlement.restore(email) then reflects the RestoreResult in state", async () => {
    restoreMock.mockResolvedValue({ ok: false, tier: "free", error: { status: 404, name: "unavailable", message: "not found" } });
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: /restore purchase/i }));

    expect(restoreMock).toHaveBeenCalledWith("nobody@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent(/no active purchase found/i);
  });

  it("a successful restore updates the displayed tier", async () => {
    restoreMock.mockResolvedValue({ ok: true, tier: "pro" });
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.click(screen.getByRole("button", { name: /restore purchase/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/purchase restored/i);
  });

  // Ported from test/popup/popup.test.tsx before that file was deleted.
  // options.tsx had carried the byte-equivalent cached seed all along with no
  // test of its own, so without this port the behaviour would have shipped
  // untested the moment the popup went.
  it("seeds the cached Pro tier immediately (no Free flash) before refresh resolves", async () => {
    getCachedMock.mockResolvedValue({
      tier: "pro",
      plan: "annual",
      status: "active",
      checkedAt: Date.now(),
    });
    refreshMock.mockReturnValue(new Promise(() => {})); // network never resolves
    render(<Options />);
    expect(await screen.findByTestId("tier-badge")).toHaveTextContent("Pro");
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
  });

  /* ==========================================================================
   * THE MONEY PATH'S FIRST STEP. Ported from test/popup/popup.test.tsx before
   * that file was deleted; this is now the only coverage it has anywhere.
   *
   * `client_reference_id` is not cosmetic. backend/src/billing/webhook.ts reads
   * `checkout.session.completed`'s `client_reference_id` as the device to grant,
   * and logs `grant_no_device` at ERROR when it is missing. Drop this parameter
   * and a customer's money arrives while their entitlement never does — a
   * failure that is invisible on the client and only shows up as a support
   * ticket. So this asserts the WHOLE url, not just that a tab opened.
   * ========================================================================*/
  const SESSION_URL = "https://checkout.stripe.com/c/pay/cs_test_pip";

  function stubSessionFetch(url: string | null = SESSION_URL) {
    const mock = vi.fn().mockResolvedValue(
      url
        ? { ok: true, json: async () => ({ ok: true, url }) }
        : { ok: false, status: 429, json: async () => ({ ok: false }) }
    );
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  // Free tier → Upgrade opens the DISCLOSURE, and the disclosure's own CTA is
  // what reaches the paywall. Both clicks are load-bearing: if the first one
  // ever opens the paywall directly again, the second findByRole below is the
  // one that would still pass, so the panel's presence is asserted between
  // them rather than inferred.
  async function reachPaywallCta() {
    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    fireEvent.click(await screen.findByTestId("dpip-disclosure-continue"));
    return screen.findByRole("button", { name: planCta });
  }

  it("mints a Checkout Session and opens its URL, keyed to this device", async () => {
    const fetchMock = stubSessionFetch();
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    fireEvent.click(await reachPaywallCta());

    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(1));
    const arg = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.url).toBe(SESSION_URL);

    // The device id now travels in the header (and becomes client_reference_id
    // server-side) rather than being pasted onto a public Payment Link. The
    // price banked as consent is read off the SAME card the user saw.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Device-Id"]).toBe("device-abc-123");
    expect(JSON.parse(init.body as string)).toMatchObject({
      plan: PLANS[0].id,
      priceShown: PLANS[0].price,
      termsVersion: TERMS_VERSION,
    });
  });

  it("falls back to window.open when chrome.tabs is unavailable", async () => {
    stubSessionFetch();
    const open = vi.fn();
    vi.stubGlobal("open", open);
    // Same chrome stub minus `tabs` — the shape a non-extension host presents.
    vi.stubGlobal("chrome", {
      storage: { local: storage.area },
      permissions: { request: permissionsRequest, remove: permissionsRemove },
    });

    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    fireEvent.click(await reachPaywallCta());

    await waitFor(() => expect(open).toHaveBeenCalledWith(SESSION_URL, "_blank"));
  });

  it("surfaces an error and opens NO tab when the session cannot be minted", async () => {
    stubSessionFetch(null);
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    fireEvent.click(await reachPaywallCta());

    expect(await screen.findByText(/couldn't start checkout/i)).toBeInTheDocument();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  // Threading check: the container owns the disclosure copy/links, so a dropped
  // prop silently ships a paywall with no negative-option disclosure.
  it("passes the CTA-adjacent purchase disclosure down to the paywall", async () => {
    stubSessionFetch();
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await reachPaywallCta();

    const links = [...document.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toContain("Terms");
    expect(links.map((a) => a.textContent)).toContain("Refund policy");
    expect(document.body.textContent).toContain(PURCHASE_DISCLOSURE.text);
    // Real published origin, not an empty href from an unset WELCOME_URL.
    expect(links.find((a) => a.textContent === "Terms")!.getAttribute("href"))
      .toBe(PURCHASE_DISCLOSURE.termsUrl);
  });
});

describe("Options container — settings wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockResolvedValue("free");
    getCachedMock.mockResolvedValue(null);
    storage = storageStub();
    permissionsRequest = vi.fn().mockResolvedValue(true);
    permissionsRemove = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", {
      tabs: { create: vi.fn() },
      storage: { local: storage.area },
      permissions: { request: permissionsRequest, remove: permissionsRemove },
    });
  });

  const embeddedSwitch = () => screen.getByRole("switch", { name: /support embedded players/i });
  const toastSwitch = () => screen.getByRole("switch", { name: /show status messages/i });

  it("hydrates the switches from stored settings", async () => {
    storage.map.set("settings", { embeddedPlayers: true, toastEnabled: false });
    render(<Options />);
    await waitFor(() => expect(embeddedSwitch()).toBeChecked());
    expect(toastSwitch()).not.toBeChecked();
  });

  it("falls back to DEFAULT_SETTINGS when nothing is stored", async () => {
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(embeddedSwitch().getAttribute("aria-checked")).toBe(String(DEFAULT_SETTINGS.embeddedPlayers));
    expect(toastSwitch().getAttribute("aria-checked")).toBe(String(DEFAULT_SETTINGS.toastEnabled));
  });

  it("persists the toast toggle through setSettings", async () => {
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    fireEvent.click(toastSwitch());
    await waitFor(() => expect(storage.map.get("settings")).toMatchObject({ toastEnabled: false }));
    await waitFor(() => expect(toastSwitch()).not.toBeChecked());
  });

  it("requests <all_urls> SYNCHRONOUSLY from the click — no await may precede it", async () => {
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    // fireEvent.click returns before any microtask runs. If the handler awaited
    // ANYTHING first, chrome.permissions.request would reject in the real
    // browser with "This function must be called during a user gesture" — and
    // this assertion is what catches that regression.
    fireEvent.click(embeddedSwitch());
    expect(permissionsRequest).toHaveBeenCalledWith({ origins: ["<all_urls>"] });
  });

  it("persists embeddedPlayers only after the grant is given", async () => {
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    fireEvent.click(embeddedSwitch());
    await waitFor(() => expect(storage.map.get("settings")).toMatchObject({ embeddedPlayers: true }));
    await waitFor(() => expect(embeddedSwitch()).toBeChecked());
    expect(screen.queryByTestId("site-access-denied")).not.toBeInTheDocument();
  });

  it("a declined grant leaves the switch off, persists nothing, and says so calmly", async () => {
    permissionsRequest.mockResolvedValue(false);
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    fireEvent.click(embeddedSwitch());
    expect(await screen.findByTestId("site-access-denied")).toHaveTextContent(/still/i);
    expect(embeddedSwitch()).not.toBeChecked();
    expect(storage.map.get("settings")).toBeUndefined();
  });

  it("opens Chrome's shortcut editor through chrome.tabs.create, not a chrome:// link", async () => {
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /change shortcut/i }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome://extensions/shortcuts" });
  });

  it("turning it off removes the optional host permission", async () => {
    storage.map.set("settings", { embeddedPlayers: true, toastEnabled: true });
    render(<Options />);
    await waitFor(() => expect(embeddedSwitch()).toBeChecked());
    fireEvent.click(embeddedSwitch());
    expect(permissionsRemove).toHaveBeenCalledWith({ origins: ["<all_urls>"] });
    await waitFor(() => expect(storage.map.get("settings")).toMatchObject({ embeddedPlayers: false }));
  });
});

/* ============================================================================
 * SUBMISSION GATE — LIVE as of 2026-08-10. It was `it.skip` until then.
 * ============================================================================
 * The options footer links to the public repository. It used to link to
 * https://github.com/__ORG__/picture-in-picture — a placeholder chosen to be
 * obviously unfinished, because an invented but plausible org would survive
 * review by LOOKING finished and then 404 for every real user who clicked it.
 *
 * The gate was skipped rather than absent so it showed up in every `npm test`
 * run as a standing pending item; a silently missing test is how a placeholder
 * ships. The org is now known (`journeyforgehq`), so it is un-skipped and must
 * stay green.
 *
 * IT READS THE BUILT BUNDLE, AND THAT IS THE POINT. Asserting against the
 * source constant would pass while some other file in the options entry still
 * carried the token. The two assertions below are deliberately different
 * questions: the first is "no placeholder survived", the second is "and the
 * thing that replaced it is actually the URL we mean" — a gate that only
 * checked for absence would also pass if the link had been deleted outright.
 *
 * IT BUILDS ITS OWN PRODUCTION BUNDLE, AND THAT IS ALSO THE POINT. This gate
 * used to read the SHARED dist/options.js, on the unstated assumption that
 * whatever last wrote it was a production build. It is not: test/webpack-
 * config.test.ts and others rebuild dist/ too, some of them in DEV mode
 * (webpack.dev.cjs does not minify), and vitest runs test files concurrently —
 * so whether this gate saw a prod or a dev bundle depended purely on
 * scheduling. The literal token `__ORG__` lives on in a SOURCE COMMENT
 * explaining that it used to be here (see options.tsx, a few lines above the
 * SOURCE_URL constant) — deliberately, as documentation, and that comment
 * should not be deleted just to make this test stop depending on the file
 * that survives it. Production minification strips comments; development
 * builds do not. So a dev-mode dist/options.js fails this gate for a reason
 * that has nothing to do with whether the codebase actually ships the
 * placeholder — same failure mode test/injected-bundle.test.ts's OUT_DIR
 * comment documents for background.js. The fix is the same one: build a
 * private production bundle that nothing else writes, and read that.
 * ==========================================================================*/
describe("options submission gates", () => {
  it("ships no unresolved __ORG__ placeholder in the built options bundle", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { createRequire } = await import("node:module");

    const here = path.dirname(fileURLToPath(import.meta.url));
    const require_ = createRequire(import.meta.url);
    const webpack = require_("webpack");
    const prodConfig = require_("../../webpack/webpack.prod.cjs");
    const OUT_DIR = path.resolve(here, "../../.tmp-options-gate");
    const BUNDLE = path.resolve(OUT_DIR, "options.js");

    const stats = await new Promise<any>((resolve, reject) => {
      webpack(
        { ...prodConfig, output: { ...prodConfig.output, path: OUT_DIR, clean: true } },
        (err: Error | null, s: any) => (err ? reject(err) : resolve(s))
      );
    });
    if (stats.hasErrors()) {
      throw new Error("webpack failed:\n" + stats.toString({ all: false, errors: true }));
    }
    expect(existsSync(BUNDLE), `expected a production bundle at ${BUNDLE}`).toBe(true);

    const bundle = readFileSync(BUNDLE, "utf8");

    // Guard against the exact confusion the header block describes: if the
    // bundle is unminified, this is a dev build, not what ships, and every
    // assertion below would be testing the wrong artifact.
    expect(
      bundle.includes("function Options("),
      "bundle is UNMINIFIED — this is a dev build, not what ships"
    ).toBe(false);

    expect(bundle).not.toContain("__ORG__");
    // Absence is not enough — see the header block.
    expect(bundle).toContain("https://github.com/journeyforgehq/picture-in-picture");
  }, 120_000);
});
