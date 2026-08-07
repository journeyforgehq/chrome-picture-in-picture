import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "../../src/ui-kit";
import { PopupView } from "../../src/popup/PopupView";
import type { PaywallPlan } from "../../src/ui-kit";

const PLANS: PaywallPlan[] = [
  { id: "annual", label: "Annual", price: "$29/yr" },
  { id: "lifetime", label: "Lifetime", price: "$79 once" },
];

function renderPopup(overrides: Partial<React.ComponentProps<typeof PopupView>> = {}) {
  const props: React.ComponentProps<typeof PopupView> = {
    tier: "free",
    paywallOpen: false,
    onOpenPaywall: vi.fn(),
    onClosePaywall: vi.fn(),
    onCheckout: vi.fn(),
    plans: PLANS,
    ...overrides,
  };
  render(
    <ThemeProvider>
      <PopupView {...props} />
    </ThemeProvider>
  );
  return props;
}

describe("PopupView", () => {
  it("shows the Free tier badge and a locked pro feature when tier is free", () => {
    renderPopup({ tier: "free" });
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument();
  });

  it("shows the Pro tier badge and an interactive pro feature when tier is pro", () => {
    renderPopup({ tier: "pro" });
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run pro tool/i })).toBeEnabled();
  });

  it("the always-free Uppercase tool works regardless of tier", () => {
    renderPopup({ tier: "free" });
    const input = screen.getByLabelText(/text to uppercase/i);
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /^uppercase$/i }));
    expect(screen.getByTestId("uppercase-result")).toHaveTextContent("HELLO");
  });

  it("clicking Unlock on the locked pro feature calls onOpenPaywall", () => {
    const props = renderPopup({ tier: "free" });
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    expect(props.onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("renders UpgradePaywall open when paywallOpen is true, and calling onCheckout fires with the plan id", () => {
    const props = renderPopup({ tier: "free", paywallOpen: true });
    expect(screen.getByRole("dialog", { name: /upgrade to pro/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /choose annual/i }));
    expect(props.onCheckout).toHaveBeenCalledWith("annual");
  });

  it("does not render UpgradePaywall content when paywallOpen is false", () => {
    renderPopup({ tier: "free", paywallOpen: false });
    expect(screen.queryByRole("dialog", { name: /upgrade to pro/i })).not.toBeInTheDocument();
  });
});
