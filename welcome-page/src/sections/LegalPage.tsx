import React from "react";
import { Typography, List } from "antd";
import type { PolicySection } from "../content-types";

const { Title, Paragraph } = Typography;

/**
 * Shared layout for standalone legal-policy pages (terms, refunds). Renders
 * one policy document: a title, a "last updated" line, a summary, then each
 * section as a heading + paragraphs + bullets, and a footer exposing a
 * support mailto link. Content is passed in by the two thin page routes so
 * this file — a CORE file — never needs to change per app.
 */
export function LegalPage({
  title,
  updated,
  summary,
  sections,
  supportEmail,
}: {
  title: string;
  updated: string;
  summary: string;
  sections: PolicySection[];
  supportEmail: string;
}) {
  return (
    <article data-testid="legal-page" style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
      <Title level={1}>{title}</Title>
      <Paragraph type="secondary" data-testid="legal-updated">
        Last updated: {updated}
      </Paragraph>
      <Paragraph data-testid="legal-summary">{summary}</Paragraph>

      {sections.map((section) => (
        <section key={section.heading} data-testid="legal-section">
          <Title level={2}>{section.heading}</Title>
          {section.paragraphs?.map((p, i) => (
            <Paragraph key={i}>{p}</Paragraph>
          ))}
          {section.bullets && section.bullets.length > 0 ? (
            <List
              size="small"
              dataSource={section.bullets}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          ) : null}
        </section>
      ))}

      <Paragraph type="secondary" style={{ marginTop: 40, fontSize: 13 }} data-testid="legal-footer">
        Questions? Email{" "}
        <a href={`mailto:${supportEmail}`} data-testid="legal-support-email">
          {supportEmail}
        </a>
        .
      </Paragraph>
    </article>
  );
}
