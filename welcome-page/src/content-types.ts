// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
/** All per-app welcome copy lives in a single slot (src/content.ts) typed by this. */
export interface WelcomeContent {
  appName: string;
  logoSrc: string;
  tagline: string;
  accent: string;
  /** The activation path — the ONE thing a new user should do first. */
  tryNow: { label: string; href: string; note?: string };
  /** Pin nudge; disable if the app relies on Chrome's auto-pin. */
  pinNudge: { enabled: boolean; text: string };
  howToUse: { steps: { title: string; body: string }[]; whereToFind: string };
  features: { title: string; body: string; pro?: boolean }[];
  /** Permissions trust strip — explain WHY each permission is requested. */
  permissions: { name: string; why: string }[];
  privacyNote: string;
  /** Soft, value-first Pro teaser; restoreHref deep-links INTO the extension options (has deviceId). */
  pro: { enabled: boolean; blurb: string; ctaLabel: string; ctaHref: string; restoreHref: string };
  /**
   * Post-uninstall feedback page (served at /uninstall on this same domain and
   * registered via chrome.runtime.setUninstallURL). Keep it dead simple — a
   * single question converts best (~5–15% of removers respond).
   */
  uninstall: {
    /**
     * Google Form "embedded" URL, e.g.
     * https://docs.google.com/forms/d/e/FORM_ID/viewform?embedded=true
     * Empty string → the page shows the email fallback instead of an embed.
     */
    formEmbedUrl: string;
    /** Fallback contact when no form is configured (and shown as a quiet secondary option). */
    supportEmail: string;
    /** Short heading + subcopy. Shorter = higher response rate. */
    heading: string;
    subhead: string;
    /**
     * OPTIONAL Google Form field id for prefilling the extension version from the
     * `?v=` param the service worker appends (find it via the form's "Get
     * pre-filled link" flow — it looks like `entry.123456789`). Empty → no prefill.
     */
    formVersionEntryId?: string;
  };
}
