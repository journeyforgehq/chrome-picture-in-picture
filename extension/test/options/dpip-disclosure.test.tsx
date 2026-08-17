import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { OptionsView } from "../../src/options/OptionsView";
import { DEFAULT_SETTINGS } from "../../src/pip/state";
import type { PaywallPlan } from "../../src/ui-kit";

/* ============================================================================
 * THE DISCLOSURE PANEL — Unlock -> disclosure -> upgrade.
 * ============================================================================
 *
 * The Pro tier's one cost is browser-imposed and permanent: Document PiP draws
 * a ~34px title bar showing the page's domain, and no CSS removes it. The
 * competitor this product is positioned against shipped that bar silently as
 * the default and its reviews say so. This panel is the interposition that
 * makes the paywall honest — the user reads the trade before checkout is
 * reachable.
 *
 * These are DOM-level assertions of REACHABILITY and WORDING, which is what
 * happy-dom can actually answer. They are NOT the completion evidence for the
 * panel's appearance: computed style, the image scaling inside the 560px
 * column, and the 375px no-horizontal-scroll requirement are asserted against
 * real Chrome in e2e/options-visual.spec.ts, and screenshotted.
 * ==========================================================================*/

const PLANS: PaywallPlan[] = [
  { id: "annual", label: "Annual", price: "$29/yr" },
  { id: "lifetime", label: "Lifetime", price: "$79 once" },
];

const base = {
  settings: DEFAULT_SETTINGS,
  onSettingChange: vi.fn(),
  onOpenShortcuts: vi.fn(),
  restoring: false,
  onRestore: vi.fn(),
  onOpenPaywall: vi.fn(),
  paywallOpen: false,
  onClosePaywall: vi.fn(),
  onCheckout: vi.fn(),
  plans: PLANS,
  sourceUrl: "https://example.com",
};

function renderFree(overrides: Partial<React.ComponentProps<typeof OptionsView>> = {}) {
  const onOpenPaywall = vi.fn();
  render(<OptionsView {...base} tier="free" onOpenPaywall={onOpenPaywall} {...overrides} />);
  return { onOpenPaywall };
}

const unlock = () => screen.getAllByRole("button", { name: /unlock/i })[0];
const upgrade = () => screen.getByRole("button", { name: /^upgrade$/i });
const panel = () => screen.queryByTestId("dpip-disclosure");

describe("Pro disclosure — reachability from the locked state", () => {
  it("is not on screen until it is asked for", () => {
    renderFree();
    // First paint is a settings page, not a sales pitch.
    expect(panel()).not.toBeInTheDocument();
  });

  it("the locked rows' Unlock button reveals it", async () => {
    renderFree();
    await userEvent.click(unlock());
    expect(panel()).toBeInTheDocument();
  });

  it("the plan row's Upgrade button reveals it too", async () => {
    renderFree();
    await userEvent.click(upgrade());
    expect(panel()).toBeInTheDocument();
  });

  it("can be declined, leaving the free page as it was", async () => {
    const { onOpenPaywall } = renderFree();
    await userEvent.click(unlock());
    await userEvent.click(screen.getByTestId("dpip-disclosure-dismiss"));
    expect(panel()).not.toBeInTheDocument();
    expect(onOpenPaywall).not.toHaveBeenCalled();
    // The rows it gates are still there, still locked. Declining costs nothing.
    expect(screen.getByRole("heading", { level: 3, name: "Enhanced window" })).toBeInTheDocument();
    expect(screen.getByLabelText("Enhanced window")).toBeDisabled();
  });

  it("never appears on Pro — there is no gate left for it to explain", async () => {
    render(<OptionsView {...base} tier="pro" />);
    expect(panel()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^upgrade$/i })).not.toBeInTheDocument();
  });
});

/* ============================================================================
 * THE WORDS CARRY THE DISCLOSURE, NOT THE IMAGE.
 *
 * The comparison image is invisible to a screen reader, to a user who blocks
 * images, and to anyone whose connection has not delivered it. If the title
 * bar is only disclosed by a picture, then whether the user was told depends
 * on a rendering — which is not a disclosure. So the prose has to say it, and
 * the alt text has to name both windows.
 * ==========================================================================*/
