import React, { useEffect, useRef, useState } from "react";
import { Typography, Switch, Select, Button, Alert, Space } from "antd";
import {
  PlanBadge,
  TierBadge,
  RestoreForm,
  UpgradePaywall,
  PaymentNudge,
  LockedFeature,
  type PaywallPlan,
} from "../ui-kit";
import type { PipSettings } from "../pip/state";
import type { RestoreResult } from "../billing";
import type { Tier, Plan, PaidStatus } from "../contract";
import { TERMS_URL, REFUNDS_URL } from "../legal-links";

const { Title, Text, Paragraph } = Typography;

export interface OptionsViewProps {
  tier: Tier;
  plan?: Plan;
  status?: PaidStatus;
  manageBillingHref?: string;
  settings: PipSettings;
  /* GENERIC, not `boolean | string`. `keyof PipSettings` now includes
   * `windowSize: SizePreset`, so the old `value: boolean` signature was unsound
   * the moment Task 4 landed — and options.tsx launders the value through
   * `as Partial<PipSettings>`, which would have written a boolean into
   * windowSize with no error anywhere. Binding the value type to the key closes
   * that: onSettingChange("windowSize", true) now fails to compile. */
  onSettingChange: <K extends keyof PipSettings>(key: K, value: PipSettings[K]) => void;
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
/* CHILD combinator, deliberately. :first-of-type is scoped to the parent, and
   on free the four Pro rows sit inside LockedFeature's <fieldset> — so an
   unscoped rule makes "Enhanced window" first-of-type THERE and strips its
   divider on free while keeping it on pro. Same page, two different rules,
   depending on tier. Only the real first row (Keyboard shortcut) may lose it. */
.pip-options > .pip-options__row:first-of-type { border-top: none; padding-top: 8px; }
.pip-options__text { flex: 1 1 auto; min-width: 0; }
.pip-options__control { flex: 0 0 auto; padding-top: 2px; }
.pip-options__stack { display: flex; flex-direction: column; align-items: flex-start; }

/* ============================================================================
 * RESERVE A BAND FOR LockedFeature's "Unlock" BUTTON.
 * ============================================================================
 * LockedFeature (CORE-vendored, not editable here) centres one absolutely
 * positioned overlay over the whole gated block. With four rows inside it, that
 * centre lands in the middle of the second row: measured on the committed
 * screenshots, the button sat across "Remember the size for each si|te" at
 * 1280px and covered the Select's value — "Medium · 400×225", the one thing
 * that row exists to report — at 375px. Every unit and computed-style assertion
 * passed both times; only a human looking at the image could see it, and this
 * is the surface that asks for money.
 *
 * Fixed WITHOUT touching the vendored component: pad a blank strip onto the top
 * of the fieldset and pin the overlay's button into it. Both rules need
 * !important because LockedFeature sets padding:0 and align-items:center as
 * INLINE styles, which outrank any selector. The band is padding we own, so
 * its position is deterministic rather than depending on how tall the block
 * happens to be after a copy change.
 * ==========================================================================*/
.pip-options .ui-kit-locked-feature > fieldset { padding-top: 48px !important; }
.pip-options .ui-kit-locked-feature-overlay {
  align-items: flex-start !important;
  padding-top: 8px;
}
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

/* ============================================================================
 * THE ENHANCED-WINDOW DISCLOSURE PANEL (see DpipDisclosure below for why it
 * exists at all). The only rule here that is load-bearing rather than cosmetic
 * is the image sizing.
 *
 * The comparison image is inherently WIDE — it is two browser windows side by
 * side — and this page is a 560px column that must not scroll sideways at
 * 375px. So the image is a block at width:100% with height:auto: it scales
 * DOWN into whatever column it is given and can never push the column out.
 * An intrinsic-width img, or one with a min-width, would do the opposite, and
 * the resulting horizontal scroll is invisible to every DOM assertion in this
 * repo (documented in options-visual.spec.ts, which measures scrollWidth for
 * exactly this reason).
 * ==========================================================================*/
.pip-options__disclosure {
  margin: 4px 0 0;
  padding: 16px;
  border: 1px solid var(--ant-color-primary, #1677ff);
  border-radius: 8px;
  background: rgba(22, 119, 255, 0.04);
  outline: none;
}
.pip-options__disclosure-figure { margin: 0 0 12px; }
.pip-options__disclosure-img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  border: 1px solid rgba(5, 5, 5, 0.15);
}
.pip-options__disclosure-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
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

/* ============================================================================
 * The comparison image, relative to options.html.
 *
 * webpack copies src/static/ to the build root and options.html is emitted
 * there too, so this bare filename resolves in the packaged extension AND in
 * the preview gallery (webpack.preview.cjs copies the same directory for that
 * reason). No web_accessible_resources entry is needed: the options page is
 * itself an extension page loading a same-package file.
 *
 * THE FILE IN THE TREE IS A PLACEHOLDER — an 80-byte flat magenta rectangle,
 * deliberately hideous. The real asset is two screenshots composited by a
 * human; scripts/check-assets.mjs blocks `npm run build:zip` until one exists,
 * and its failure message is the instructions. Do not "improve" the
 * placeholder: something that looks like a screenshot passes review by looking
 * finished and then ships.
 * ==========================================================================*/
const COMPARISON_IMAGE = "pro-window-comparison.png";

/* ============================================================================
 * THE DISCLOSURE PANEL — the paywall's honesty, and the reason this product is
 * not the competitor it is positioned against.
 * ============================================================================
 *
 * The Pro tier is a Document PiP "enhanced window". Its one cost is imposed by
 * Chrome and is permanent: a 34px title bar showing the page's domain, which
 * no CSS can remove. SuperPiP (3.8 stars) shipped that bar silently as the
 * default; its reviews say the site-address border is insufferable.
 *
 * So this panel is interposed: Unlock -> disclosure -> upgrade. Nothing on the
 * Free page reaches checkout without passing through it. A user who reads this
 * and declines keeps the chrome-free standard window, which is the default and
 * always will be.
 *
 * THE WORDS CARRY IT, NOT THE IMAGE. The caption states the title bar and the
 * domain in prose, because the image is invisible to a screen reader, to a
 * user who blocks images, and to anyone on a connection where it has not
 * loaded yet. If the only honest thing on screen is a picture, the disclosure
 * is conditional on a rendering — which is not a disclosure.
 * ==========================================================================*/
function DpipDisclosure({
  onContinue,
  onDismiss,
}: {
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLElement>(null);

  /* Both entry points open this panel, and one of them — the "Upgrade" button
   * in the plan row — sits BELOW it on the page. Without moving focus, that
   * user's screen reader and viewport both stay where they were and the panel
   * they just asked for is announced to nobody. tabIndex={-1} makes the region
   * focusable for this purpose only; it is not in the tab order.
   * scrollIntoView is optional-called because happy-dom does not implement it. */
  useEffect(() => {
    ref.current?.focus();
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);

  return (
    <section
      ref={ref}
      data-testid="dpip-disclosure"
      className="pip-options__disclosure"
      tabIndex={-1}
      aria-labelledby="dpip-disclosure-heading"
    >
      <Title id="dpip-disclosure-heading" level={3} style={{ margin: 0, fontSize: 15 }}>
        Before you upgrade: the enhanced window has a title bar
      </Title>

      <Paragraph type="secondary" style={{ margin: "4px 0 12px", fontSize: 13 }}>
        Both windows, on the same video, at the same size.
      </Paragraph>

      <figure className="pip-options__disclosure-figure">
        <img
          className="pip-options__disclosure-img"
          src={COMPARISON_IMAGE}
          alt="Two floating windows side by side: on the left the standard window, showing only the video with no title bar; on the right the enhanced window, with a title bar across its top showing the site's domain."
        />
      </figure>

      {/* The trade, in words. Deliberately not a bullet list of benefits with
        * the cost tucked underneath — the cost is a full sentence of its own,
        * in the same voice and the same size as the gains. */}
      <Paragraph style={{ margin: "0 0 8px", fontSize: 13 }}>
        <Text strong>What you gain.</Text> The enhanced window opens at the exact size you pick, and
        it can remember a different size for each site. Playback controls and subtitles are drawn
        inside the window itself, so they are there when you need them.
      </Paragraph>

      <Paragraph style={{ margin: "0 0 8px", fontSize: 13 }}>
        <Text strong>What it costs.</Text> The enhanced window carries a title bar across its top
        showing the site&apos;s domain — the web address of the page the video came from. Chrome
        draws that bar itself. It is about 34 pixels tall, it is always there, and{" "}
        <Text strong>no setting in this extension and no stylesheet can remove it</Text>. That is the
        whole trade.
      </Paragraph>

      <Paragraph style={{ margin: "0 0 12px", fontSize: 13 }}>
        <Text strong>If you would rather not.</Text> The standard floating window has no title bar
        at all. It stays the default, it keeps working exactly as it does today, and nothing about
        it changes if you decide against Pro.
      </Paragraph>

      <div className="pip-options__disclosure-actions">
        <Button type="primary" data-testid="dpip-disclosure-continue" onClick={onContinue}>
          Continue to upgrade
        </Button>
        <Button type="link" data-testid="dpip-disclosure-dismiss" onClick={onDismiss}>
          No thanks — keep the standard window
        </Button>
      </div>
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
 * subtitles) render at EVERY tier, wrapped in a single LockedFeature. On free
 * that means a disabled <fieldset> at half opacity behind an Unlock overlay —
 * genuinely non-interactive, not merely dimmed — but still legible. Hiding them
 * on free would be the easy alternative and the wrong one: a user who cannot
 * see what Pro contains has no reason to want it, and the enhanced window's
 * one real trade-off (a title bar) belongs on the row itself rather than only
 * inside a paywall they may never open.
 *
 * ON FREE, NOTHING REACHES CHECKOUT WITHOUT PASSING THE DISCLOSURE. Both
 * entry points — LockedFeature's Unlock overlay and the plan row's Upgrade
 * button — open DpipDisclosure; only its own "Continue to upgrade" calls
 * onOpenPaywall. That indirection is the point of this task: previously both
 * buttons opened the paywall directly, so the extension asked for money before
 * it had ever named the title bar the buyer is agreeing to.
 *
 * `disclosureShown` is the ONLY state in this otherwise purely presentational
 * component, and it stays here rather than being lifted to options.tsx because
 * it is not persisted, not read by anything else, and involves no chrome.*
 * call — lifting it would put presentation state in the container for nothing.
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
  const [disclosureShown, setDisclosureShown] = useState(false);
  const locked = tier !== "pro";
  /* Guarded on `locked` as well as the flag: if the tier resolves to pro while
   * the panel is open (a restore landing, the entitlement refresh returning),
   * the gate it belongs to has gone and so should it. */
  const showDisclosure = locked && disclosureShown;

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
          {/* Opens the DISCLOSURE, not the paywall. This button is the second
            * route to checkout and it sells exactly the same thing the locked
            * rows do, so it owes the buyer the same trade-off first. Its label
            * and its free-only visibility are unchanged — several e2e specs
            * use "Upgrade" as the tier indicator. */}
          {tier === "free" ? (
            <Button type="primary" onClick={() => setDisclosureShown(true)}>
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

      {/* THE LOCKED BLOCK IS LAST. Everything a user can operate comes first,
        * so the page has ONE enabled->dimmed transition instead of a dimmed
        * hole punched through the middle of the settings, and Upgrade (in the
        * account rows above) sits on the same side of the boundary as the
        * features it unlocks. Inverts 03-ux-ui.md §3.5; amendment A-05. */}
      <LockedFeature locked={locked} onUnlock={() => setDisclosureShown(true)}>
        <Row
          label="Enhanced window"
          help={
            <>
              Opens the floating video in a window you can size, with controls inside it.{" "}
              <Text strong>It carries a small title bar showing the site&apos;s domain</Text> — the
              standard window has none. Leave this off to keep the chrome-free one.
            </>
          }
          control={
            <Switch
              aria-label="Enhanced window"
              checked={settings.enhancedWindow}
              onChange={(checked) => onSettingChange("enhancedWindow", checked)}
            />
          }
        />

        <Row
          label="Window size"
          help="The size the enhanced window opens at, and whether each site keeps its own."
          control={
            <div className="pip-options__stack">
            <Select
              aria-label="Window size"
              value={settings.windowSize}
              /* 176, not the 132 this row was drafted with. MEASURED, twice,
               * because the first correction was still too small: antd's
               * selection item reserves 18px on the end for the arrow, so a
               * 132px Select left the label 90px against the 123.3px the
               * widest option needs, and the CURRENT VALUE — the one thing
               * this control exists to report — ellipsised to "Medium · 4…"
               * at both viewports. `scrollWidth` on the item reads 141; 176
               * gives it 152 and still fits the 375px column with room for a
               * wider system font than this machine's. */
              style={{ width: 176 }}
              onChange={(v) => onSettingChange("windowSize", v)}
              options={[
                { value: "small", label: "Small · 320×180" },
                { value: "medium", label: "Medium · 400×225" },
                { value: "large", label: "Large · 640×360" },
              ]}
            />
            {/* The sub-switch belongs in the CONTROL column, under the Select.
              * In the text column it reflowed ABOVE the Select on mobile — a
              * qualifier rendering before the thing it qualifies. Caught by
              * looking at the 375px screenshot; every DOM assertion passed
              * either way, because reading order is not something querySelector
              * can see. */}
            <div style={{ marginTop: 10, whiteSpace: "nowrap" }}>
              <Switch
                size="small"
                aria-label="Remember size per site"
                checked={settings.rememberSizePerSite}
                onChange={(checked) => onSettingChange("rememberSizePerSite", checked)}
              />{" "}
              <Text style={{ fontSize: 13 }}>Remember the size for each site</Text>
            </div>
            </div>
          }
        />

        <Row
          label="In-window controls"
          help={
            <>
              Play, pause, seek and speed, drawn inside the floating window. Worth having:{" "}
              <Text strong>keyboard shortcuts do not reach a floating window</Text> once you have
              clicked it, so these are the only controls available at that moment.
            </>
          }
          control={
            <Switch
              aria-label="In-window controls"
              checked={settings.inWindowControls}
              onChange={(checked) => onSettingChange("inWindowControls", checked)}
            />
          }
        />

        <Row
          label="Subtitles"
          help="Turn on the video's own subtitle track when the enhanced window opens, if it has one."
          control={
            <Switch
              aria-label="Subtitles"
              checked={settings.subtitles}
              onChange={(checked) => onSettingChange("subtitles", checked)}
            />
          }
        />
      </LockedFeature>

      {/* Directly under the rows it explains, so the user can look from the
        * claim to the control and back. Rendered only once asked for: on first
        * paint the page is settings, not a sales pitch. */}
      {showDisclosure ? (
        <DpipDisclosure
          onContinue={onOpenPaywall}
          onDismiss={() => setDisclosureShown(false)}
        />
      ) : null}

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
        {/* Policy links go in the EXISTING footer rather than a second one — a
            policy nobody can reach doesn't count, and Stripe and CWS reviewers
            follow these. The "Read the source" link above is untouched. */}
        <Paragraph style={{ fontSize: 12, margin: "6px 0 0" }} data-testid="legal-links">
          <a href={TERMS_URL} target="_blank" rel="noreferrer">
            Terms of Service
          </a>
          {" · "}
          <a href={REFUNDS_URL} target="_blank" rel="noreferrer">
            Refund Policy
          </a>
        </Paragraph>
      </footer>

      <UpgradePaywall
        open={paywallOpen}
        plans={plans}
        onCheckout={onCheckout}
        onClose={onClosePaywall}
        subtitle="One-time payment. 14-day refund, no questions asked."
      />
    </div>
  );
}
