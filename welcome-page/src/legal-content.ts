// ---------------------------------------------------------------------------
// ⚠️  THE 14-DAY REFUND WINDOW BELOW IS A PROMISE — TO CUSTOMERS AND TO STRIPE.
//
// Stripe and the card networks read this page during account review, and a
// customer can quote it back to you (or to their bank, in a dispute) at any
// time. If your actual refund handling can't honor "14 days, no questions
// asked", do not ship this copy unedited. A stated policy you don't follow is
// worse than no policy at all: it turns a refund request into a chargeback.
//
// The paywall subtitle in extension/src/options/OptionsView.tsx quotes this
// same 14-day window. If you change it here, change it there too.
// ---------------------------------------------------------------------------
import type { LegalContent } from "./content-types";
import { content } from "./content";

/**
 * ⚠️ PLACEHOLDER — the statement descriptor on the customer's card.
 *
 * This is NOT verified against the real Stripe account descriptor. Set it to
 * the exact string Stripe shows under Settings → Public details → Statement
 * descriptor (max 22 chars), then this one constant corrects every mention on
 * both policy pages.
 */
const MERCHANT_NAME = "PICTURE IN PICTURE";

/** The one-time price. Mirrors extension/src/billing/plans.ts (this child's
 *  deliberate lifetime-only drift, which options.tsx imports and renders) and
 *  the Pro blurb in content.ts. Keep all three in step. */
const PRICE = "$9.99";

export const legalContent: LegalContent = {
  updated: "17 August 2026",
  // Same address used on the post-uninstall page; keep support contact points consistent.
  supportEmail: content.uninstall.supportEmail,
  merchantName: MERCHANT_NAME,

  terms: {
    summary:
      `These terms govern your purchase and use of ${content.appName}, a Chrome extension that pops the video ` +
      `you are watching into a floating window. By installing, purchasing, or using the extension you agree to them.`,
    sections: [
      {
        heading: "What you're buying",
        paragraphs: [
          `Popping a video out is free and stays free. A single ${PRICE} purchase unlocks the enhanced window — ` +
            `your preferred size remembered per site, playback controls inside the floating window, and ` +
            `subtitles that stay visible.`,
          `This is a one-time purchase — there is no subscription and nothing auto-renews. You pay once and the ` +
            `unlock is yours, including future updates. Your purchase grants you a licence to use ` +
            `${content.appName}; it does not transfer ownership of the software, its source code, or any ` +
            `intellectual property in it.`,
        ],
      },
      {
        heading: "What the extension can and cannot do",
        paragraphs: [
          "Picture-in-picture is a Chrome feature; this extension asks Chrome for it. Chrome only allows a " +
            "floating window after you ask for one, so nothing pops out on its own.",
          "Some sites switch picture-in-picture off on their own players. Chrome enforces that and we do not " +
            "work around it — you get a plain message instead of a button that silently does nothing. Buying " +
            "the enhanced window does not change this, because the limit is not ours to lift.",
        ],
      },
      {
        heading: "Licence scope",
        bullets: [
          "Personal or business use, on devices you control.",
          "You can restore your purchase on another device by verifying the email you paid with.",
          "You may not resell, sublicense, or redistribute the software.",
          "You may not circumvent, disable, or reverse engineer the licensing or paywall logic.",
        ],
      },
      {
        heading: "Payment processing",
        paragraphs: [
          "Payments are processed by Stripe. We never see or store your full card number. Your card statement " +
            `will show the charge under the name "${MERCHANT_NAME}".`,
        ],
      },
      {
        heading: "Availability and changes",
        paragraphs: [
          "We may update, change, or discontinue features over time, including in response to changes required " +
            "by the Chrome Web Store or by our payment processor. We'll try to give notice of changes that " +
            "materially reduce what a paid licence unlocks.",
        ],
      },
      {
        heading: "Limitation of liability",
        paragraphs: [
          "To the extent permitted by law, our total liability to you for any claim relating to the software or " +
            "your purchase is capped at the amount you actually paid us.",
        ],
      },
    ],
  },

  refunds: {
    summary:
      "We want you to feel good about paying for this. If it's not working out, here's exactly how refunds work.",
    sections: [
      {
        heading: "14-day refund window",
        paragraphs: [
          "If you're not happy with your purchase, email us within 14 days of the charge and we'll refund it in " +
            "full — no questions asked.",
        ],
      },
      {
        heading: "If a site you wanted blocks picture-in-picture",
        paragraphs: [
          "Some players switch the feature off and Chrome enforces that, so no extension can pop them out. If " +
            "you bought the enhanced window and then found your main site is one of those, that's a refund — " +
            "just tell us.",
        ],
      },
      {
        heading: "How to request a refund",
        paragraphs: [
          `Email ${content.uninstall.supportEmail} with the address you paid with (and your order/receipt id if ` +
            "you have it). That's all we need to look up the charge.",
        ],
      },
      {
        heading: "Processing time",
        paragraphs: [
          "We process refund requests within 2 business days. Once we issue the refund, your bank or card issuer " +
            "typically takes 5-10 business days to post it back to your statement — that part is outside our " +
            "control.",
        ],
      },
      {
        heading: "What happens to your Pro access",
        paragraphs: [
          "A refund turns off Pro on every device linked to your purchase. Popping videos out keeps working as " +
            "before — you just lose the enhanced-window features you were refunded for.",
        ],
      },
      {
        heading: "Before you dispute a charge",
        paragraphs: [
          `Please email us before filing a chargeback with your bank. Disputes marked "${MERCHANT_NAME}" on ` +
            "your statement are almost always us — and a direct refund request is faster for you than a bank " +
            "dispute, which can take weeks and doesn't guarantee the outcome you want.",
        ],
      },
    ],
  },
};
