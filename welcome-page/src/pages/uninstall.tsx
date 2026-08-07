import React from "react";
import type { HeadFC, PageProps } from "gatsby";
import { ThemeProvider } from "../ThemeProvider";
import { content } from "../content";
import { UninstallForm } from "../sections/UninstallForm";

/**
 * Post-uninstall feedback page. Chrome opens this (via
 * chrome.runtime.setUninstallURL → config.UNINSTALL_URL) the moment the user
 * removes the extension. `location.search` carries the `?v=<version>` the
 * service worker appended, used to prefill the form's version field when
 * `content.uninstall.formVersionEntryId` is set.
 */
export default function UninstallPage({ location }: PageProps) {
  return (
    <ThemeProvider accent={content.accent}>
      {/* Pin a light surface: Chrome opens this page in whatever color scheme the
          user's browser prefers, and the form/copy must stay readable in both. */}
      <main
        style={{
          colorScheme: "light",
          background: "#ffffff",
          color: "rgba(0,0,0,0.88)",
          minHeight: "100vh",
        }}
      >
        <div style={{ maxWidth: 1120, margin: "0 auto" }}>
          <UninstallForm c={content} search={location?.search ?? ""} />
        </div>
      </main>
    </ThemeProvider>
  );
}

export const Head: HeadFC = () => (
  <>
    <title>Before you go — {content.appName}</title>
    <meta name="robots" content="noindex" />
  </>
);
