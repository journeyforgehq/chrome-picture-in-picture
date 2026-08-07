// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { Typography, Result, Button } from "antd";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph } = Typography;

/**
 * Build the iframe src for the embedded Google Form, optionally prefilling the
 * extension version the service worker appended to the page URL as `?v=`.
 * Kept pure + exported so the wiring is unit-checkable without a DOM.
 */
export function formSrc(embedUrl: string, versionEntryId: string | undefined, version: string): string {
  if (!embedUrl || !versionEntryId || !version) return embedUrl;
  const sep = embedUrl.includes("?") ? "&" : "?";
  return `${embedUrl}${sep}${encodeURIComponent(versionEntryId)}=${encodeURIComponent(version)}`;
}

/** Read `?v=` from a location.search string (SSR-safe: pass "" during build). */
export function versionFromSearch(search: string): string {
  try {
    return new URLSearchParams(search).get("v") ?? "";
  } catch {
    return "";
  }
}

export function UninstallForm({ c, search = "" }: { c: WelcomeContent; search?: string }) {
  const u = c.uninstall;
  const version = versionFromSearch(search);
  const src = formSrc(u.formEmbedUrl, u.formVersionEntryId, version);

  return (
    <section
      data-testid="uninstall"
      style={{ maxWidth: 640, margin: "0 auto", padding: "56px 24px", textAlign: "center" }}
    >
      <img src={c.logoSrc} alt={`${c.appName} logo`} width={56} height={56} style={{ maxWidth: "100%" }} />
      <Title level={2} style={{ marginTop: 16 }}>
        {u.heading}
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 16, maxWidth: 520, margin: "0 auto 28px" }}>
        {u.subhead}
      </Paragraph>

      {u.formEmbedUrl ? (
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          <iframe
            data-testid="uninstall-form"
            title="Uninstall feedback"
            src={src}
            width="100%"
            height={620}
            style={{ display: "block", border: 0 }}
          >
            Loading the form…
          </iframe>
        </div>
      ) : (
        <Result
          data-testid="uninstall-fallback"
          status="info"
          title="Tell us in one line"
          subTitle={`Reply to ${c.uninstall.supportEmail} with what made you uninstall — even a few words help.`}
          extra={
            <Button
              type="primary"
              href={`mailto:${c.uninstall.supportEmail}?subject=${encodeURIComponent(
                `Why I uninstalled ${c.appName}`
              )}`}
              data-testid="uninstall-mailto"
            >
              Email your feedback
            </Button>
          }
        />
      )}

      <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 24 }}>
        No account or personal data required — this is anonymous. Thanks for trying {c.appName}.
      </Paragraph>
    </section>
  );
}
