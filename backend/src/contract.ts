// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
// Shared wire contract — vendored to BOTH the worker and the extension.
// Pure types + one error map. No runtime dependency.

export type Tier = "free" | "pro";
export type Plan = "monthly" | "annual" | "lifetime";
export type PaidStatus = "active" | "inactive" | "canceled" | "past_due";

/** What the customer was actually shown when they clicked buy. Dispute evidence. */
export interface ConsentRecord {
  at: number;              // unix seconds
  priceShown: string;      // exactly the string rendered on the plan card, e.g. "$29"
  plan: Plan;
  app: string;             // matches metadata.app on the Stripe session
  termsVersion: string;
  ip: string;              // CF-Connecting-IP, or "" when unavailable
}

/** Entitlement record stored at paid:{deviceId}. */
export interface PaidFlag {
  tier: Exclude<Tier, "free">;
  status: PaidStatus;
  plan: Plan;
  periodEnd: number | null; // unix seconds; null => not active (never "forever")
  customerId: string;
  subId: string | null;
  email: string;
  /** OPTIONAL on purpose: every entitlement granted before server-created Checkout
   *  Sessions has none, and requiring it would invalidate every existing KV record. */
  consent?: ConsentRecord;
}

/** GET /me response. */
export interface MeResponse {
  tier: Tier;
  plan?: Plan;
  status?: PaidStatus;
}

/** POST /restore request + response. */
export interface RestoreRequest {
  email: string;
  deviceId: string;
}
export interface RestoreResponse {
  ok: boolean;
  tier: Tier;
  /** Present on the 200 {ok} contract (spec §2.2); absent on the 429/400 legacy shapes. */
  reason?: "granted" | "not_found";
  plan?: Plan;
}

/** GET /health response. */
export interface HealthResponse {
  ok: true;
  version: string;
  /** True when required billing secrets are present (or dev-force-pro short-circuits). Liveness stays 200 regardless. */
  configOk?: boolean;
}

export type ErrorName = "upgrade_required" | "rate_limited" | "too_long" | "unavailable";
export interface CatalogEntry {
  name: ErrorName;
  message: string;
}

// HTTP status -> semantic error name -> user-facing message.
export const ERROR_CATALOG: Record<number, CatalogEntry> = {
  402: { name: "upgrade_required", message: "This feature needs Pro. Upgrade to continue." },
  429: { name: "rate_limited", message: "Too many requests. Please slow down and try again." },
  413: { name: "too_long", message: "That input is too long. Please shorten it." },
  500: { name: "unavailable", message: "The service is temporarily unavailable. Please try again." },
};

export interface ResolvedError {
  status: number;
  name: ErrorName;
  message: string;
}

/** Resolve an HTTP status to a catalog entry; unknown/5xx statuses fall back to 500/unavailable. */
export function errorFor(status: number): ResolvedError {
  const entry = ERROR_CATALOG[status] ?? ERROR_CATALOG[500];
  const resolvedStatus = ERROR_CATALOG[status] ? status : 500;
  return { status: resolvedStatus, name: entry.name, message: entry.message };
}

/** POST /portal response. `url` is a short-lived Stripe-hosted session URL. */
export interface PortalResponse {
  ok: boolean;
  url?: string;
  reason?: "no_entitlement" | "no_customer" | "stripe_error";
}

/** POST /checkout request + response. Replaces the static Payment Link: the session
 *  is minted server-side so it can carry metadata.app, a statement descriptor and a
 *  consent record, and can be rate limited. */
export interface CheckoutRequest {
  plan: Plan;
  priceShown: string;
  termsVersion: string;
}
export interface CheckoutResponse {
  ok: boolean;
  url?: string;
  reason?: "bad_plan" | "not_configured" | "rate_limited" | "stripe_error";
}
