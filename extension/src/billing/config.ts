// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { Plan } from "../contract";

export type StripeLinks = Record<Plan, string>;

export interface Config {
  BACKEND_BASE_URL: string;
  STRIPE_LINKS: StripeLinks;
  WELCOME_URL: string;
  /** Post-uninstall feedback page (best on the welcome domain, e.g. `${origin}/uninstall`). Empty = no uninstall tab. */
  UNINSTALL_URL: string;
  ACCENT: string;
  DEV_PRO: boolean;
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
};

export type { Plan };
