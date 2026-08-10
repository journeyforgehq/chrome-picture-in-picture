import React from "react";
import type { HeadFC } from "gatsby";
import { ThemeProvider } from "../ThemeProvider";
import { content } from "../content";
import { Hero } from "../sections/Hero";
import { PinNudge } from "../sections/PinNudge";
import { HowToUse } from "../sections/HowToUse";
import { KeyFeatures } from "../sections/KeyFeatures";
import { TrustStrip } from "../sections/TrustStrip";
// R-15, Option B. NOT from ../sections — that directory is CORE and cannot
// express a media asset. See the header block in SampleVideo.tsx for why this
// is rendered from this child-owned page slot rather than from content.ts.
import { SampleVideo } from "../child-sections/SampleVideo";
// CORE ProTeaser is deliberately NOT rendered. It draws
// `pro.restoreHref` as a button, and no value of that field can work: a hosted
// page cannot navigate to `chrome-extension://` without
// `web_accessible_resources`, which this manifest deliberately does not have.
// The replacement keeps every other capability — see its header for the
// itemised parity audit.
import { ProTeaserWithRestoreNote } from "../child-sections/ProTeaserWithRestoreNote";

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
        <ProTeaserWithRestoreNote c={content} />
      </main>
    </ThemeProvider>
  );
}

export const Head: HeadFC = () => <title>Welcome to {content.appName}</title>;
