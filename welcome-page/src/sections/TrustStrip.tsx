// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Typography, List } from "antd";
import { SafetyOutlined } from "@ant-design/icons";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph, Text } = Typography;

export function TrustStrip({ c }: { c: WelcomeContent }) {
  return (
    <section data-testid="trust-strip" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <Title level={2}><SafetyOutlined /> Your privacy &amp; permissions</Title>
      <Paragraph type="secondary">{c.privacyNote}</Paragraph>
      <List
        dataSource={c.permissions}
        renderItem={(p) => (
          <List.Item>
            <List.Item.Meta title={<Text code>{p.name}</Text>} description={p.why} />
          </List.Item>
        )}
      />
    </section>
  );
}
