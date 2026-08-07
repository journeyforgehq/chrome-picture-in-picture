import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../src/ui-kit/ThemeProvider";
import { UpgradePaywall, type PaywallPlan } from "../../src/ui-kit/UpgradePaywall";

const PLANS: PaywallPlan[] = [
  { id: "annual", label: "Annual", price: "$29/yr" },
  { id: "lifetime", label: "Lifetime", price: "$79 once" },
];

describe("UpgradePaywall", () => {
  it("does not render modal content when open=false", () => {
    render(
      <ThemeProvider>
        <UpgradePaywall open={false} plans={PLANS} onCheckout={() => {}} onClose={() => {}} />
      </ThemeProvider>
    );
    expect(screen.queryByText("Annual")).not.toBeInTheDocument();
  });

  it("lists every given plan when open", () => {
    render(
      <ThemeProvider>
        <UpgradePaywall open plans={PLANS} onCheckout={() => {}} onClose={() => {}} />
      </ThemeProvider>
    );
    expect(screen.getByText("Annual")).toBeInTheDocument();
    expect(screen.getByText("$29/yr")).toBeInTheDocument();
    expect(screen.getByText("Lifetime")).toBeInTheDocument();
    expect(screen.getByText("$79 once")).toBeInTheDocument();
  });

  it("calls onCheckout with the plan id when a plan is clicked", async () => {
    const onCheckout = vi.fn();
    render(
      <ThemeProvider>
        <UpgradePaywall open plans={PLANS} onCheckout={onCheckout} onClose={() => {}} />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: /choose annual/i }));
    expect(onCheckout).toHaveBeenCalledWith("annual");

    await userEvent.click(screen.getByRole("button", { name: /choose lifetime/i }));
    expect(onCheckout).toHaveBeenCalledWith("lifetime");
  });

  it("calls onClose when the modal close control is used", async () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <UpgradePaywall open plans={PLANS} onCheckout={() => {}} onClose={onClose} />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders each plan's optional feature bullets when provided", () => {
    render(
      <ThemeProvider>
        <UpgradePaywall
          open
          plans={[{ id: "annual", label: "Annual", price: "$29/yr", features: ["Unlimited tabs", "Schema validation"] }]}
          onCheckout={() => {}}
          onClose={() => {}}
        />
      </ThemeProvider>
    );
    expect(screen.getByText("Unlimited tabs")).toBeInTheDocument();
    expect(screen.getByText("Schema validation")).toBeInTheDocument();
  });

  it("renders no feature list when a plan has no features (backward compatible)", () => {
    render(
      <ThemeProvider>
        <UpgradePaywall
          open
          plans={[{ id: "lifetime", label: "Lifetime", price: "$79 once" }]}
          onCheckout={() => {}}
          onClose={() => {}}
        />
      </ThemeProvider>
    );
    // still shows label + price + Choose button, and no feature <li> bullets
    expect(screen.getByText("Lifetime")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose lifetime/i })).toBeInTheDocument();
  });

  // WCAG 2.5.3 "Label in Name": the accessible name must contain the visible
  // text. Before the fix, the CTA hardcoded aria-label={`Choose ${plan.label}`}
  // regardless of a custom ctaLabel, so a plan with ctaLabel="Unlock lifetime
  // access" was announced as "Choose Lifetime" — a name a screen-reader user
  // hears that doesn't match what's on screen, and that a voice-control user
  // reading the visible label out loud cannot activate.
  it("names the CTA after its visible text when a plan overrides ctaLabel", () => {
    render(
      <ThemeProvider>
        <UpgradePaywall
          open
          plans={[{ id: "lifetime", label: "Lifetime", price: "$79 once", ctaLabel: "Unlock lifetime access" }]}
          onCheckout={() => {}}
          onClose={() => {}}
        />
      </ThemeProvider>
    );
    const cta = screen.getByRole("button", { name: /unlock lifetime access/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveTextContent("Unlock lifetime access");
    // The old hardcoded name must NOT still be reachable.
    expect(screen.queryByRole("button", { name: /^choose lifetime$/i })).not.toBeInTheDocument();
  });
});
