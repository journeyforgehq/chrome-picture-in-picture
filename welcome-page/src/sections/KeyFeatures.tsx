// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Typography, Row, Col, Card, Tag } from "antd";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph } = Typography;

export function KeyFeatures({ c }: { c: WelcomeContent }) {
  return (
    <section data-testid="key-features" style={{ background: "#fafafa", padding: "48px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <Title level={2} style={{ textAlign: "center" }}>What you can do</Title>
        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {c.features.map((f, i) => (
            <Col xs={24} sm={12} md={8} key={i}>
              <Card size="small" style={{ height: "100%" }} data-testid={`feature-${i}`}>
                <Title level={5} style={{ marginTop: 0 }}>
                  {f.title} {f.pro ? <Tag color="gold">Pro</Tag> : null}
                </Title>
                <Paragraph type="secondary" style={{ margin: 0 }}>{f.body}</Paragraph>
              </Card>
            </Col>
          ))}
        </Row>
      </div>
    </section>
  );
}
