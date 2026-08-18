// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Modal, Row, Col, Card, Button, Typography } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import type { Plan } from "../contract";

const { Title, Paragraph, Text } = Typography;

export interface PaywallPlan {
  id: Plan;
  label: string;
  /** Headline price, e.g. "$29" or "$3.99". */
  price: string;
  /** Small unit shown next to the price, e.g. "/mo", "/yr", "once". */
  unit?: string;
  /** Secondary price line, e.g. "Or $299/year (14% off)". */
  priceNote?: string;
  /** Short paragraph describing the plan. */
  description?: string;
  /** Checkmark bullet list of what the plan unlocks. */
  features?: string[];
  /** Emphasize this plan (accent border + "Popular" ribbon). */
  highlight?: boolean;
  /** Overrides the CTA text (default: "Choose {label}"). */
  ctaLabel?: string;
}

export interface UpgradePaywallProps {
  open: boolean;
  plans: PaywallPlan[];
  onCheckout: (planId: Plan) => void;
  onClose: () => void;
  /** Modal heading (default "Upgrade to Pro"). */
  title?: string;
  /** Optional sub-heading under the title. */
  subtitle?: string;
  /** Disclosure rendered directly beneath each CTA. Omit to render nothing.
   *  Kept as a prop so this component stays presentational — see spec §11A. */
  disclosure?: { text: string; termsUrl: string; refundsUrl: string };
}

/**
 * The CTA disclosure is the text a chargeback dispute rests on, so it is held to
 * WCAG AA (4.5:1) rather than inheriting antd's decorative tokens.
 *
 * Why these are pinned rather than themed:
 *  - antd's `type="secondary"` resolves to rgba(0,0,0,0.45) = 3.36:1 — it FAILS.
 *    rgba(0,0,0,0.65) composites to rgb(89,89,89) = 7.00:1.
 *  - Links deliberately do NOT use ACCENT. That token is overridden per
 *    extension, so the readability of legal text would otherwise depend on
 *    whichever brand colour a child happened to pick — the default #1677ff is
 *    already only 4.10:1. antd blue-7 (#0958d9) is 6.16:1 and fixed.
 *  - Underlined so the links are identifiable without relying on colour
 *    (WCAG 1.4.1), which also helps at this small a size.
 * Enforced by test/ui-kit/disclosure-contrast.test.tsx, which asserts the
 * computed ratio rather than the colour string.
 */
const DISCLOSURE_TEXT_STYLE: React.CSSProperties = {
  fontSize: 11,
  display: "block",
  marginTop: 8,
  lineHeight: 1.45,
  color: "rgba(0, 0, 0, 0.65)",
};
const DISCLOSURE_LINK_STYLE: React.CSSProperties = {
  color: "#0958d9",
  textDecoration: "underline",
};

const ACCENT = "var(--ant-color-primary, #1677ff)";

/**
 * Plan-card paywall: one card per plan side by side (stacking on mobile), each
 * with name, description, price, CTA, and an optional checkmark feature list.
 * Presentational only — clicking a plan calls onCheckout(planId); the caller
 * opens await startCheckout(planId, deviceId, ctx). The purchase disclosure comes
 * in as a prop for the same reason. No billing/network dependency (spec §11A).
 */
