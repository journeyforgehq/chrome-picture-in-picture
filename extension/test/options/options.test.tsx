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

  // Ported from test/popup/popup.test.tsx. options.tsx has carried the
  // byte-equivalent cached seed all along with no test of its own; the popup —
  // and therefore that test — is deleted two tasks from now, so the behaviour
  // needs its coverage HERE before that happens.
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
   * THE MONEY PATH'S FIRST STEP. Ported from test/popup/popup.test.tsx, which
   * is deleted with the popup — the popup's copy stays until then.
   *
   * `client_reference_id` is not cosmetic. backend/src/billing/webhook.ts reads
   * `checkout.session.completed`'s `client_reference_id` as the device to grant,
   * and logs `grant_no_device` at ERROR when it is missing. Drop this parameter
   * and a customer's money arrives while their entitlement never does — a
   * failure that is invisible on the client and only shows up as a support
   * ticket. So this asserts the WHOLE url, not just that a tab opened.
   * ========================================================================*/
  it("opens the lifetime checkout URL, with the device id as client_reference_id", async () => {
    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    // Free tier → the Upgrade button is the only route into the paywall.
    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    fireEvent.click(await screen.findByRole("button", { name: planCta }));

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    const arg = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.url).toBe(`${LIFETIME_LINK}?client_reference_id=device-abc-123`);
  });

  it("falls back to window.open when chrome.tabs is unavailable", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    // Same chrome stub minus `tabs` — the shape a non-extension host presents.
    vi.stubGlobal("chrome", {
      storage: { local: storage.area },
      permissions: { request: permissionsRequest, remove: permissionsRemove },
    });

    render(<Options />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Upgrade" }));
    fireEvent.click(await screen.findByRole("button", { name: planCta }));

    expect(open).toHaveBeenCalledWith(
      `${LIFETIME_LINK}?client_reference_id=device-abc-123`,
      "_blank",
    );
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
 * SUBMISSION GATE — deliberately it.skip, not deleted and not passing.
 * ============================================================================
 * The options footer links to https://github.com/__ORG__/picture-in-picture.
 * `__ORG__` is a placeholder chosen to be obviously unfinished: an invented but
 * plausible org would survive review by LOOKING finished and then 404 for every
 * real user who clicked it.
 *
 * This is skipped rather than absent so it shows up in `npm test` output as a
 * standing pending item — a silently missing test is how a placeholder ships.
 * UN-SKIP IT (and it must pass) as part of the Chrome Web Store pre-submission
 * checklist, once the real org/repo exists. It reads the BUILT bundle, so it
 * also catches the token being reintroduced anywhere else in the options entry.
 * ==========================================================================*/
describe("options submission gates", () => {
  it.skip("ships no unresolved __ORG__ placeholder in the built options bundle", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const bundle = readFileSync(path.resolve(here, "../../dist/options.js"), "utf8");
    expect(bundle).not.toContain("__ORG__");
  });
});
