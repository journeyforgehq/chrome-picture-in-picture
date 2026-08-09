// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
//
// LOCAL DRIFT (recorded in docs/superpowers/plans/core-drift.md): this child
// ships a single lifetime plan at $9.99. Per-child pricing is arguably what
// this file is for; the drift is accepted, not accidental.
// =============================================================================
import type { PaywallPlan } from "../ui-kit";

/**
 * The displayed paywall plans — the SINGLE source (imported by options.tsx).
 * Keep `price`/`priceNote` in sync with your Stripe prices. The `id` maps to a
 * STRIPE_LINKS[id] checkout URL (see billing/config.ts). Rendered as plan cards
 * (see ui-kit/UpgradePaywall) — `description` + `features` are the upsell content.
 *
 * PRICING RULE (enforced by test/plans.test.ts): this child is lifetime-only, so
 * the template's non-domination ladder rule does not apply — and could not
 * protect anything if it did, since every one of its clauses is conditional on
 * `monthly`/`annual` being present and passes vacuously on a one-plan array.
 * The test pins the shape that actually matters here instead: exactly one plan,
 * id `lifetime`, price `$9.99`. Re-adding a ladder means re-adding the
 * non-domination rule with it (lifetime must stay ABOVE a year of annual).
 *
 * `Plan` still admits "monthly" and "annual" (src/contract.ts) and
 * `config.STRIPE_LINKS` still carries all three keys — the paid-tier plan can
 * re-add a subscription without a contract or build-config change.
 */
export const PLANS: PaywallPlan[] = [
  {
    id: "lifetime",
    label: "Lifetime",
    price: "$9.99",
    unit: "once",
    priceNote: "One-time payment",
    description: "Pay once, yours forever.",
    features: ["Every Pro feature", "No renewals, ever", "All future updates included"],
  },
];
