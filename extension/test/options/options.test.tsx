import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

const { refreshMock, restoreMock, getCachedMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  restoreMock: vi.fn(),
  getCachedMock: vi.fn(),
}));

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

describe("Options container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshMock.mockResolvedValue("free");
    getCachedMock.mockResolvedValue(null);
    vi.stubGlobal("chrome", { tabs: { create: vi.fn() } });
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
});
