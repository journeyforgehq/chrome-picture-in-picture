import type { WelcomeContent } from "./content-types";

export const content: WelcomeContent = {
  appName: "Hello Gated",
  logoSrc: "/icon-128.png",
  tagline: "The reference extension for the factory — one free tool, one Pro tool, real billing.",
  accent: "#1677ff",
  tryNow: {
    label: "Try it now",
    href: "https://example.com/demo",
    note: "Click the pinned icon, then run the Uppercase tool.",
  },
  pinNudge: {
    enabled: true,
    text: "Click the puzzle icon in Chrome's toolbar, then the pin next to Hello Gated.",
  },
  howToUse: {
    steps: [
      { title: "Open the popup", body: "Click the Hello Gated icon in your toolbar." },
      { title: "Run the free tool", body: "Type text and hit Uppercase — that's your first result." },
      { title: "Unlock Pro", body: "The Reverse tool is Pro; upgrade any time." },
    ],
    whereToFind: "The toolbar icon (pin it above) and the right-click context menu.",
  },
  features: [
    { title: "Uppercase", body: "Transform any text instantly. Always free." },
    { title: "Reverse text", body: "Reverse strings in one click.", pro: true },
    { title: "Sync across devices", body: "Your Pro status follows your Chrome profile." },
  ],
  permissions: [
    { name: "storage", why: "Remembers your settings and Pro status on this device." },
    { name: "activeTab", why: "Runs the tool only on the tab you click — never your whole history." },
  ],
  privacyNote: "Your text is processed locally. We never sell data or show ads.",
  pro: {
    enabled: true,
    blurb: "Pro unlocks every tool and higher limits. One purchase, all your devices.",
    ctaLabel: "See Pro",
    ctaHref: "https://example.com/pricing",
    restoreHref: "chrome-extension://REPLACE_WITH_EXTENSION_ID/options.html",
  },
  uninstall: {
    // Paste your Google Form's embed URL here (Send → <> → "embedded=true").
    // Leave empty to ship the email fallback until the form is ready.
    formEmbedUrl: "",
    supportEmail: "feedback@example.com",
    heading: "Sorry to see you go",
    subhead:
      "Mind telling us why you uninstalled? One quick answer — it genuinely decides what we fix next.",
    // formVersionEntryId: "entry.123456789", // optional: prefill the version field
  },
};
