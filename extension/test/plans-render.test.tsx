import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider, UpgradePaywall } from "../src/ui-kit";
import { OptionsView } from "../src/options/OptionsView";
import { PLANS } from "../src/billing/plans";
import { DEFAULT_SETTINGS } from "../src/pip/state";

/* ============================================================================
 * THE REAL $9.99 CARD — rendered, not described.
 * ============================================================================
 *
 * Everything else that touches the paywall uses a FIXTURE plan array:
 * test/ui-kit/UpgradePaywall.test.tsx, test/options/OptionsView.test.tsx and
 * the preview gallery all pass two invented plans (deliberately — the multi-plan
 * layout has to stay verifiable for the paid-tier plan). test/plans.test.ts
 * asserts `PLANS` as DATA and never renders it.
 *
 * So until this file, nothing had ever put the shipped configuration through the
 * component: the string a paying user reads ("$9.99") and the ONE-PLAN layout
 * branch — `span = 24`, `width = 380` in ui-kit/UpgradePaywall — were both
 * unexercised. Those two numbers only exist for a single-plan array, which is
 * the only array this child ships.
 *
 * ui-kit/ is CORE (vendored, .factory.json). Nothing here edits it; every
 * assertion is made from outside, on rendered output.
 * ==========================================================================*/

const SOURCE_URL = "https://example.invalid/source";

/** The one-plan branch's Col span. `plans.length >= 3 ? 8 : === 2 ? 12 : 24`. */
const ONE_PLAN_COL_CLASS = "ant-col-sm-24";
/** The one-plan branch's modal width. `>= 3 ? 780 : === 2 ? 560 : 380`. */
const ONE_PLAN_MODAL_WIDTH = "380px";

function renderRealPaywall() {
  const onCheckout = vi.fn();
  const onClose = vi.fn();
  render(
    <ThemeProvider>
      <UpgradePaywall open plans={PLANS} onCheckout={onCheckout} onClose={onClose} />
    </ThemeProvider>
  );
  return { onCheckout, onClose };
}

describe("the real PLANS, rendered through UpgradePaywall", () => {
  it("puts the price a buyer actually reads on screen", () => {
    renderRealPaywall();
    // The headline price, the unit next to it, and the reassurance under it —
    // the three strings that make "$9.99, once, forever" legible as an offer.
    expect(screen.getByText("$9.99")).toBeInTheDocument();

    // The price and its unit must not run together. Every assertion in this repo
    // was green while the card actually read "$9.99once", because they all matched
    // "$9.99" as a SUBSTRING. Caught by looking at the screenshot, not by a test —
    // so assert the rendered adjacency, which is the thing a buyer sees.
    // Walk to the enclosing price block rather than a fixed number of parents:
    // antd renders <Text strong> as <span><strong>, so the price and its unit are
    // two levels apart, and a hard-coded parentElement hop silently reads "$9.99"
    // and passes whatever the unit does.
    const priceEl = screen.getByText("$9.99");
    const priceBlock = (priceEl.closest("div")?.textContent ?? "").replace(/\s+/g, " ");
    expect(priceBlock).toContain("$9.99 once");
    expect(priceBlock).not.toContain("$9.99once");
    expect(screen.getByText("once")).toBeInTheDocument();
    expect(screen.getByText("One-time payment")).toBeInTheDocument();
    expect(screen.getByText("Pay once, yours forever.")).toBeInTheDocument();
    for (const f of ["Every Pro feature", "No renewals, ever", "All future updates included"]) {
      expect(screen.getByText(f)).toBeInTheDocument();
    }
  });

  it("renders exactly one plan card, and it is the lifetime one", () => {
    renderRealPaywall();
    const cards = document.querySelectorAll('[data-testid^="plan-"]');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute("data-testid")).toBe("plan-lifetime");
    expect(within(cards[0] as HTMLElement).getByText("$9.99")).toBeInTheDocument();
    // No stray second CTA — a two-plan array would put another one here.
    expect(screen.getAllByRole("button", { name: /^choose /i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /choose lifetime/i })).toBeInTheDocument();
  });

  it("takes the ONE-PLAN layout branch, not the 2- or 3-up one", () => {
    renderRealPaywall();
    // Full-width column (span 24) …
    const col = document.querySelector('[data-testid="plan-lifetime"]')!.closest(".ant-col")!;
    expect(col.className).toContain(ONE_PLAN_COL_CLASS);
    expect(col.className).not.toContain("ant-col-sm-12"); // the 2-plan branch
    expect(col.className).not.toContain("ant-col-sm-8"); // the 3-plan branch
    // … inside the narrow modal the same branch selects.
    const modal = document.querySelector(".ant-modal") as HTMLElement;
    expect(modal.style.width).toBe(ONE_PLAN_MODAL_WIDTH);
  });

  it("shows no POPULAR ribbon — nothing sets `highlight`, and one plan cannot be the popular one", () => {
    // The DECISION, asserted rather than assumed: the ribbon is dead code in v1
    // and stays dead until a second plan exists. Adding `highlight: true` to make
    // it reachable would be inventing pricing, so its ABSENCE is what is pinned.
    // Its rendering path stays covered by the gallery's two-plan fixture card.
    renderRealPaywall();
    expect(screen.queryByText("POPULAR")).not.toBeInTheDocument();
  });

  it("hands `lifetime` to onCheckout when the only CTA is pressed", async () => {
    const { onCheckout } = renderRealPaywall();
    await userEvent.click(screen.getByRole("button", { name: /choose lifetime/i }));
    expect(onCheckout).toHaveBeenCalledWith("lifetime");
  });
});

