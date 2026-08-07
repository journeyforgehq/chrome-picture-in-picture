// Dev-only preview gallery: mounts every ui-kit component in every
// representative state, PLUS the popup/options Views in every representative
// tier/state, wrapped in <ThemeProvider>, so Playwright MCP can screenshot +
// computed-style-check each state (spec §11A, Plan 2b-ii).
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Typography, Space, Divider } from "antd";
import {
  ThemeProvider,
  TierBadge,
  PlanBadge,
  LockedFeature,
  UpgradePaywall,
  RestoreForm,
  PaymentNudge,
  type PaywallPlan,
} from "../src/ui-kit";
import type { RestoreResult } from "../src/billing/entitlement";
import { PopupView } from "../src/popup/PopupView";
import { OptionsView } from "../src/options/OptionsView";

const { Title } = Typography;

const PLANS: PaywallPlan[] = [
  {
    id: "annual",
    label: "Annual",
    price: "$29/yr",
    features: ["Everything in Monthly", "2 months free vs. monthly", "Priority support"],
  },
  {
    id: "lifetime",
    label: "Lifetime",
    price: "$79 once",
    features: ["Everything in Annual", "One-time payment, no renewals", "All future updates included"],
  },
];

const RESTORE_STATES: Record<string, RestoreResult | undefined> = {
  idle: undefined,
  success: { ok: true, tier: "pro" },
  "404": { ok: false, tier: "free", error: { status: 404, name: "unavailable", message: "not found" } },
  "429": {
    ok: false,
    tier: "free",
    error: { status: 429, name: "rate_limited", message: "Too many requests. Please slow down and try again." },
  },
};

/** Wraps a PopupView instance with its own local paywall-open state, so each
 * gallery card is independently interactive without sharing state. */
function PopupViewCard({ tier }: { tier: "free" | "pro" }) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #eee", display: "inline-block" }}>
      <PopupView
        tier={tier}
        paywallOpen={paywallOpen}
        onOpenPaywall={() => setPaywallOpen(true)}
        onClosePaywall={() => setPaywallOpen(false)}
        onCheckout={() => {}}
        plans={PLANS}
      />
    </div>
  );
}

function OptionsViewCard({ restoreResult }: { restoreResult: RestoreResult | undefined }) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  return (
    <div style={{ border: "1px solid #eee", display: "inline-block" }}>
      <OptionsView
        tier="free"
        restoreResult={restoreResult}
        restoring={false}
        onRestore={() => {}}
        onOpenPaywall={() => setPaywallOpen(true)}
        paywallOpen={paywallOpen}
        onClosePaywall={() => setPaywallOpen(false)}
        onCheckout={() => {}}
        plans={PLANS}
      />
    </div>
  );
}

function Gallery() {
  const [paywallOpen, setPaywallOpen] = useState(true); // OPEN by default so the modal is visible on load

  return (
    <ThemeProvider accent="#1677ff">
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <Title level={2}>ui-kit preview gallery</Title>

        <Divider orientation="left">TierBadge</Divider>
        <Space size="large" data-testid="tierbadge-row">
          <TierBadge tier="free" />
          <TierBadge tier="pro" />
        </Space>

        <Divider orientation="left">PlanBadge</Divider>
        <Space direction="vertical" data-testid="planbadge-column">
          <PlanBadge plan="annual" status="active" />
          <PlanBadge plan="lifetime" status="active" />
          <PlanBadge plan={undefined} status={undefined} />
        </Space>

        <Divider orientation="left">PaymentNudge — past_due</Divider>
        <div data-testid="paymentnudge">
          <PaymentNudge status="past_due" manageHref="https://billing.example" />
        </div>

        <Divider orientation="left">LockedFeature</Divider>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div data-testid="lockedfeature-locked">
            <LockedFeature locked onUnlock={() => setPaywallOpen(true)}>
              <button>Do the pro thing</button>
            </LockedFeature>
          </div>
          <div data-testid="lockedfeature-unlocked">
            <LockedFeature locked={false} onUnlock={() => {}}>
              <button>Do the pro thing</button>
            </LockedFeature>
          </div>
        </Space>

        <Divider orientation="left">UpgradePaywall</Divider>
        <button data-testid="open-paywall" onClick={() => setPaywallOpen(true)}>
          Open paywall
        </button>
        <UpgradePaywall
          open={paywallOpen}
          plans={PLANS}
          onCheckout={() => {}}
          onClose={() => setPaywallOpen(false)}
        />

        <Divider orientation="left">RestoreForm</Divider>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {Object.entries(RESTORE_STATES).map(([label, result]) => (
            <div key={label} data-testid={`restoreform-${label}`}>
              <Typography.Text type="secondary">{label}</Typography.Text>
              <RestoreForm onRestore={() => {}} result={result} />
            </div>
          ))}
        </Space>

        <Divider orientation="left">PopupView — free</Divider>
        <div data-testid="popupview-free">
          <PopupViewCard tier="free" />
        </div>

        <Divider orientation="left">PopupView — pro</Divider>
        <div data-testid="popupview-pro">
          <PopupViewCard tier="pro" />
        </div>

        <Divider orientation="left">OptionsView — free</Divider>
        <div data-testid="optionsview-free">
          <OptionsViewCard restoreResult={undefined} />
        </div>

        <Divider orientation="left">OptionsView — restore 404</Divider>
        <div data-testid="optionsview-restore-404">
          <OptionsViewCard restoreResult={RESTORE_STATES["404"]} />
        </div>
      </div>
    </ThemeProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("gallery root element missing");
createRoot(container).render(<Gallery />);
