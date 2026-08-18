import React from "react";
import type { HeadFC } from "gatsby";
import { ThemeProvider } from "../ThemeProvider";
import { content } from "../content";
import { legalContent } from "../legal-content";
import { LegalPage } from "../sections/LegalPage";

/**
 * Standalone Refund Policy page. Stripe and the card networks expect this to
 * be reachable and readable independent of the extension itself.
 */
export default function RefundsPage() {
  return (
    <ThemeProvider accent={content.accent}>
      {/* Pin a light surface: this page is often opened directly (Stripe review,
          a linked footer, a support email) in whatever color scheme the visitor's
          browser prefers, and the copy must stay readable in both. */}
      <main
        style={{
          colorScheme: "light",
          background: "#ffffff",
          color: "rgba(0,0,0,0.88)",
          minHeight: "100vh",
        }}
      >
        <LegalPage
          title="Refund Policy"
          updated={legalContent.updated}
          summary={legalContent.refunds.summary}
          sections={legalContent.refunds.sections}
          supportEmail={legalContent.supportEmail}
        />
      </main>
    </ThemeProvider>
  );
}

export const Head: HeadFC = () => (
  <>
    <title>Refund Policy — {content.appName}</title>
    <meta name="robots" content="index,follow" />
  </>
);
