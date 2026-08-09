import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

const { refreshMock, restoreMock, getCachedTierMock, getCachedMock, clearMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  restoreMock: vi.fn(),
  getCachedTierMock: vi.fn(),
  getCachedMock: vi.fn(),
  clearMock: vi.fn(),
}));

vi.mock("../../src/billing", async () => {
  const actual = await vi.importActual<typeof import("../../src/billing")>("../../src/billing");
  return {
    ...actual,
    getDeviceId: vi.fn().mockResolvedValue("device-abc-123"),
    createEntitlement: vi.fn().mockReturnValue({
      refresh: refreshMock,
      restore: restoreMock,
      getCachedTier: getCachedTierMock,
      getCached: getCachedMock,
      clear: clearMock,
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

import { Popup } from "../../src/popup/popup";
import { getDeviceId, createEntitlement } from "../../src/billing";
// The subject of the checkout test below is the client_reference_id on the URL,
// NOT which plan was clicked — so the CTA is derived from PLANS rather than
// hard-coded ("Choose Annual"), which pricing changes would keep breaking.
import { PLANS } from "../../src/billing/plans";

describe("Popup container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockResolvedValue("free");
    getCachedMock.mockResolvedValue(null);
    vi.stubGlobal("chrome", {
      tabs: { create: vi.fn() },
    });
  });

  it("builds the device id, creates the entitlement client, and refreshes tier on mount", async () => {
    render(<Popup />);
    await waitFor(() => expect(getDeviceId).toHaveBeenCalledTimes(1));
    expect(createEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: "device-abc-123" })
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("passes the refreshed tier down to PopupView (Free badge visible)", async () => {
    refreshMock.mockResolvedValue("pro");
    render(<Popup />);
    expect(await screen.findByText("Pro")).toBeInTheDocument();
  });

  it("seeds the cached Pro tier immediately (no Free flash) before refresh resolves", async () => {
    getCachedMock.mockResolvedValue({ tier: "pro", plan: "annual", status: "active", checkedAt: Date.now() });
    refreshMock.mockReturnValue(new Promise(() => {})); // network never resolves
    render(<Popup />);
    expect(await screen.findByText("Pro")).toBeInTheDocument();
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
  });

  it("onCheckout opens the checkout URL via chrome.tabs.create", async () => {
    render(<Popup />);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    const cta = new RegExp(`choose ${PLANS[0].label}`, "i");
    fireEvent.click(await screen.findByRole("button", { name: cta }));
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    const arg = (chrome.tabs.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.url).toContain("client_reference_id=device-abc-123");
  });
});