describe("the real PLANS, through the page that actually mounts them", () => {
  // options.tsx passes `PLANS` straight into OptionsView. This is that path with
  // the paywall open — i.e. what a free user sees after clicking Upgrade.
  it("renders the $9.99 card from OptionsView's own paywall", () => {
    render(
      <ThemeProvider>
        <OptionsView
          tier="free"
          settings={{ ...DEFAULT_SETTINGS, embeddedPlayers: false, toastEnabled: true }}
          onSettingChange={vi.fn()}
          onOpenShortcuts={vi.fn()}
          restoring={false}
          onRestore={vi.fn()}
          onOpenPaywall={vi.fn()}
          paywallOpen
          onClosePaywall={vi.fn()}
          onCheckout={vi.fn()}
          plans={PLANS}
          sourceUrl={SOURCE_URL}
        />
      </ThemeProvider>
    );
    expect(screen.getByText("$9.99")).toBeInTheDocument();

    // The price and its unit must not run together. Every assertion in this repo
    // was green while the card actually read "$9.99once", because they all matched
    // "$9.99" as a SUBSTRING. Caught by looking at the screenshot, not by a test —
    // so assert the rendered adjacency, which is the thing a buyer sees.
    // Walk to the enclosing price block rather than a fixed number of parents:
    // antd renders <Text strong> as <span><strong>, so the price and its unit are
    // two levels apart, and a hard-coded parentElement hop silently reads "$9.99"
    // and passes whatever the unit does.
    const priceEl = screen.getByText("$9.99");
    const priceBlock = (priceEl.closest("div")?.textContent ?? "").replace(/\s+/g, " ");
    expect(priceBlock).toContain("$9.99 once");
    expect(priceBlock).not.toContain("$9.99once");
    expect(document.querySelectorAll('[data-testid^="plan-"]')).toHaveLength(1);
    expect((document.querySelector(".ant-modal") as HTMLElement).style.width).toBe(
      ONE_PLAN_MODAL_WIDTH
    );
  });
});

/* ============================================================================
 * focusTriggerAfterClose={false} IS NOT ASSERTED HERE — ON PURPOSE. MEASURED.
 * ============================================================================
 *
 * The obvious unit test ("open the paywall, close it, expect the trigger not to
 * be focused") passes in happy-dom whether or not the prop exists, because antd
 * never gets as far as the code the prop guards.
 *
 * Measured, not assumed. A CONTROL was written first: a plain antd `Modal` with
 * the DEFAULT focusTriggerAfterClose, in this same environment, opened from a
 * focused trigger and closed. antd restores focus from rc-dialog's leave-motion
 * completion callback, and happy-dom fires no `transitionend`, so that callback
 * never runs: after close, `document.activeElement` was still the modal's own
 * close button — not the trigger — even with a 3s `waitFor`. The control FAILED,
 * which means the real assertion would have passed for the wrong reason and
 * stayed green if the prop were deleted.
 *
 * So the behaviour is asserted where the motion actually runs: a real Chromium,
 * in `e2e/options-visual.spec.ts` ("closing the paywall does not bounce focus
 * back to the trigger"), against a control modal in the preview gallery that
 * proves antd's restore is live in that browser.
 * ==========================================================================*/
