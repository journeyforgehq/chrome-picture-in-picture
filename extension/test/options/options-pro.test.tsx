import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { OptionsView } from "../../src/options/OptionsView";
import { DEFAULT_SETTINGS } from "../../src/pip/state";
import type { PaywallPlan } from "../../src/ui-kit";

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

/** antd's Select does not open on a plain click in this DOM — rc-select listens
 *  for mousedown on the selector. Open it that way, then click the option. */
function openSizeSelect() {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "Window size" }));
}

describe("Pro rows", () => {
  it("renders all four, on Free as well as Pro — a locked row still tells you what you'd get", () => {
    render(<OptionsView {...base} tier="free" />);
    for (const label of ["Enhanced window", "Window size", "In-window controls", "Subtitles"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("puts them between the status-message row and the plan row", () => {
    render(<OptionsView {...base} tier="pro" />);
    const rows = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(rows).toEqual([
      "Keyboard shortcut",
      "Support embedded players",
      "Show status messages",
      "Enhanced window",
      "Window size",
      "In-window controls",
      "Subtitles",
      "Your plan",
      "Restore purchase",
    ]);
  });

  it("makes the enhanced-window switch genuinely non-interactive on Free", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="free" onSettingChange={onSettingChange} />);
    const sw = screen.getByLabelText("Enhanced window");
    expect(sw).toBeDisabled();
    await userEvent.click(sw);
    expect(onSettingChange).not.toHaveBeenCalled();
  });

  /* Unlock -> DISCLOSURE -> paywall, not Unlock -> paywall. The enhanced
   * window's cost is a title bar Chrome draws and nobody can remove; asking for
   * money before naming it is what this indirection exists to prevent. See
   * test/options/dpip-disclosure.test.tsx for the panel's own coverage. */
  it("routes a locked row's Unlock button to the disclosure, and only then to the paywall", async () => {
    const onOpenPaywall = vi.fn();
    render(<OptionsView {...base} tier="free" onOpenPaywall={onOpenPaywall} />);
    await userEvent.click(screen.getAllByRole("button", { name: /unlock/i })[0]);
    expect(screen.getByTestId("dpip-disclosure")).toBeInTheDocument();
    expect(onOpenPaywall).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId("dpip-disclosure-continue"));
    expect(onOpenPaywall).toHaveBeenCalled();
  });

  it("shows no Unlock affordance at all on Pro", () => {
    render(<OptionsView {...base} tier="pro" />);
    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
  });

  it("lets a Pro user actually toggle it", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="pro" onSettingChange={onSettingChange} />);
    await userEvent.click(screen.getByLabelText("Enhanced window"));
    expect(onSettingChange).toHaveBeenCalledWith("enhancedWindow", true);
  });

  it("discloses the title bar in the row's own help text, not only in the paywall", async () => {
    // The trade must be visible at the moment of the decision. Burying it in a
    // modal the user may never open is how SuperPiP earned its 3.8.
    render(<OptionsView {...base} tier="pro" />);
    expect(screen.getByText(/title bar/i)).toBeInTheDocument();
  });

  it("says why in-window controls exist — shortcuts cannot reach the floating window", () => {
    // Spike S-04 measured it: chrome.commands do not fire while the floating
    // window has focus, so these are the only controls available at that moment.
    render(<OptionsView {...base} tier="pro" />);
    expect(screen.getByText(/keyboard shortcuts do not reach a floating window/i)).toBeInTheDocument();
  });

  it("reflects each stored setting in its control", () => {
    render(
      <OptionsView
        {...base}
        tier="pro"
        settings={{
          ...DEFAULT_SETTINGS,
          enhancedWindow: true,
          windowSize: "large",
          rememberSizePerSite: false,
          inWindowControls: false,
          subtitles: true,
        }}
      />
    );
    expect(screen.getByLabelText("Enhanced window")).toBeChecked();
    expect(screen.getByLabelText("In-window controls")).not.toBeChecked();
    expect(screen.getByLabelText("Subtitles")).toBeChecked();
    expect(screen.getByLabelText("Remember size per site")).not.toBeChecked();
    expect(screen.getByTitle("Large · 640×360")).toBeInTheDocument();
  });

  it("reports in-window controls and subtitles by their own keys", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="pro" onSettingChange={onSettingChange} />);
    await userEvent.click(screen.getByLabelText("In-window controls"));
    expect(onSettingChange).toHaveBeenLastCalledWith("inWindowControls", false);
    await userEvent.click(screen.getByLabelText("Subtitles"));
    expect(onSettingChange).toHaveBeenLastCalledWith("subtitles", true);
  });
});

describe("Pro rows — window size", () => {
  it("offers the three presets with their real pixel dimensions", () => {
    render(<OptionsView {...base} tier="pro" />);
    openSizeSelect();
    // The numbers are SIZE_PRESETS'. A user picking "Large" is picking 640×360.
    expect(screen.getByText("Small · 320×180")).toBeInTheDocument();
    expect(screen.getByText("Large · 640×360")).toBeInTheDocument();
  });

  it("reports the chosen preset, not a boolean — ('windowSize', 'large')", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="pro" onSettingChange={onSettingChange} />);
    openSizeSelect();
    fireEvent.click(screen.getByText("Large · 640×360"));
    expect(onSettingChange).toHaveBeenCalledWith("windowSize", "large");
  });

  /* userEvent here, NOT the fireEvent.mouseDown helper above — and the
   * difference is the whole test. fireEvent dispatches straight at the node and
   * happy-dom honours it, so `fireEvent.mouseDown` opens the dropdown even
   * inside LockedFeature's disabled <fieldset>; the real browser never
   * dispatches that event at all. userEvent models the browser's rule (it walks
   * the ancestors for a disabled fieldset and suppresses the mouse events), so
   * it is the only one of the two whose "did not open" means anything. */
  it("is non-interactive on Free", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="free" onSettingChange={onSettingChange} />);
    const combo = screen.getByRole("combobox", { name: "Window size" });
    expect(combo).toBeDisabled();
    await userEvent.click(combo);
    expect(screen.queryByText("Large · 640×360")).not.toBeInTheDocument();
    expect(onSettingChange).not.toHaveBeenCalled();
  });

  it("toggling 'Remember the size for each site' reports ('rememberSizePerSite', false)", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="pro" onSettingChange={onSettingChange} />);
    const sub = screen.getByLabelText("Remember size per site");
    expect(sub).toBeChecked(); // DEFAULT_SETTINGS.rememberSizePerSite
    await userEvent.click(sub);
    expect(onSettingChange).toHaveBeenCalledWith("rememberSizePerSite", false);
  });

  it("names the sub-switch in prose, not only in its aria-label", () => {
    render(<OptionsView {...base} tier="pro" />);
    expect(screen.getByText("Remember the size for each site")).toBeInTheDocument();
  });

  it("makes the sub-switch non-interactive on Free too", async () => {
    const onSettingChange = vi.fn();
    render(<OptionsView {...base} tier="free" onSettingChange={onSettingChange} />);
    const sub = screen.getByLabelText("Remember size per site");
    expect(sub).toBeDisabled();
    await userEvent.click(sub);
    expect(onSettingChange).not.toHaveBeenCalled();
  });
});
