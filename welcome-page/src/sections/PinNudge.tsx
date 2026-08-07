// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Alert } from "antd";
import { PushpinOutlined } from "@ant-design/icons";
import type { WelcomeContent } from "../content-types";

export function PinNudge({ c }: { c: WelcomeContent }) {
  if (!c.pinNudge.enabled) return null; // apps relying on Chrome's auto-pin can disable it
  return (
    <section data-testid="pin-nudge" style={{ maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
      <Alert
        type="info"
        showIcon
        icon={<PushpinOutlined />}
        message="Pin it so it's always one click away"
        description={c.pinNudge.text}
        closable
      />
    </section>
  );
}
