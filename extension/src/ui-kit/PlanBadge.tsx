// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Tag, Space } from "antd";
import type { Plan, PaidStatus } from "../contract";

export interface PlanBadgeProps {
  plan?: Plan;
  status?: PaidStatus;
}

const PLAN_LABEL: Record<Plan, string> = {
  monthly: "Monthly",
  annual: "Annual",
  lifetime: "Lifetime",
};

const STATUS_COLOR: Record<PaidStatus, "success" | "warning" | "default"> = {
  active: "success",
  inactive: "default",
  canceled: "warning",
  past_due: "warning",
};

const STATUS_LABEL: Record<PaidStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  canceled: "Canceled",
  past_due: "Past due",
};

/** Plan display for options/popup (spec §11A: PlanBadge / PlanRow). */
export function PlanBadge({ plan, status }: PlanBadgeProps) {
  if (!plan) {
    return <Tag>No plan</Tag>;
  }
  return (
    <Space size={4}>
      <Tag>{PLAN_LABEL[plan]}</Tag>
      {status && <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>}
    </Space>
  );
}
