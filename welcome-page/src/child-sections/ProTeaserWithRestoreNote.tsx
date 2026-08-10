/* ============================================================================
 * ProTeaserWithRestoreNote — CORE ProTeaser, minus one architecturally DEAD
 * link, plus the instructions that replace it.
 * ============================================================================
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `WelcomeContent.pro.restoreHref` is documented as a deep link "INTO the
 * extension options (has deviceId)", and `content.ts` carried
 * `chrome-extension://__EXT_ID__/options.html`. That link CANNOT WORK, and
 * filling in the real extension id would not fix it:
 *
 *   A hosted web page cannot navigate to a `chrome-extension://` URL unless the
 *   target resource is listed in the extension's `web_accessible_resources`
 *   with matching origins. This manifest deliberately has NONE — see
 *   `extension/src/static/manifest.json`, `_comment_no_web_accessible_resources`:
 *   fewer exposed resources means less extension-fingerprinting surface, and
 *   the toast's shadow root means no stylesheet ever needs exposing.
 *
 * So the id is not the missing piece. Substituting it would produce a link that
 * still does nothing, and it would look finished while doing it. Same class of
 * bug as the dead `chrome://extensions/shortcuts` anchor already fixed in the
 * options page (`OptionsView.tsx` — it is a <button> calling `chrome.tabs.create`
 * for exactly this reason, and a hosted page has no such escape hatch).
 *
 * WHY THIS IS A WHOLE COMPONENT AND NOT A CONTENT CHANGE
 * -----------------------------------------------------
 * `WelcomeContent` CANNOT express "instructions instead of a link".
 * `pro.restoreHref` is typed `string` and REQUIRED, and CORE `ProTeaser`
 * renders it unconditionally as `<Button href={...}>Already purchased?
 * Restore</Button>`. There is no empty-string branch, no optional variant, and
 * both `content-types.ts` and `sections/ProTeaser.tsx` are CORE. Reported
 * upward rather than forced through the type.
 *
 * So the substitution happens in `pages/index.tsx`, the same child-owned slot
 * R-15 uses, and this component is a deliberate, itemised replacement of CORE
 * `ProTeaser` — not a redesign.
 *
 * PARITY AUDIT against src/sections/ProTeaser.tsx, read from its source:
 *
 *   1. `if (!c.pro.enabled) return null`            KEPT, identical
 *   2. <section data-testid="pro-teaser"> + styles  KEPT, identical
 *   3. <Title level={2}>Ready for more?</Title>     KEPT, identical
 *   4. blurb <Paragraph> + styles                   KEPT, identical
 *   5. primary CTA -> c.pro.ctaHref,
 *      data-testid="pro-cta"                        KEPT, identical
 *   6. secondary "Already purchased? Restore"
 *      -> c.pro.restoreHref,
 *      data-testid="restore-link"                   **DROPPED** — the dead link
 *
 *   ADDED: `data-testid="restore-instructions"`, plain text telling the user
 *   where the restore form actually lives. No new capability beyond replacing
 *   what (6) pretended to offer.
 *
 * `c.pro.ctaHref` was checked for the same defect and does NOT have it: it is
 * `https://__DOMAIN__/pro`, an ordinary https URL. `__DOMAIN__` is unresolved
 * because the domain is not chosen yet — preflight catches it, which is the
 * guard working — but the link's SCHEME is navigable from a hosted page, so it
 * will work as soon as the token is filled. Nothing to fix here.
 * ==========================================================================*/
import React from "react";
import { Typography, Button, Space } from "antd";
import type { WelcomeContent } from "../content-types";

const { Title, Paragraph } = Typography;

export function ProTeaserWithRestoreNote({ c }: { c: WelcomeContent }) {
  if (!c.pro.enabled) return null;
  return (
    <section data-testid="pro-teaser" style={{ textAlign: "center", padding: "48px 24px 72px" }}>
      <Title level={2}>Ready for more?</Title>
      <Paragraph type="secondary" style={{ maxWidth: 560, margin: "0 auto 24px" }}>
        {c.pro.blurb}
      </Paragraph>
      <Space wrap>
        <Button type="primary" size="large" href={c.pro.ctaHref} data-testid="pro-cta">
          {c.pro.ctaLabel}
        </Button>
      </Space>
      {/* What replaces the dead button. Instructions, not a link: this page
          cannot open the extension's options, and no URL it could render
          would. The route named here is the one that genuinely works from a
          browser with the extension installed. */}
      <Paragraph
        type="secondary"
        data-testid="restore-instructions"
        style={{ maxWidth: 560, margin: "20px auto 0", fontSize: 14 }}
      >
        Already purchased? Right-click the Picture in Picture icon in your toolbar and choose
        Options, then use the restore form there. This page cannot open it for you — restoring
        needs the device id that only the extension holds.
      </Paragraph>
    </section>
  );
}
