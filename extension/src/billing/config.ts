// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { Plan } from "../contract";

export type StripeLinks = Record<Plan, string>;

/**
 * Which committed env file this bundle was built from — the build target, not a
 * runtime mode. webpack picks .env / .env.staging / .env.production by APP_ENV
 * and injects the NORMALIZED value here (see webpack/webpack.common.cjs), so
 * "production" and "prod" both arrive as "prod".
 */
export type AppEnv = "local" | "staging" | "prod";

function normalizeAppEnv(raw: string | undefined): AppEnv {
  if (raw === "staging") return "staging";
  if (raw === "prod" || raw === "production") return "prod";
  return "local";
}

export interface Config {
  BACKEND_BASE_URL: string;
  /** Build target this bundle was compiled for. Gates the test-mode Payment
   *  Link check in ./checkout — see `isUsableCheckoutLink`. */
  APP_ENV: AppEnv;
  STRIPE_LINKS: StripeLinks;
  WELCOME_URL: string;
  /** Post-uninstall feedback page (best on the welcome domain, e.g. `${origin}/uninstall`). Empty = no uninstall tab. */
  UNINSTALL_URL: string;
  ACCENT: string;
  DEV_PRO: boolean;
  /** "session" (default) mints via POST /checkout. "link" falls back to the
   *  static Payment Link. Lets the money path roll back without a store
   *  resubmission — flip the env var and rebuild. */
  CHECKOUT_MODE: "session" | "link";
}

// In the browser build, webpack's DefinePlugin replaces `process.env.X`
// string literals at compile time (see webpack/webpack.common.cjs). In
// vitest (Node), these read straight from process.env, which is what
// makes config.test.ts able to override them per test via vi.resetModules().
// The uninstall page is the `/uninstall` route on the welcome origin, so it is
// DERIVED from WELCOME_URL (single source of truth) — always set + consistent with
// the welcome site — unless explicitly overridden via UNINSTALL_URL.

/** Derive the post-uninstall page URL from the welcome-page URL (`<origin>/uninstall`). Empty in → empty out. */
export function deriveUninstallUrl(welcomeUrl: string): string {
  return welcomeUrl ? welcomeUrl.replace(/\/+$/, "") + "/uninstall" : "";
}

const WELCOME_URL = process.env.WELCOME_URL || "";

export const config: Config = {
  BACKEND_BASE_URL: process.env.BACKEND_BASE_URL || "http://localhost:8787",
  // Defensively normalized again here, not just in webpack: vitest runs in Node
  // and reads the RAW process.env, so a test (or a `APP_ENV=production` shell)
  // must land on the same value the bundle would carry.
  APP_ENV: normalizeAppEnv(process.env.APP_ENV),
  STRIPE_LINKS: {
    monthly: process.env.STRIPE_MONTHLY_URL || "",
    annual: process.env.STRIPE_ANNUAL_URL || "",
    lifetime: process.env.STRIPE_LIFETIME_URL || "",
  },
  WELCOME_URL,
  UNINSTALL_URL: process.env.UNINSTALL_URL || deriveUninstallUrl(WELCOME_URL),
  ACCENT: process.env.ACCENT || "#1677ff",
  // Hard rule: only the literal string "true" enables dev-pro. webpack.prod.cjs
  // pins __DEV_PRO__ to false regardless of shell env (see Task 10).
  DEV_PRO: process.env.DEV_PRO === "true",
  // Server-minted sessions are the default; only the literal "link" rolls back
  // to the static Payment Link (so a typo can't silently downgrade the money path).
  CHECKOUT_MODE: process.env.CHECKOUT_MODE === "link" ? "link" : "session",
};

export type { Plan };
