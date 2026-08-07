// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Typography, Button, Space } from "antd";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph } = Typography;

/**
 * Soft, value-first Pro teaser. Restore is a DEEP-LINK into the extension's
 * options page (RestoreForm lives there with the deviceId) — the hosted welcome
 * page has no chrome.storage access, so it cannot restore directly.
 */
export function ProTeaser({ c }: { c: WelcomeContent }) {
  if (!c.pro.enabled) return null;
  return (
    <section data-testid="pro-teaser" style={{ textAlign: "center", padding: "48px 24px 72px" }}>
      <Title level={2}>Ready for more?</Title>
      <Paragraph type="secondary" style={{ maxWidth: 560, margin: "0 auto 24px" }}>{c.pro.blurb}</Paragraph>
      <Space wrap>
        <Button type="primary" size="large" href={c.pro.ctaHref} data-testid="pro-cta">{c.pro.ctaLabel}</Button>
        <Button size="large" href={c.pro.restoreHref} data-testid="restore-link">Already purchased? Restore</Button>
      </Space>
    </section>
  );
}