export function UpgradePaywall({
  open,
  plans,
  onCheckout,
  onClose,
  title = "Upgrade to Pro",
  subtitle,
  disclosure,
}: UpgradePaywallProps) {
  const span = plans.length >= 3 ? 8 : plans.length === 2 ? 12 : 24;
  // Reserve a row's vertical space ONLY when at least one plan uses it, so the
  // price + CTA line up across cards when descriptions/notes differ — without
  // leaving an empty gap when no plan has one.
  const anyDescription = plans.some((p) => p.description);
  const anyPriceNote = plans.some((p) => p.priceNote);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={title}
      destroyOnClose
      // Don't bounce focus back to the trigger on close: some gates (e.g. a
      // focus-to-upsell locked input) would immediately re-open the paywall,
      // trapping the user. Closing should stay closed.
      focusTriggerAfterClose={false}
      width={plans.length >= 3 ? 780 : plans.length === 2 ? 560 : 380}
      style={{ maxWidth: "calc(100vw - 24px)", top: 24 }}
      styles={{ body: { paddingTop: 8 } }}
    >
      {subtitle ? (
        <Paragraph type="secondary" style={{ textAlign: "center", marginBottom: 16 }}>
          {subtitle}
        </Paragraph>
      ) : null}
      <Row gutter={[16, 16]} justify="center">
        {plans.map((plan) => (
          <Col xs={24} sm={span} key={plan.id} style={{ display: "flex" }}>
            <Card
              data-testid={`plan-${plan.id}`}
              styles={{ body: { display: "flex", flexDirection: "column", height: "100%", padding: 20 } }}
              style={{
                position: "relative",
                width: "100%",
                textAlign: "center",
                borderColor: plan.highlight ? ACCENT : undefined,
                borderWidth: plan.highlight ? 2 : 1,
                boxShadow: plan.highlight ? "0 6px 20px rgba(0,0,0,0.08)" : undefined,
              }}
            >
              {plan.highlight ? (
                <div
                  style={{
                    position: "absolute",
                    top: -11,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: ACCENT,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    padding: "2px 12px",
                    borderRadius: 10,
                    whiteSpace: "nowrap",
                  }}
                >
                  POPULAR
                </div>
              ) : null}

              <Title level={4} style={{ margin: 0 }}>
                {plan.label}
              </Title>

              {/* Reserve the description row's height only when some plan uses it,
                  so the price row lines up across cards (no gap otherwise). */}
              {anyDescription ? (
                <Paragraph type="secondary" style={{ fontSize: 13, margin: "8px 0 0", minHeight: 40 }}>
                  {plan.description || " "}
                </Paragraph>
              ) : null}

              <div style={{ margin: "16px 0 2px" }}>
                <Text strong style={{ fontSize: 30, lineHeight: 1 }}>
                  {plan.price}
                </Text>
                {plan.unit ? (
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    {plan.unit}
                  </Text>
                ) : null}
              </div>

              {/* Reserve the priceNote row's height only when some plan uses it,
                  so the CTA lines up across cards (no gap otherwise). */}
              {anyPriceNote ? (
                <div style={{ minHeight: 38 }}>
                  {plan.priceNote ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {plan.priceNote}
                    </Text>
                  ) : null}
                </div>
              ) : null}

              <Button
                type="primary"
                block
                size="large"
                onClick={() => onCheckout(plan.id)}
                style={{ margin: "16px 0 0" }}
              >
                {plan.ctaLabel ?? `Choose ${plan.label}`}
              </Button>

              {/* FTC negative-option rule: renewal/refund terms and the consent
                  language belong immediately adjacent to the purchase button, not
                  in a footer. Text + links are passed in so this component keeps
                  no billing/config dependency (spec §11A). */}
              {disclosure ? (
                <Text style={{ ...DISCLOSURE_TEXT_STYLE }}>
                  {disclosure.text}{" "}
                  <a href={disclosure.termsUrl} target="_blank" rel="noreferrer" style={DISCLOSURE_LINK_STYLE}>
                    Terms
                  </a>
                  {" \u00b7 "}
                  <a href={disclosure.refundsUrl} target="_blank" rel="noreferrer" style={DISCLOSURE_LINK_STYLE}>
                    Refund policy
                  </a>
                </Text>
              ) : null}

              {plan.features && plan.features.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", textAlign: "left" }}>
                  {plan.features.map((f, i) => (
                    <li key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0" }}>
                      <CheckOutlined style={{ color: ACCENT, fontSize: 12 }} />
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        {f}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          </Col>
        ))}
      </Row>
    </Modal>
  );
}
