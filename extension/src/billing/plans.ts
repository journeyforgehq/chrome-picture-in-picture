// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { PaywallPlan } from "../ui-kit";

/**
 * The displayed paywall plans — the SINGLE source (imported by popup + options).
 * Keep `price`/`priceNote` in sync with your Stripe prices. The `id` maps to a
 * STRIPE_LINKS[id] checkout URL (see billing/config.ts). Rendered as plan cards
 * (see ui-kit/UpgradePaywall) — `description` + `features` are the upsell content.
 *
 * PRICING RULE (enforced by test/plans.test.ts): keep the ladder non-dominated.
 * If you lower `lifetime`, it must stay ABOVE a year of `annual` — otherwise the
 * annual plan is strictly dominated (nobody renews yearly when one payment costs
 * the same or less). Dropping to a single plan is fine; a broken ladder is not.
 */
export const PLANS: PaywallPlan[] = [
  {
    id: "monthly",
    label: "Monthly",
    price: "$3.99",
    unit: "/mo",
    priceNote: "Billed monthly",
    description: "Full Pro access, month to month.",
    features: ["Every Pro tool", "Priority support", "Cancel anytime"],
  },
  {
    id: "annual",
    label: "Annual",
    price: "$29",
    unit: "/yr",
    priceNote: "Just $2.42/mo — save 40%",
    description: "Best value for regular use.",
    highlight: true,
    features: ["Everything in Monthly", "2 months free vs. monthly", "Priority support"],
  },
  {
    id: "lifetime",
    label: "Lifetime",
    price: "$79",
    unit: "once",
    priceNote: "One-time payment",
    description: "Pay once, yours forever.",
    features: ["Everything in Annual", "No renewals, ever", "All future updates included"],
  },
];
