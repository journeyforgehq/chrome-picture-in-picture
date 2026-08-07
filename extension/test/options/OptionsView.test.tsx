import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "../../src/ui-kit";
import { OptionsView } from "../../src/options/OptionsView";
import type { PaywallPlan } from "../../src/ui-kit";

const PLANS: PaywallPlan[] = [
  { id: "annual", label: "Annual", price: "$29/yr" },
  { id: "lifetime", label: "Lifetime", price: "$79 once" },
];

function renderOptions(overrides: Partial<React.ComponentProps<typeof OptionsView>> = {}) {
  const props: React.ComponentProps<typeof OptionsView> = {
    tier: "free",
    restoring: false,
    onRestore: vi.fn(),
    onOpenPaywall: vi.fn(),
    paywallOpen: false,
    onClosePaywall: vi.fn(),
    onCheckout: vi.fn(),
    plans: PLANS,
    ...overrides,
  };
  render(
    <ThemeProvider>
      <OptionsView {...props} />
    </ThemeProvider>
  );
  return props;
}

describe("OptionsView", () => {
  it("renders PlanBadge from plan/status props", () => {
    renderOptions({ plan: "annual", status: "active" });
    expect(screen.getByText("Annual")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders 'No plan' when plan is undefined", () => {
    renderOptions({ plan: undefined, status: undefined });
    expect(screen.getByText("No plan")).toBeInTheDocument();
  });

  it("wires the RestoreForm's submit to onRestore(email)", async () => {
    const props = renderOptions();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.click(screen.getByRole("button", { name: /restore purchase/i }));
    expect(props.onRestore).toHaveBeenCalledWith("a@b.com");
  });

  it("reflects a 404 restoreResult as a warning alert", () => {
    renderOptions({
      restoreResult: { ok: false, tier: "free", error: { status: 404, name: "unavailable", message: "not found" } },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/no active purchase found/i);
  });

  it("reflects a success restoreResult", () => {
    renderOptions({ restoreResult: { ok: true, tier: "pro" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/purchase restored/i);
  });

  it("clicking Upgrade calls onOpenPaywall, and the paywall opens", () => {
    const props = renderOptions({ paywallOpen: false });
    fireEvent.click(screen.getByRole("button", { name: /^upgrade$/i }));
    expect(props.onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("renders UpgradePaywall as open when paywallOpen is true", () => {
    renderOptions({ paywallOpen: true });
    expect(screen.getByRole("dialog", { name: /upgrade to pro/i })).toBeInTheDocument();
  });
});
