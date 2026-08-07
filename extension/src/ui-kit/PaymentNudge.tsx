// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Alert } from "antd";
import type { PaidStatus } from "../contract";

/** Shown only when a subscription is past_due — the paid period is still active
 *  (backend keeps Pro until periodEnd) but the last renewal charge failed. */
export function PaymentNudge({ status, manageHref }: { status?: PaidStatus; manageHref: string }) {
  if (status !== "past_due") return null;
  return (
    <Alert
      type="warning"
      showIcon
      message="Payment issue"
      description={
        <span>
          Your last payment didn't go through.{" "}
          <a href={manageHref} target="_blank" rel="noreferrer">Update payment method</a> to keep Pro.
        </span>
      }
    />
  );
}
