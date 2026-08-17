/* ============================================================================
 * SampleVideo — R-15. THE ACTIVATION MOMENT, AND A LIVE SELF-TEST.
 * ============================================================================
 *
 * NOT a CORE file, and the directory name says so. `src/sections/` is vendored
 * from chrome-ext-factory and every file in it is hash-pinned in
 * `.factory.json`; this lives in a child-owned directory instead so nothing
 * here can read as drift.
 *
 * WHY IT IS RENDERED HERE AND NOT FROM `content.ts`
 * -------------------------------------------------
 * §3.6 decided the activation should be a real, playable <video> on this page:
 * the first pop-out then happens without navigating away, with the pin
 * instruction still in the same viewport. `WelcomeContent.tryNow` is typed
 * `{ label; href; note? }` and `Hero.tsx` renders it as an antd <Button
 * href=…>, so neither the type nor any section can express a media asset.
 * Both are CORE.
 *
 * R-15's recommendation was Option A — add an optional `tryNow.video` field to
 * the factory, bundled with the `sourceUrl` field already waiting on the same
 * bump. That remains the right long-term shape. It is NOT what this does,
 * deliberately: a factory change means bumping the factory and re-verifying
 * that every existing child still builds, which is a portfolio-wide operation
 * and must not ride along inside this build. So this takes Option B — render it
 * from `pages/index.tsx`, a child-owned slot — with the cost stated plainly:
 * the copy for this section lives here rather than in `content.ts` with the
 * rest of it. Recorded in the design package under R-15.
 *
 * THE ELEMENT IS AUTHORED AGAINST OUR OWN DETECTOR
 * ------------------------------------------------
 * This clip is a live self-test: if pop-out fails here, detection is broken and
 * we find out on day one instead of through reviews. Every attribute below is
 * one of `extension/src/pip/entry.ts`'s filter conditions, and
 * `test/sample-video.test.mjs` asserts each of them against this source AND
 * against the built HTML, so a future edit cannot quietly make our own
 * self-test undetectable:
 *
 *   readyState >= 2   preload="auto" — `metadata` alone leaves readyState at 1
 *                     (HAVE_METADATA) and the extension would answer "This
 *                     video hasn't loaded yet", on our own welcome page. 133 KB,
 *                     so preloading it costs nothing.
 *   rect >= 100x100   width:100% inside a max-width:720px box with
 *                     aspect-ratio 16/9 — 320x180 even on the narrowest phone.
 *   duration > 5      the clip is 12s (scripts/make-sample-clip.sh).
 *   not muted         NO `muted` attribute, ever. It would cost the +200 unmuted
 *                     bonus, and under R-14 a muted clip shorter than 65s takes
 *                     a -400 advert penalty — our own sample would be scored as
 *                     an advert. The audio track is silent, so nothing is lost.
 *   visible           no display:none / visibility:hidden / opacity <= 0.1.
 *
 * ACCESSIBILITY (§3.6's note): `controls` gives the native, fully
 * keyboard-operable player, and the WebVTT track ships captions. The clip has
 * no speech, so the cues describe what is on screen and what to do with it.
 * ==========================================================================*/
import React from "react";
import { Typography } from "antd";

const { Title, Paragraph } = Typography;

/** Served from `static/`, so these are site-absolute at every route. */
export const SAMPLE_CLIP_SRC = "/sample-clip.webm";
export const SAMPLE_CLIP_POSTER = "/sample-clip-poster.jpg";
export const SAMPLE_CLIP_CAPTIONS = "/sample-clip.vtt";

export function SampleVideo() {
  return (
    <section
      // `content.ts`'s tryNow.href is "#try-it" — the hero button now scrolls to
      // this clip instead of navigating to https://__DOMAIN__/sample-video, a
      // route that never existed. Renaming this id breaks that button.
      id="try-it"
      data-testid="sample-video"
      style={{ textAlign: "center", padding: "8px 24px 48px" }}
    >
      <Title level={2} style={{ marginBottom: 8 }}>
        Try it right here
      </Title>
      <Paragraph type="secondary" style={{ maxWidth: 560, margin: "0 auto 20px" }}>
        Press play, then click the extension icon in your toolbar. This clip pops into a
        floating window that stays above your other tabs and your other apps — no need to
        leave this page.
      </Paragraph>
      <video
        data-testid="sample-video-el"
        // Ordered to match the filter conditions in the header block above.
        controls
        preload="auto"
        playsInline
        loop
        poster={SAMPLE_CLIP_POSTER}
        src={SAMPLE_CLIP_SRC}
        // NO `muted`, NO `autoplay`. Chrome refuses gesture-free UNMUTED
        // autoplay anyway, and muting to buy autoplay would make our own sample
        // score as an advert (see the header block).
        style={{
          display: "block",
          width: "100%",
          maxWidth: 720,
          aspectRatio: "16 / 9",
          margin: "0 auto",
          borderRadius: 8,
          background: "#0b1220",
        }}
      >
        <track
          kind="captions"
          srcLang="en"
          label="English"
          src={SAMPLE_CLIP_CAPTIONS}
          default
        />
      </video>
    </section>
  );
}
