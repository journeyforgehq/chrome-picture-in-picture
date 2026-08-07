// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Typography, Button, Space } from "antd";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph } = Typography;

export function Hero({ c }: { c: WelcomeContent }) {
  return (
    <section data-testid="hero" style={{ textAlign: "center", padding: "64px 24px 32px" }}>
      <img src={c.logoSrc} alt={`${c.appName} logo`} width={72} height={72} style={{ maxWidth: "100%" }} />
      <Title level={1} style={{ marginTop: 16 }}>{c.appName}</Title>
      <Paragraph type="secondary" style={{ fontSize: 18, maxWidth: 560, margin: "0 auto 24px" }}>
        {c.tagline}
      </Paragraph>
      <Space direction="vertical" size="small">
        <Button type="primary" size="large" href={c.tryNow.href} data-testid="try-now">
          {c.tryNow.label}
        </Button>
        {c.tryNow.note ? <Paragraph type="secondary" style={{ margin: 0 }}>{c.tryNow.note}</Paragraph> : null}
      </Space>
    </section>
  );
}
