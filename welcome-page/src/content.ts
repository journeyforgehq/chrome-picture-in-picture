import type { WelcomeContent } from "./content-types";

/**
 * The welcome page exists to answer ONE question fast: "where did the extension
 * go?" Chrome hides freshly installed extensions behind the puzzle-piece icon,
 * and a user who cannot find it assumes the install failed and bounces back to
 * search. Store ranking is this product's only real growth channel, so the pin
 * nudge comes first, activation second, and everything else after.
 *
 * Copy rules baked in here (all measured — do not "improve" them into claims we
 * cannot keep):
 *  - Alt+P works while a BROWSER window has focus, not while the floating
 *    picture-in-picture window does. It is not a universal, works-from-any-app
 *    toggle, and it is never described as one.
 *  - There is no automatic pop-out. Chrome does not fire `autoPictureInPicture`
 *    on ordinary pages and does not allow gesture-free entry.
 *  - Embedded players need optional site access, requested at the moment the
 *    user turns it on. Videos on the page itself need nothing extra.
 *  - Some sites switch picture-in-picture off on their own players. Said
 *    plainly, without naming services.
 *
 * `__DOMAIN__` is a DELIBERATE placeholder. The submission checklist greps for
 * it; an obviously unfinished token is safer than a plausible-looking fake URL
 * that nobody notices is wrong. The domain is not chosen yet, so it stays.
 *
 * The EXTENSION-ID placeholder is GONE as of 2026-08-10, and NOT because it was
 * filled in — the link it sat in could never work at all. See `pro.restoreHref`
 * below. The ORG placeholder is resolved to `journeyforgehq`.
 *
 * NOTE FOR ANYONE EDITING THESE COMMENTS: `scripts/preflight.mjs` greps this
 * whole file for double-underscore-wrapped SHOUTING tokens, comments included.
 * Writing a resolved token here — even to explain that it is resolved — puts it
 * straight back into the preflight report, and a guard whose output nobody
 * trusts is the failure mode this project already hit once. (Writing the phrase
 * "double underscore" in the token style does it too; that was measured.) Name
 * them in prose instead.
 */
