// Dev-only preview gallery: mounts every ui-kit component in every
// representative state, PLUS OptionsView in every representative tier/state,
// wrapped in <ThemeProvider>, so Playwright MCP can screenshot +
// computed-style-check each state (spec §11A, Plan 2b-ii).
//
// This is now the ONLY place LockedFeature renders — it has no production mount
// until the paid tier adds the Pro rows, and this gallery is what keeps it from
// rotting in the meantime (decisions log, recorded gap 1).
import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Typography, Space, Divider, Modal } from "antd";
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
import { DEFAULT_SETTINGS, type PipSettings } from "../src/pip/state";
import type { Plan, PaidStatus } from "../src/contract";
import { OptionsView } from "../src/options/OptionsView";
// The SHIPPED plan array, not a fixture. See REAL_PLANS' own section below.
import { PLANS as REAL_PLANS } from "../src/billing/plans";
import { PIP_ERROR_CODES, messageFor, severityFor } from "../src/pip/errors";
import { showToast } from "../src/pip/toast";

const { Title } = Typography;

/**
 * A FIXTURE, on purpose — and not the array this extension ships.
 *
 * v1 sells one plan (`src/billing/plans.ts`, $9.99 lifetime), which takes
 * UpgradePaywall's one-plan branch (span 24, width 380). This two-plan fixture
 * keeps the MULTI-plan layout (span 12, width 560) and the POPULAR-ribbon path
 * renderable for the paid-tier plan, which re-adds a subscription. Deleting it
 * would leave those branches with no rendering anywhere.
 *
 * The real array has its own card further down — see REAL_PLANS.
 */
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

/** Wraps an OptionsView with its own local paywall + settings state, so each
 * card is independently interactive (clicking a Switch really flips it, which
 * is what the visual spec's checked-colour assertion needs to be meaningful). */
function OptionsViewCard({
  tier = "free",
  status,
  plan,
  restoreResult,
  settings: initialSettings = { ...DEFAULT_SETTINGS, embeddedPlayers: false, toastEnabled: true },
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
  // Both of these start CLOSED. Only one modal may be open on load: the visual
  // spec closes that one and waits for `.ant-modal-mask` to be hidden before it
  // asserts anything (a mask over the page produced a screenshot with no content
  // in it once already — see the spec's header, trap 3).
  const [realPaywallOpen, setRealPaywallOpen] = useState(false);
  const [controlModalOpen, setControlModalOpen] = useState(false);

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

        {/* Driven off PIP_ERROR_CODES itself, so a new code gets a rendered
            card automatically rather than by somebody remembering to add one.
            RESTRICTED_URL has no toast (severity "tooltip") and ToastCard
            returns an empty card for it — deliberately, so the gallery still
            names every code in the catalogue. */}
        <Divider orientation="left">Toast — all seven states</Divider>
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {PIP_ERROR_CODES.map((code) => (
            <ToastCard key={code} code={code} />
          ))}
        </Space>

        {/* The two PopupView cards used to sit here. They were the gallery's
            only fixed-width (360px) content and the sole cause of the 19px
            horizontal overflow the fidelity baseline recorded at 375px
            (baseline/README.md, defect 1). options-visual.spec.ts now asserts
            scrollWidth <= viewport, so the fix cannot silently regress. */}

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
          <OptionsViewCard settings={{ ...DEFAULT_SETTINGS, embeddedPlayers: true, toastEnabled: true }} />
        </div>

        <Divider orientation="left">OptionsView — restore 404</Divider>
        <div data-testid="optionsview-restore-404">
          <OptionsViewCard restoreResult={RESTORE_STATES["404"]} />
        </div>

        {/* ------------------------------------------------------------------
         * THE PAYWALL THIS EXTENSION ACTUALLY SHIPS.
         *
         * Every other paywall mount on this page — and in every unit test —
         * uses the two-plan fixture above. This one imports `PLANS` from
         * src/billing/plans.ts, so it is the $9.99 lifetime card a real user
         * sees, in the one-plan layout branch (span 24, width 380) that the
         * fixture can never exercise. Props are exactly OptionsView's: no
         * title/subtitle override, so the heading is the shipped default.
         *
         * Closed by default on purpose — see the state comment above.
         * ----------------------------------------------------------------*/}
        <Divider orientation="left">UpgradePaywall — real PLANS</Divider>
        <button data-testid="open-real-paywall" onClick={() => setRealPaywallOpen(true)}>
          Open real paywall
        </button>
        <UpgradePaywall
          open={realPaywallOpen}
          plans={REAL_PLANS}
          onCheckout={() => {}}
          onClose={() => setRealPaywallOpen(false)}
        />

        {/* ------------------------------------------------------------------
         * CONTROL for the focusTriggerAfterClose assertion. Not a ui-kit
         * component — a bare antd Modal with antd's DEFAULT focus handling.
         *
         * UpgradePaywall sets `focusTriggerAfterClose={false}` deliberately (a
         * gate that opens the paywall on focus would re-open it the moment the
         * user closed it). Asserting "focus does NOT return to the trigger"
         * passes for free if antd's restore is not working in the harness at
         * all — which is exactly what happens under happy-dom, where the leave
         * motion never completes and the restore callback never runs. This
         * control proves the restore IS live in the browser the spec runs in,
         * so the paywall's non-restore means something.
         * ----------------------------------------------------------------*/}
        <Divider orientation="left">Focus-restore control</Divider>
        <button data-testid="open-control-modal" onClick={() => setControlModalOpen(true)}>
          Open control modal
        </button>
        <Modal
          open={controlModalOpen}
          onCancel={() => setControlModalOpen(false)}
          footer={null}
          title="Focus-restore control"
        >
          Closing this restores focus to its trigger. The paywall must not.
        </Modal>
      </div>
    </ThemeProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("gallery root element missing");
createRoot(container).render(<Gallery />);
