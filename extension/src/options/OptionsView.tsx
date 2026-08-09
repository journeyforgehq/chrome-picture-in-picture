import React from "react";
import { Typography, Switch, Button, Alert, Space } from "antd";
import {
  PlanBadge,
  TierBadge,
  RestoreForm,
  UpgradePaywall,
  PaymentNudge,
  type PaywallPlan,
} from "../ui-kit";
import type { PipSettings } from "../pip/state";
import type { RestoreResult } from "../billing";
import type { Tier, Plan, PaidStatus } from "../contract";

const { Title, Text, Paragraph } = Typography;

export interface OptionsViewProps {
  tier: Tier;
  plan?: Plan;
  status?: PaidStatus;
  manageBillingHref?: string;
  settings: PipSettings;
  onSettingChange: (key: keyof PipSettings, value: boolean) => void;
  /** Opens chrome://extensions/shortcuts. A plain anchor cannot — see the
   *  comment on the button that calls this. */
  onOpenShortcuts: () => void;
  restoreResult?: RestoreResult;
  restoring: boolean;
  onRestore: (email: string) => void;
  onOpenPaywall: () => void;
  paywallOpen: boolean;
  onClosePaywall: () => void;
  onCheckout: (planId: Plan) => void;
  plans: PaywallPlan[];
  /** Public repository link shown in the footer. */
  sourceUrl: string;
  /** True after chrome.permissions.request() came back denied. */
  siteAccessDenied?: boolean;
}

/* ============================================================================
 * Focus rings and the sub-480px reflow live in a stylesheet, not inline styles,
 * because neither `:focus` nor `@media` can be expressed as a style object.
 *
 * `:focus` — NOT `:focus-visible`. Chrome only matches :focus-visible on a
 * programmatic .focus() when the preceding interaction was already keyboard-ish,
 * so a :focus-visible-only ring is invisible to a Playwright focus() check and,
 * worse, silently regressable. antd sets `outline: none` on its controls and
 * leans on a box-shadow; these rules put a real outline back. Never remove them
 * in favour of `outline: none`.
 * ==========================================================================*/
const STYLES = `
.pip-options {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  box-sizing: border-box;
}
.pip-options__row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 0;
  border-top: 1px solid rgba(5, 5, 5, 0.06);
}
.pip-options__row:first-of-type { border-top: none; padding-top: 8px; }
.pip-options__text { flex: 1 1 auto; min-width: 0; }
.pip-options__control { flex: 0 0 auto; padding-top: 2px; }
.pip-options__wide { display: block; }
.pip-options__wide .pip-options__control { padding-top: 12px; }

@media (max-width: 480px) {
  .pip-options { padding: 16px 12px 32px; }
  .pip-options__row { flex-direction: column; align-items: stretch; gap: 10px; }
  .pip-options__control { padding-top: 0; align-self: flex-start; }
  /* The restore form is inline on desktop; stack it so the email field and the
     submit button each get the full column instead of squeezing to nothing. */
  .pip-options .ant-form-inline .ant-form-item { margin-inline-end: 0; width: 100%; }
  .pip-options .ant-form-inline { row-gap: 8px; }
}

.pip-options a:focus,
.pip-options button:focus,
.pip-options input:focus,
.pip-options .ant-switch:focus {
  outline: 2px solid var(--ant-color-primary, #1677ff);
  outline-offset: 2px;
}
`;

/** One label + help-text block, with an optional control to its right. */
function Row({
  label,
  help,
  control,
  children,
  wide = false,
}: {
  label: string;
  help?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <section className={`pip-options__row${wide ? " pip-options__wide" : ""}`}>
      <div className="pip-options__text">
        <Title level={3} style={{ margin: 0, fontSize: 15 }}>
          {label}
        </Title>
        {help ? (
          <Paragraph type="secondary" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {help}
          </Paragraph>
        ) : null}
        {wide ? null : children}
      </div>
      {control ? <div className="pip-options__control">{control}</div> : null}
      {wide ? <div className="pip-options__control">{children}</div> : null}
    </section>
  );
}

