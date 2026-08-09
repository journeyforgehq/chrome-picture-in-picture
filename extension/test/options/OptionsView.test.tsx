import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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

const SOURCE_URL = "https://example.invalid/source";

/** The four rows that belong to the LATER Pro plan. None of these labels may
 * appear on the v1 free options page, at any tier. */
const PRO_ROW_LABELS = [/enhanced window/i, /window size/i, /in-window controls/i, /subtitles/i];

function renderOptions(overrides: Partial<React.ComponentProps<typeof OptionsView>> = {}) {
  const props: React.ComponentProps<typeof OptionsView> = {
    tier: "free",
    settings: { embeddedPlayers: false, toastEnabled: true },
    onSettingChange: vi.fn(),
    onOpenShortcuts: vi.fn(),
    restoring: false,
    onRestore: vi.fn(),
    onOpenPaywall: vi.fn(),
    paywallOpen: false,
    onClosePaywall: vi.fn(),
    onCheckout: vi.fn(),
    plans: PLANS,
    sourceUrl: SOURCE_URL,
    ...overrides,
  };
  render(
    <ThemeProvider>
      <OptionsView {...props} />
    </ThemeProvider>
  );
  return props;
}

describe("OptionsView — rows", () => {
  it("renders exactly the five v1 rows, in order", () => {
    renderOptions();
    const rows = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(rows).toEqual([
      "Keyboard shortcut",
      "Support embedded players",
      "Show status messages",
      "Your plan",
      "Restore purchase",
    ]);
  });

  it("shows none of the four Pro feature rows on free", () => {
    renderOptions({ tier: "free" });
    for (const label of PRO_ROW_LABELS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("shows none of the four Pro feature rows on pro either", () => {
    renderOptions({ tier: "pro" });
    for (const label of PRO_ROW_LABELS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe("OptionsView — keyboard shortcut row", () => {
  // Asserting href="chrome://extensions/shortcuts" would be WORSE than having
  // no test: Chrome blocks renderer-initiated navigation to chrome:// URLs and
  // extension pages are not exempt, so such an anchor is inert. Pinning its
  // href makes a dead control look defended. Assert the handler instead — the
  // container turns it into chrome.tabs.create, which does work.
  it("hands off to the container rather than relying on an inert chrome:// anchor", async () => {
    const props = renderOptions();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /change shortcut/i }));
    expect(props.onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it("exposes the shortcut control as a real focusable control, not a bare anchor", () => {
    renderOptions();
    const control = screen.getByRole("button", { name: /change shortcut/i });
    expect(control.tagName).toBe("BUTTON");
    // No dead chrome:// href anywhere on the page.
    expect(document.querySelector('a[href^="chrome://"]')).toBeNull();
  });

  it("says the key works while a BROWSER WINDOW has focus (not the floating window)", () => {
    renderOptions();
    // Measured: chrome.commands only fire when a browser window holds focus —
    // not when the PiP window or another app does. The help text must not
    // promise otherwise.
    expect(screen.getByText(/browser window has focus/i)).toBeInTheDocument();
    expect(screen.getByText(/not while the floating window/i)).toBeInTheDocument();
  });
});

describe("OptionsView — embedded players row", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", { permissions: { request: vi.fn(), remove: vi.fn() } });
  });

  it("toggling it on reports ('embeddedPlayers', true) to the container", async () => {
    const props = renderOptions({ settings: { embeddedPlayers: false, toastEnabled: true } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: /support embedded players/i }));
    expect(props.onSettingChange).toHaveBeenCalledWith("embeddedPlayers", true);
  });

  it("toggling it off reports ('embeddedPlayers', false)", async () => {
    const props = renderOptions({ settings: { embeddedPlayers: true, toastEnabled: true } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: /support embedded players/i }));
    expect(props.onSettingChange).toHaveBeenCalledWith("embeddedPlayers", false);
  });

  it("reflects the current setting in the switch's checked state", () => {
    renderOptions({ settings: { embeddedPlayers: true, toastEnabled: true } });
    expect(screen.getByRole("switch", { name: /support embedded players/i })).toBeChecked();
  });

  it("explains WHY site access is needed BEFORE anything is requested", () => {
    const props = renderOptions();
    // The reason is on screen at first paint — no click, no grant, no request.
    expect(screen.getByText(/run on that page/i)).toBeInTheDocument();
    expect(screen.getByText(/all sites/i)).toBeInTheDocument();
    expect(props.onSettingChange).not.toHaveBeenCalled();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });

  it("shows a non-alarming notice, and leaves the switch off, when the grant is declined", () => {
    renderOptions({ siteAccessDenied: true, settings: { embeddedPlayers: false, toastEnabled: true } });
    const notice = screen.getByTestId("site-access-denied");
    expect(notice).toHaveTextContent(/still/i);
    expect(notice.querySelector(".ant-alert-error")).toBeNull();
    expect(screen.getByRole("switch", { name: /support embedded players/i })).not.toBeChecked();
  });

  it("shows no notice when nothing was declined", () => {
    renderOptions({ siteAccessDenied: false });
    expect(screen.queryByTestId("site-access-denied")).not.toBeInTheDocument();
  });
});

describe("OptionsView — status messages row", () => {
  it("toggling it reports ('toastEnabled', false)", async () => {
    const props = renderOptions({ settings: { embeddedPlayers: false, toastEnabled: true } });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: /show status messages/i }));
    expect(props.onSettingChange).toHaveBeenCalledWith("toastEnabled", false);
  });

  it("reflects the current setting in the switch's checked state", () => {
    renderOptions({ settings: { embeddedPlayers: false, toastEnabled: false } });
    expect(screen.getByRole("switch", { name: /show status messages/i })).not.toBeChecked();
  });
});

