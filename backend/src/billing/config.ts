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
