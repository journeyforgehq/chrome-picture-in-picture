import React from "react";
import type { HeadFC } from "gatsby";
import { ThemeProvider } from "../ThemeProvider";
import { content } from "../content";
import { Hero } from "../sections/Hero";
import { PinNudge } from "../sections/PinNudge";
import { HowToUse } from "../sections/HowToUse";
import { KeyFeatures } from "../sections/KeyFeatures";
import { TrustStrip } from "../sections/TrustStrip";
import { ProTeaser } from "../sections/ProTeaser";

export default function WelcomePage() {
  return (
    <ThemeProvider accent={content.accent}>
      <main style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Hero c={content} />
        <PinNudge c={content} />
        <HowToUse c={content} />
        <KeyFeatures c={content} />
        <TrustStrip c={content} />
        <ProTeaser c={content} />
      </main>
    </ThemeProvider>
  );
}

export const Head: HeadFC = () => <title>Welcome to {content.appName}</title>;
