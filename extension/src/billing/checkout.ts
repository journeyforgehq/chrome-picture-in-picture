// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { config } from "./config";
import type { AppEnv } from "./config";
import type { CheckoutRequest, CheckoutResponse, Plan } from "../contract";

/**
 * Stripe marks TEST-mode Payment Links with a `test_` path prefix
 * (https://buy.stripe.com/test_4gM5kx...). Live links never carry it, so the
 * prefix is a reliable mode signal without calling the API.
 */
const TEST_MODE_LINK = /^https?:\/\/(?:[a-z0-9-]+\.)*stripe\.com\/test_/i;

/** Scaffold stand-ins that are syntactically valid URLs but point nowhere. */
const PLACEHOLDER_MARKERS = ["REPLACE_ME", "_placeholder"];

export function isTestModeLink(url: string): boolean {
  return TEST_MODE_LINK.test(url);
}

/**
 * Whether a static Payment Link is safe to open.
 *
 * Three ways it is not, all of which otherwise fail SILENTLY — the customer
 * sees something plausible and we learn about it from a support email:
 *
 *  - unset: `checkoutUrl` would return a bare "?client_reference_id=..." — a
 *    relative URL that opens a blank tab.
 *  - a scaffold placeholder (test_REPLACE_ME, test_lifetime_placeholder): a
 *    dead Stripe page.
 *  - a TEST-mode link in a PRODUCTION build: a checkout that looks completely
 *    normal, where every real card is declined and no money is ever collected.
 *    Test links belong in staging, which is why the check is prod-only.
 */
export function isUsableCheckoutLink(base: string, appEnv: AppEnv = config.APP_ENV): boolean {
  if (!base) return false;
  if (PLACEHOLDER_MARKERS.some((marker) => base.includes(marker))) return false;
  if (appEnv === "prod" && isTestModeLink(base)) return false;
  return true;
}

/**
 * Version of the terms the paywall showed when the customer clicked buy. It is
 * banked verbatim in the server-side consent record (see backend
 * src/billing/checkout.ts), so it must stay STABLE and greppable — bump it here,
 * in one place, whenever the Terms / Refund policy text materially changes.
 */
export const TERMS_VERSION = "v1";

/**
 * Build the legacy static Stripe Payment Link for a plan, tagging it with
 * client_reference_id=deviceId so the backend webhook (checkout.session.completed)
 * can attribute the purchase back to this device (spec §5/§6).
 * Correctly appends the query param whether the configured link already has
 * query params or not.
 *
 * STILL LIVE: this is the CHECKOUT_MODE=link rollback path, not dead code — it is
 * what restores the money path by rebuild if server-minted sessions misbehave.
 */
export function checkoutUrl(plan: Plan, deviceId: string): string {
  const base = config.STRIPE_LINKS[plan];
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}client_reference_id=${encodeURIComponent(deviceId)}`;
}

export interface CheckoutContext {
  /** The price string the paywall actually rendered — recorded as consent evidence. */
  priceShown: string;
  termsVersion: string;
}

/**
 * Resolve a checkout URL for `plan`.
 *
 * In "session" mode (the default) the URL is a Stripe Checkout Session minted by
 * POST /checkout, so it can carry metadata.app, a statement descriptor, a rate
 * limit and a consent record of what the customer was shown. In "link" mode it is
 * the static Payment Link — the rollback path.
 *
 * Returns null on failure so the caller can surface an error rather than opening a
 * blank tab. Never throws: the backend deliberately does not expose Stripe's error
 * text (it can name other customers), so callers show a generic message.
 */
export async function startCheckout(
  plan: Plan,
  deviceId: string,
  ctx: CheckoutContext
): Promise<string | null> {
  if (config.CHECKOUT_MODE === "link") {
    // Return null rather than a bad URL so the caller surfaces an error,
    // matching how session mode fails when no Price ID is wired. See
    // isUsableCheckoutLink for the three cases this catches.
    if (!isUsableCheckoutLink(config.STRIPE_LINKS[plan])) return null;
    return checkoutUrl(plan, deviceId);
  }

  try {
    const body: CheckoutRequest = {
      plan,
      priceShown: ctx.priceShown,
      termsVersion: ctx.termsVersion,
    };
    const res = await fetch(`${config.BACKEND_BASE_URL}/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Device-Id": deviceId },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const parsed = (await res.json()) as CheckoutResponse;
    return parsed.ok && parsed.url ? parsed.url : null;
  } catch {
    return null;
  }
}
