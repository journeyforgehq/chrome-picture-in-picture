// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Typography, Steps, Divider } from "antd";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph } = Typography;

export function HowToUse({ c }: { c: WelcomeContent }) {
  return (
    <section data-testid="how-to-use" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      <Title level={2}>Get started in seconds</Title>
      <Steps
        direction="vertical"
        current={-1}
        items={c.howToUse.steps.map((s) => ({ title: s.title, description: s.body }))}
      />
      <Divider />
      <Paragraph type="secondary"><strong>Where to find it:</strong> {c.howToUse.whereToFind}</Paragraph>
    </section>
  );
}
