// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { MeResponse } from "../contract";

export interface Env {
  PAID: KVNamespace;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ENVIRONMENT: string; // "dev" | "production"
  APP_VERSION: string;
  DEV_FORCE_PRO?: string; // "1" honored ONLY when ENVIRONMENT=dev
  HEALTH_TOKEN?: string;
  /** When set (STAGING only), unlocks /__test__/seed + /__test__/reset. NEVER set on prod. */
  E2E_SEED_SECRET?: string;
  /** Where Stripe returns the customer after they close the portal. Optional —
   *  Stripe falls back to the account's configured default when unset. */
  PORTAL_RETURN_URL?: string;
  /** Stripe Price IDs (price_...), NOT Payment Link URLs. Empty => plan unavailable. */
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
  STRIPE_PRICE_LIFETIME?: string;
  /** App slug written to metadata.app on every session — the key that makes
   *  per-extension dispute/refund reporting possible on a shared Stripe account. */
  APP_SLUG: string;
  /** Appended to the account descriptor on card statements (mode=payment ONLY).
   *  Max 22 chars total with the prefix; letters, numbers and spaces. */
  STATEMENT_DESCRIPTOR_SUFFIX?: string;
  CHECKOUT_SUCCESS_URL?: string;
  CHECKOUT_CANCEL_URL?: string;
}

/** DEV_FORCE_PRO is honored only in dev, so it can never ship enabled in prod (spec §9). */
export function isDevForcePro(env: Pick<Env, "ENVIRONMENT" | "DEV_FORCE_PRO">): boolean {
  return env.ENVIRONMENT === "dev" && env.DEV_FORCE_PRO === "1";
}

/** Pro entitlement payload when dev-force-pro is active, else null. */
export function devForceProTier(
  env: Pick<Env, "ENVIRONMENT" | "DEV_FORCE_PRO">,
): Required<MeResponse> | null {
  if (!isDevForcePro(env)) return null;
  return { tier: "pro", plan: "lifetime", status: "active" };
}

export function appVersion(env: Pick<Env, "APP_VERSION">): string {
  return env.APP_VERSION || "0.0.0";
}

/**
 * Fail-fast config validation. Throws if a required Stripe secret is missing,
 * EXCEPT when dev-force-pro short-circuits billing (spec §6, §9).
 */
export function assertBillingConfig(env: Env): void {
  if (isDevForcePro(env)) return;
  if (!env.STRIPE_SECRET_KEY) throw new Error("missing_config:STRIPE_SECRET_KEY");
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("missing_config:STRIPE_WEBHOOK_SECRET");
}

/** Non-throwing counterpart of assertBillingConfig — for /health readiness reporting. */
export function isBillingConfigured(env: Env): boolean {
  try {
    assertBillingConfig(env);
    return true;
  } catch {
    return false;
  }
}
