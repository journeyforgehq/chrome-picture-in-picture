// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { config } from "./config";
import type { Plan } from "../contract";

/**
 * Build the Stripe Checkout URL for a plan, tagging it with
 * client_reference_id=deviceId so the backend webhook (checkout.session.completed)
 * can attribute the purchase back to this device (spec §5/§6).
 * Correctly appends the query param whether the configured link already has
 * query params or not.
 */
export function checkoutUrl(plan: Plan, deviceId: string): string {
  const base = config.STRIPE_LINKS[plan];
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}client_reference_id=${encodeURIComponent(deviceId)}`;
}
