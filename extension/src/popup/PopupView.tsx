import React, { useState } from "react";
import { Typography, Space, Divider, Input, Button } from "antd";
import {
  TierBadge,
  LockedFeature,
  UpgradePaywall,
  PaymentNudge,
  type PaywallPlan,
} from "../ui-kit";
import type { Tier, Plan, PaidStatus } from "../contract";

const { Title, Text } = Typography;

export interface PopupViewProps {
  tier: Tier;
  plan?: Plan;
  status?: PaidStatus;
  manageBillingHref?: string;
  paywallOpen: boolean;
  onOpenPaywall: () => void;
  onClosePaywall: () => void;
  onCheckout: (planId: Plan) => void;
  plans: PaywallPlan[];
}

/** Always-free demo tool: uppercases whatever text the user types. Works at any tier. */
function UppercaseTool() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Input
        aria-label="Text to uppercase"
        placeholder="Type something…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button onClick={() => setResult(text.toUpperCase())}>Uppercase</Button>
      <Text data-testid="uppercase-result">{result}</Text>
    </Space>
  );
}

/** Trivial pro-only demo tool: reverses text. Gated by LockedFeature in PopupView. */
function ProTool() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Input
        aria-label="Text to reverse"
        placeholder="Pro: type something…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button onClick={() => setResult(text.split("").reverse().join(""))}>
        Run pro tool
      </Button>
      <Text data-testid="pro-tool-result">{result}</Text>
    </Space>
  );
}

/**
 * Presentational popup view. No chrome.* or fetch — the popup.tsx container
 * wires tier/plan/status from the entitlement client and onCheckout to
 * chrome.tabs.create(checkoutUrl(...)). Rendered at the natural MV3 popup
 * width (~360px) so it can be mounted unmodified in the preview gallery.
 */
export function PopupView({
  tier,
  status,
  manageBillingHref = "#",
  paywallOpen,
  onOpenPaywall,
  onClosePaywall,
  onCheckout,
  plans,
}: PopupViewProps) {
  return (
    <div style={{ width: 360, padding: 16, boxSizing: "border-box" }}>
      <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
        <Title level={4} style={{ margin: 0 }}>
          Reference Extension
        </Title>
        <TierBadge tier={tier} />
      </Space>

      <PaymentNudge status={status} manageHref={manageBillingHref} />

      <Divider orientation="left" plain>
        Uppercase (free)
      </Divider>
      <UppercaseTool />

      <Divider orientation="left" plain>
        Reverse text (pro)
      </Divider>
      <LockedFeature locked={tier !== "pro"} onUnlock={onOpenPaywall}>
        <ProTool />
      </LockedFeature>

      <UpgradePaywall
        open={paywallOpen}
        plans={plans}
        onCheckout={onCheckout}
        onClose={onClosePaywall}
      />
    </div>
  );
}
