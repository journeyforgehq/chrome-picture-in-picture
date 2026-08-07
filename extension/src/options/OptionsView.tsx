import React from "react";
import { Typography, Space, Divider, Button } from "antd";
import {
  PlanBadge,
  RestoreForm,
  UpgradePaywall,
  PaymentNudge,
  type PaywallPlan,
} from "../ui-kit";
import type { RestoreResult } from "../billing";
import type { Tier, Plan, PaidStatus } from "../contract";

const { Title } = Typography;

export interface OptionsViewProps {
  tier: Tier;
  plan?: Plan;
  status?: PaidStatus;
  manageBillingHref?: string;
  restoreResult?: RestoreResult;
  restoring: boolean;
  onRestore: (email: string) => void;
  onOpenPaywall: () => void;
  paywallOpen: boolean;
  onClosePaywall: () => void;
  onCheckout: (planId: Plan) => void;
  plans: PaywallPlan[];
}

/**
 * Presentational options view. No chrome.* or fetch — options.tsx wires
 * restore/checkout to the entitlement client and chrome.tabs.create.
 */
export function OptionsView({
  plan,
  status,
  manageBillingHref = "#",
  restoreResult,
  restoring,
  onRestore,
  onOpenPaywall,
  paywallOpen,
  onClosePaywall,
  onCheckout,
  plans,
}: OptionsViewProps) {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "48px auto",
        padding: 24,
        border: "1px solid #f0f0f0",
        borderRadius: 8,
      }}
    >
      <Title level={3}>Reference Extension — Settings</Title>

      <Divider orientation="left" plain>
        Your plan
      </Divider>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <PaymentNudge status={status} manageHref={manageBillingHref} />
        <PlanBadge plan={plan} status={status} />
        <Button type="primary" onClick={onOpenPaywall}>
          Upgrade
        </Button>
      </Space>

      <Divider orientation="left" plain>
        Restore purchase
      </Divider>
      <RestoreForm onRestore={onRestore} result={restoreResult} loading={restoring} />

      <UpgradePaywall
        open={paywallOpen}
        plans={plans}
        onCheckout={onCheckout}
        onClose={onClosePaywall}
      />
    </div>
  );
}