describe("OptionsView — your plan row", () => {
  it("renders the TierBadge for free", () => {
    renderOptions({ tier: "free" });
    expect(screen.getByTestId("tier-badge")).toHaveTextContent("Free");
  });

  it("renders the TierBadge for pro", () => {
    renderOptions({ tier: "pro" });
    expect(screen.getByTestId("tier-badge")).toHaveTextContent("Pro");
  });

  it("renders PlanBadge from plan/status props", () => {
    renderOptions({ tier: "pro", plan: "annual", status: "active" });
    expect(screen.getByText("Annual")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders 'No plan' when plan is undefined", () => {
    renderOptions({ plan: undefined, status: undefined });
    expect(screen.getByText("No plan")).toBeInTheDocument();
  });

  it("renders the PaymentNudge only when past_due", () => {
    renderOptions({ tier: "pro", plan: "annual", status: "past_due" });
    expect(screen.getByText(/payment issue/i)).toBeInTheDocument();
  });

  it("renders no PaymentNudge when active", () => {
    renderOptions({ tier: "pro", plan: "annual", status: "active" });
    expect(screen.queryByText(/payment issue/i)).not.toBeInTheDocument();
  });

  it("offers Upgrade on the free tier", () => {
    const props = renderOptions({ tier: "free" });
    fireEvent.click(screen.getByRole("button", { name: /^upgrade$/i }));
    expect(props.onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("offers no Upgrade button on the pro tier", () => {
    renderOptions({ tier: "pro" });
    expect(screen.queryByRole("button", { name: /^upgrade$/i })).not.toBeInTheDocument();
  });

  it("renders UpgradePaywall as open when paywallOpen is true", () => {
    renderOptions({ paywallOpen: true });
    expect(screen.getByRole("dialog", { name: /upgrade to pro/i })).toBeInTheDocument();
  });
});

describe("OptionsView — restore row", () => {
  it("wires the RestoreForm's submit to onRestore(email)", async () => {
    const props = renderOptions();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/email/i), "a@b.com");
    await user.click(screen.getByRole("button", { name: /restore purchase/i }));
    expect(props.onRestore).toHaveBeenCalledWith("a@b.com");
  });

  it("reflects a 404 restoreResult as a warning alert", () => {
    renderOptions({
      restoreResult: {
        ok: false,
        tier: "free",
        error: { status: 404, name: "unavailable", message: "not found" },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/no active purchase found/i);
  });

  it("reflects a success restoreResult", () => {
    renderOptions({ restoreResult: { ok: true, tier: "pro" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/purchase restored/i);
  });
});

describe("OptionsView — footer", () => {
  it("states the privacy position", () => {
    renderOptions();
    expect(screen.getByTestId("privacy-note")).toHaveTextContent(/never/i);
  });

  it("links to the source", () => {
    renderOptions();
    expect(screen.getByRole("link", { name: /read the source/i })).toHaveAttribute(
      "href",
      SOURCE_URL
    );
  });
});
