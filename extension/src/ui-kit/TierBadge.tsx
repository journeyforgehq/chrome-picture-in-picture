// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Tag } from "antd";
import type { Tier } from "../contract";

export interface TierBadgeProps {
  tier: Tier;
}

/** Free/pro pill from the cached tier (spec §11A). */
export function TierBadge({ tier }: TierBadgeProps) {
  if (tier === "pro") {
    return <Tag color="success">Pro</Tag>;
  }
  return <Tag>Free</Tag>;
}
