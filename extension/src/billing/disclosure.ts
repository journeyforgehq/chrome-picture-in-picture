import { TERMS_URL, REFUNDS_URL } from "../legal-links";

/**
 * The FTC negative-option disclosure rendered directly beneath each paywall CTA
 * (passed to UpgradePaywall as a prop, so that component stays presentational).
 *
 * URLs come from legal-links.ts, NOT from `config.WELCOME_URL`. WELCOME_URL is
 * build-time env and is empty in this repo's .env.production, which would emit
 * href="" — a dead policy link right next to a purchase button. legal-links.ts
 * hardcodes the published Pages origin for exactly this reason.
 *
 * WORDING IS TIED TO THE LADDER THIS REPO ACTUALLY RENDERS, which is lifetime-only
 * (one-time, no renewal). If a recurring plan is ever added to the rendered plan
 * list, this text MUST also state the renewal period, the renewal amount, and how
 * to cancel — and a cancel path must exist to point at. Do not reuse this string
 * on a subscription ladder.
 */
export const PURCHASE_DISCLOSURE = {
  text: "One-time payment. By continuing you agree to the",
  termsUrl: TERMS_URL,
  refundsUrl: REFUNDS_URL,
};
