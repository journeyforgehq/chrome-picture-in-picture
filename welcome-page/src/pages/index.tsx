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
// R-15, Option B. NOT from ../sections — that directory is CORE and cannot
// express a media asset. See the header block in SampleVideo.tsx for why this
// is rendered from this child-owned page slot rather than from content.ts.
import { SampleVideo } from "../child-sections/SampleVideo";

export default function WelcomePage() {
  return (
    <ThemeProvider accent={content.accent}>
      <main style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Hero c={content} />
        <PinNudge c={content} />
        {/* Directly under the pin nudge ON PURPOSE: the whole point of an
            on-page clip is that the first pop-out happens with the "where did
            the icon go" instruction still in the same viewport. */}
        <SampleVideo />
        <HowToUse c={content} />
        <KeyFeatures c={content} />
        <TrustStrip c={content} />
        <ProTeaser c={content} />
      </main>
    </ThemeProvider>
  );
}

export const Head: HeadFC = () => <title>Welcome to {content.appName}</title>;