export const content: WelcomeContent = {
  appName: "Picture in Picture",
  logoSrc: "/icon-128.png",
  tagline:
    "Click the toolbar icon and the video you are watching floats above every tab and every app.",
  accent: "#1677ff",

  // TODO(plan 3): `sourceUrl` does not exist on WelcomeContent yet — adding the
  // field is a factory change scheduled for a later plan, and editing the
  // vendored core type here would be refused (or silently overwritten) by the
  // next `sync-core`. Kept commented so the intent survives the typecheck.
  // The org is resolved now, so this is the real URL waiting for the field.
  // sourceUrl: "https://github.com/journeyforgehq/picture-in-picture",

  /**
   * ACTIVATION — R-15, and the clip now EXISTS.
   *
   * The intended activation is a real, playable <video> ON THIS PAGE: the first
   * pop-out then happens with the pin instruction still in the same viewport,
   * and the clip doubles as a live self-test of our own detection filter
   * (longer than 5s, rendered larger than 100x100, unmuted-capable — see
   * extension/src/pip/entry.ts). If pop-out fails on our own welcome page,
   * detection is broken and we find out on day one instead of via reviews.
   *
   * `WelcomeContent` STILL cannot express it. `tryNow` is `{ label, href, note }`
   * and Hero.tsx renders it as an antd <Button href=...> — there is no field
   * for a media asset and no section that renders one, and both files are CORE.
   * So the clip is rendered from `src/pages/index.tsx`, a child-owned slot, by
   * `src/child-sections/SampleVideo.tsx`. Read that file's header for why this
   * takes R-15's Option B rather than its recommended Option A (an optional
   * `tryNow.video` field, which needs a factory bump and a portfolio-wide
   * re-verify, bundled with `sourceUrl`).
   *
   * `href` is therefore an IN-PAGE ANCHOR, not a route. It used to be
   * `https://__DOMAIN__/sample-video` — a page that never existed, on the
   * placeholder domain, kept visibly unfinished on purpose. It exists now, so
   * the stopgap is gone and the button scrolls to it. The anchor is
   * `#try-it` on SampleVideo's <section>; renaming that id breaks this button.
   */
  tryNow: {
    label: "Try it on a sample video",
    href: "#try-it",
    note: "Press play, then click the extension icon in your toolbar — the video pops into a floating window.",
  },

  // PRIORITY 1: where the extension went. Above the fold, before anything else.
  pinNudge: {
    enabled: true,
    text: "Chrome tucked the icon behind the puzzle-piece button in your toolbar. Click that puzzle piece, then the pin next to Picture in Picture. That icon is the whole feature — there is no popup to open.",
  },

  howToUse: {
    steps: [
      {
        title: "Play a video",
        body: "Open any page with a video and start it playing. Videos on the page itself work straight away, with no extra permission.",
      },
      {
        title: "Click the toolbar icon",
        body: "The largest playing video pops into a floating window that stays on top of your other tabs and your other apps. Alt+P does the same thing while a Chrome window has focus.",
      },
      {
        title: "Send it back",
        body: "Press Alt+P again while a Chrome window is focused, or use the close button on the floating window itself. Once you click the floating window, that window has focus and its own close button takes over.",
      },
    ],
    whereToFind:
      "The toolbar icon — pin it using the tip above. There is no popup and no menu: clicking the icon is the feature. The keyboard shortcut is Alt+P, and it works while a Chrome window has focus.",
  },

  features: [
    {
      title: "One click, any page",
      body: "The extension picks the largest playing video on the tab and hands it to Chrome's floating window, which sits above your other tabs and above your other apps. Nothing to configure, no site list to maintain.",
    },
    {
      title: "Alt+P",
      body: "The keyboard shortcut does exactly what the icon does, while a Chrome window has focus. It is not a shortcut you can fire from another app — Chrome only routes it to the browser.",
    },
    {
      title: "Nothing pops out on its own",
      body: "Chrome only allows picture-in-picture after you ask for it, so there is no automatic pop-out and no surprise floating window while you browse.",
    },
    {
      title: "Embedded players, only if you allow it",
      body: "A video inside an embedded player needs access to that site. The extension asks for it at the moment you switch it on, and you can take it back at any time.",
    },
    {
      title: "When a site says no",
      body: "Some sites switch picture-in-picture off on their own players. Chrome enforces that and we do not work around it — you get a plain message instead of a button that silently does nothing.",
    },
    {
      title: "The enhanced window",
      body: "Pro remembers the exact window size you like per site, puts playback controls inside the floating window, and keeps subtitles visible. Coming later — the one-click pop-out stays free.",
      pro: true,
    },
  ],

  permissions: [
    {
      name: "storage",
      why: "Remembers your preferences on this device. It holds settings, not history — there is no record of which pages or videos you used it on.",
    },
    {
      name: "activeTab",
      why: "Gives the extension access to the one tab you clicked on, at the moment you click, and nothing before or after. It grants no standing access to any site.",
    },
    {
      name: "scripting",
      why: "Runs the short piece of code that finds the video on that tab and hands it to Chrome. It runs only on the tab you clicked, only when you click.",
    },
    {
      name: "site access (optional)",
      why: "Needed only for videos inside embedded players. Chrome asks you at the moment you turn it on, you choose which sites, and you can revoke it whenever you like. Videos on the page itself never need it.",
    },
  ],

  /**
   * R-06. The extension itself genuinely collects nothing, which is what the
   * store's data declaration covers. This hosted page counts page hits in
   * aggregate — cookieless, no fingerprinting, no per-user identifier — and
   * that must be DISCLOSED here rather than left to be discovered. A user who
   * reads a blanket we-measure-nothing claim and then finds a counter on our
   * own site has caught us in exactly the thing we claim to be better than.
   *
   * test/disclosure.test.mjs pins the sentence below and fails on any blanket
   * we-measure-nothing claim. Change the wording in both places or CI stops
   * you.
   */
  privacyNote:
    "The extension requests no network permission at all, so it cannot read, redirect or rewrite the pages you visit, and nothing about your browsing leaves your computer. This welcome page counts page hits in aggregate, without cookies, fingerprinting or any per-user identifier.",

  pro: {
    enabled: true,
    blurb:
      "Popping a video out is free and stays free. Pro is the enhanced window — your preferred size remembered per site, playback controls inside the floating window, and subtitles that stay visible. One payment of $9.99, no subscription.",
    ctaLabel: "See what Pro adds",
    // Ordinary https, on the placeholder domain. Checked for the restoreHref
    // defect below and it does NOT have it: the scheme is navigable from a
    // hosted page, so this link works the moment __DOMAIN__ is filled in.
    ctaHref: "https://__DOMAIN__/pro",
    /**
     * DEAD FIELD, AND NOT BECAUSE THE ID IS MISSING.
     *
     * This was a `chrome-extension://<extension id>/options.html` deep link,
     * with the id left as a placeholder and recorded as "substitute before
     * submission". Substituting it would produce a link that STILL DOES
     * NOTHING: a hosted
     * web page cannot navigate to a `chrome-extension://` URL unless the target
     * is listed in `web_accessible_resources` with matching origins, and this
     * manifest deliberately has none (fewer exposed resources = less
     * extension-fingerprinting surface — see
     * extension/src/static/manifest.json). Same class of bug as the dead
     * `chrome://extensions/shortcuts` anchor already fixed in the options page.
     *
     * `WelcomeContent` cannot express "instructions instead of a link": the
     * field is a REQUIRED string and CORE `sections/ProTeaser.tsx` renders it
     * unconditionally as a button. Both files are CORE. So the affordance that
     * actually works — plain instructions to open Options from the toolbar icon
     * — is rendered by `src/child-sections/ProTeaserWithRestoreNote.tsx` from
     * `pages/index.tsx`, and CORE `ProTeaser` is not mounted. Read that
     * component's header for the itemised parity audit.
     *
     * Empty rather than a plausible URL: nothing reads this, and if something
     * ever does, an empty href is visibly broken instead of quietly inert.
     * This also drops the extension-id placeholder out of the preflight report,
     * which is DELIBERATE and is not the guard going blind: the token was never
     * "still to be filled in", because there was nothing to fill it with.
     * test/restore-affordance.test.mjs holds the line instead, and it asks a
     * better question — "does this page ship a chrome-extension:// link at all".
     */
    restoreHref: "",
  },

  uninstall: {
    // Paste the Google Form embed URL here (Send → <> → "embedded=true").
    // Empty ships the email fallback until the form exists.
    formEmbedUrl: "",
    supportEmail: "support@__DOMAIN__",
    heading: "Sorry to see you go",
    subhead:
      "One question, and it genuinely decides what we fix next: what made you remove it? If a video would not pop out, telling us which kind of page it was on is the most useful thing you can send.",
    // formVersionEntryId: "entry.123456789", // optional: prefill the version field
  },
};