describe("Pro disclosure — the trade, in words", () => {
  it("names the title bar AND the domain it shows, in the caption prose", async () => {
    renderFree();
    await userEvent.click(unlock());
    const text = panel()!.textContent ?? "";
    expect(text).toMatch(/title bar/i);
    expect(text).toMatch(/domain/i);
  });

  it("says the title bar cannot be removed, rather than merely that it exists", async () => {
    renderFree();
    await userEvent.click(unlock());
    const text = panel()!.textContent ?? "";
    // "There is a title bar" reads like a cosmetic detail. The fact that
    // matters is that it is Chrome's and it is permanent.
    expect(text).toMatch(/chrome draws/i);
    expect(text).toMatch(/can remove it/i);
    expect(text).toMatch(/34 pixels/i);
  });

  it("states the gains it is trading against — exact size, per-site, controls and subtitles inside", async () => {
    renderFree();
    await userEvent.click(unlock());
    const text = panel()!.textContent ?? "";
    expect(text).toMatch(/exact size/i);
    expect(text).toMatch(/each site/i);
    expect(text).toMatch(/subtitles are drawn\s+inside|inside the window/i);
  });

  it("says the standard window has none and stays the default", async () => {
    renderFree();
    await userEvent.click(unlock());
    const text = panel()!.textContent ?? "";
    expect(text).toMatch(/standard floating window has no title bar/i);
    expect(text).toMatch(/stays the default/i);
  });

  it("gives the image alt text that names BOTH windows", async () => {
    renderFree();
    await userEvent.click(unlock());
    // Scoped to the panel: antd's LockOutlined on the Unlock button is also
    // role="img", so an unscoped query matches two nodes and throws.
    const img = within(panel()!).getByRole("img");
    const alt = img.getAttribute("alt") ?? "";
    expect(alt).toMatch(/standard window/i);
    expect(alt).toMatch(/enhanced window/i);
    expect(alt).toMatch(/title bar/i);
    // The image is a static composite by necessity: Chrome allows exactly one
    // PiP surface at a time, so the two windows can never be photographed —
    // or demoed — together. See spike S-10 and scripts/check-assets.mjs.
    expect(img.getAttribute("src")).toBe("pro-window-comparison.png");
  });
});

/* ============================================================================
 * THE INVARIANT THIS TASK EXISTS FOR: on Free, no route reaches checkout
 * without passing the disclosure. Asserted by exhausting the page's buttons,
 * not by naming the two we happen to know about — a third route added later
 * would slip past a hand-listed check, and slipping past is exactly the
 * failure mode.
 * ==========================================================================*/
describe("Pro disclosure — the paywall is unreachable before it", () => {
  it("no button on the free page opens the paywall until the disclosure has been shown", async () => {
    const { onOpenPaywall } = renderFree();

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      // Skip the switches' own labels etc. — click everything clickable; the
      // disabled controls inside LockedFeature's fieldset no-op by design.
      await userEvent.click(b, { pointerEventsCheck: 0 });
      if (panel()) break;
    }
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });

  /* Wired through a STATEFUL host, not the vi.fn() the other tests use.
   * `paywallOpen` is the container's state, so with a mock callback the modal
   * can never open and "no dialog is on screen" is true no matter what the
   * code does — a vacuously green assertion. This host mirrors options.tsx's
   * actual wiring, which makes the absence mean something. */
  it("renders no paywall dialog until the disclosure's CTA is used", async () => {
    function Host() {
      const [open, setOpen] = React.useState(false);
      return (
        <OptionsView
          {...base}
          tier="free"
          paywallOpen={open}
          onOpenPaywall={() => setOpen(true)}
          onClosePaywall={() => setOpen(false)}
        />
      );
    }
    render(<Host />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(unlock());
    // The panel is up; the money question has still not been asked.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("dpip-disclosure-continue"));
    expect(await screen.findByRole("dialog", { name: /upgrade to pro/i })).toBeInTheDocument();
  });

  it("only the disclosure's own CTA opens the paywall", async () => {
    const { onOpenPaywall } = renderFree();
    await userEvent.click(unlock());
    expect(onOpenPaywall).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("dpip-disclosure-continue"));
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("keeps the trade on screen behind the paywall, so closing it lands back on the disclosure", async () => {
    // paywallOpen is the container's state; the panel must not unmount itself
    // when the modal opens, or a user who closes the modal is returned to a
    // page that no longer explains what they were being sold.
    renderFree({ paywallOpen: true });
    await userEvent.click(unlock());
    expect(panel()).toBeInTheDocument();
  });
});

describe("Pro disclosure — placement and focus", () => {
  it("sits directly after the rows it explains, before the plan row", async () => {
    renderFree();
    await userEvent.click(unlock());
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "Keyboard shortcut",
      "Support embedded players",
      "Show status messages",
      "Enhanced window",
      "Window size",
      "In-window controls",
      "Subtitles",
      "Before you upgrade: the enhanced window has a title bar",
      "Your plan",
      "Restore purchase",
    ]);
  });

  it("moves focus into the panel, because one entry point sits below it", async () => {
    renderFree();
    // The plan row's Upgrade button is further down the page than the panel it
    // opens. Without moving focus, a keyboard or screen-reader user is left
    // where they were and the panel is announced to nobody.
    await userEvent.click(upgrade());
    expect(panel()).toHaveFocus();
  });

  it("is a labelled region, not an anonymous div", async () => {
    renderFree();
    await userEvent.click(unlock());
    const p = panel()!;
    expect(p.tagName).toBe("SECTION");
    const labelledBy = p.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent(/title bar/i);
  });
});
