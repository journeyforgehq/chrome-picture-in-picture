// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Button, Space } from "antd";
import { LockOutlined } from "@ant-design/icons";

export interface LockedFeatureProps {
  locked: boolean;
  onUnlock: () => void;
  children: React.ReactNode;
}

/**
 * Wraps a pro feature. When locked, the children are wrapped in a disabled
 * <fieldset> (so any interactive descendants become genuinely non-interactive,
 * not just visually dimmed) and an "Unlock" affordance with a lock icon is
 * shown; clicking it calls onUnlock (the caller wires this to open
 * UpgradePaywall). When unlocked, children render as-is (spec §11A).
 */
export function LockedFeature({ locked, onUnlock, children }: LockedFeatureProps) {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className="ui-kit-locked-feature" style={{ position: "relative" }}>
      <fieldset
        disabled
        style={{ border: "none", padding: 0, margin: 0, opacity: 0.5 }}
      >
        {children}
      </fieldset>
      <div
        className="ui-kit-locked-feature-overlay"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.6)",
        }}
      >
        <Space>
          <Button type="primary" icon={<LockOutlined />} onClick={onUnlock}>
            Unlock
          </Button>
        </Space>
      </div>
    </div>
  );
}
