// Dev-only preview gallery: mounts every ui-kit component in every
// representative state, PLUS the popup/options Views in every representative
// tier/state, wrapped in <ThemeProvider>, so Playwright MCP can screenshot +
// computed-style-check each state (spec §11A, Plan 2b-ii).
import React, { useState, useRef, useEffect } from "react";
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
import type { PipSettings } from "../src/pip/state";
import type { Plan, PaidStatus } from "../src/contract";
import { PopupView } from "../src/popup/PopupView";
import { OptionsView } from "../src/options/OptionsView";
import { PIP_ERROR_CODES, messageFor, severityFor } from "../src/pip/errors";
import { showToast } from "../src/pip/toast";

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

/** Wraps an OptionsView with its own local paywall + settings state, so each
 * card is independently interactive (clicking a Switch really flips it, which
 * is what the visual spec's checked-colour assertion needs to be meaningful). */
function OptionsViewCard({
  tier = "free",
  status,
  plan,
  restoreResult,
  settings: initialSettings = { embeddedPlayers: false, toastEnabled: true },
}: {
  tier?: "free" | "pro";
  status?: PaidStatus;
  plan?: Plan;
  restoreResult?: RestoreResult;
  settings?: PipSettings;
}) {
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [settings, setSettings] = useState<PipSettings>(initialSettings);
  return (
    <div style={{ border: "1px solid #eee", maxWidth: 560 }}>
      <OptionsView
        tier={tier}
        plan={plan}
        status={status}
        settings={settings}
        onSettingChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
        onOpenShortcuts={() => {}}
        restoreResult={restoreResult}
        restoring={false}
        onRestore={() => {}}
        onOpenPaywall={() => setPaywallOpen(true)}
        paywallOpen={paywallOpen}
        onClosePaywall={() => setPaywallOpen(false)}
        onCheckout={() => {}}
        plans={PLANS}
        sourceUrl="https://github.com/picture-in-picture-ext/picture-in-picture"
      />
    </div>
  );
}

/** The toast is plain DOM inside a shadow root, not React — so it is mounted
 * imperatively into a ref. `mount: "detached"` keeps showToast from appending
 * itself to document.body (and from replacing the previous card's toast);
 * placement and teardown belong to the gallery here. */
function ToastCard({ code }: { code: (typeof PIP_ERROR_CODES)[number] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sev = severityFor(code);
    if (sev === "tooltip") return;
    const host = showToast({ text: messageFor(code), severity: sev, mount: "detached" });
    ref.current?.append(host);
    return () => host.remove();
  }, [code]);
  return (
    <div data-testid={`toast-${code}`}>
      <Typography.Text type="secondary">{code}</Typography.Text>
      <div ref={ref} />
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

        <Divider orientation="left">Toast — all six states</Divider>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {PIP_ERROR_CODES.map((code) => (
            <ToastCard key={code} code={code} />
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

        <Divider orientation="left">OptionsView — pro</Divider>
        <div data-testid="optionsview-pro">
          <OptionsViewCard tier="pro" plan="lifetime" status="active" />
        </div>

        <Divider orientation="left">OptionsView — embedded players on</Divider>
        <div data-testid="optionsview-embedded-on">
          <OptionsViewCard settings={{ embeddedPlayers: true, toastEnabled: true }} />
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