/**
 * The extension's only page. Purely presentational: options.tsx owns every
 * chrome.* call, and in particular owns calling chrome.permissions.request
 * straight out of the switch's change handler — that API rejects with
 * "This function must be called during a user gesture" if anything is awaited
 * first, so the request cannot live behind an async boundary here.
 *
 * The four Pro feature rows (enhanced window, window size, in-window controls,
 * subtitles) belong to a later plan and are deliberately absent.
 */
export function OptionsView({
  tier,
  plan,
  status,
  manageBillingHref = "#",
  settings,
  onSettingChange,
  onOpenShortcuts,
  restoreResult,
  restoring,
  onRestore,
  onOpenPaywall,
  paywallOpen,
  onClosePaywall,
  onCheckout,
  plans,
  sourceUrl,
  siteAccessDenied = false,
}: OptionsViewProps) {
  return (
    <div className="pip-options">
      <style>{STYLES}</style>

      <Title level={2} style={{ fontSize: 20, marginBottom: 20 }}>
        Picture in Picture — Settings
      </Title>

      <Row
        label="Keyboard shortcut"
        help={
          <>
            <Text code>Alt+P</Text> pops out the video in the current tab. It works while a{" "}
            <Text strong>browser window has focus</Text> — not while the floating window, or
            another app, is the thing you clicked last.
          </>
        }
        control={
          // NOT an <a href="chrome://extensions/shortcuts">. Chrome blocks
          // renderer-initiated navigation to chrome:// URLs and extension pages
          // are NOT exempt, so that anchor is inert — it looks like a working
          // link and does nothing. chrome.tabs.create() is the supported route
          // and needs no "tabs" permission (that gates tab *querying*, not
          // creation); options.tsx owns the call so this file stays chrome-free.
          <Button type="link" style={{ padding: 0 }} onClick={onOpenShortcuts}>
            Change shortcut
          </Button>
        }
      />

      <Row
        label="Support embedded players"
        help={
          <>
            Some videos sit inside a player embedded from another site. Reaching one means this
            extension has to run on that page, so Chrome will ask you to allow access to{" "}
            <Text strong>all sites</Text>. Videos on the page itself keep working without it.
          </>
        }
        control={
          <Switch
            aria-label="Support embedded players"
            checked={settings.embeddedPlayers}
            onChange={(checked) => onSettingChange("embeddedPlayers", checked)}
          />
        }
      >
        {siteAccessDenied ? (
          <div data-testid="site-access-denied" style={{ marginTop: 12 }}>
            <Alert
              type="info"
              message="Site access wasn't granted, so embedded players stay off. Videos on the page itself still pop out normally — you can turn this on any time."
            />
          </div>
        ) : null}
      </Row>

      <Row
        label="Show status messages"
        help="A short message appears when there's no video to pop out, or when a site blocks it. Turn this off if you'd rather it fail quietly."
        control={
          <Switch
            aria-label="Show status messages"
            checked={settings.toastEnabled}
            onChange={(checked) => onSettingChange("toastEnabled", checked)}
          />
        }
      />

      <Row
        label="Your plan"
        wide
        control={
          <span data-testid="tier-badge">
            <TierBadge tier={tier} />
          </span>
        }
      >
        <Space direction="vertical" size="small" style={{ width: "100%" }}>
          <PaymentNudge status={status} manageHref={manageBillingHref} />
          <PlanBadge plan={plan} status={status} />
          {tier === "free" ? (
            <Button type="primary" onClick={onOpenPaywall}>
              Upgrade
            </Button>
          ) : null}
        </Space>
      </Row>

      <Row
        label="Restore purchase"
        help="Bought Pro already? Enter the email you used at checkout to restore it on this device."
        wide
      >
        <RestoreForm onRestore={onRestore} result={restoreResult} loading={restoring} />
      </Row>

      <footer style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid rgba(5, 5, 5, 0.06)" }}>
        <Paragraph type="secondary" data-testid="privacy-note" style={{ fontSize: 12, margin: 0 }}>
          This extension never collects, stores, or transmits your browsing history, and it never
          sees what you watch.
        </Paragraph>
        <Paragraph style={{ fontSize: 12, margin: "6px 0 0" }}>
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            Read the source
          </a>
        </Paragraph>
      </footer>

      <UpgradePaywall
        open={paywallOpen}
        plans={plans}
        onCheckout={onCheckout}
        onClose={onClosePaywall}
      />
    </div>
  );
}
