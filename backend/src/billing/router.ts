// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { Env } from "./config";
import { json, preflight } from "./http";
import { assertBillingConfig } from "./config";
import { handleMe } from "./me";
import { handleWebhook } from "./webhook";
import { handleRestore } from "./restore";

/**
 * Core billing router. Returns a Response for a billing route (preflight, health,
 * config fail-fast, me, webhook, restore) or null if the path is not a billing
 * route — letting the child's index.ts add its own feature routes. CORE (synced).
 */
export async function handleBilling(req: Request, env: Env, nowSec: number, nowMs: number): Promise<Response | null> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return preflight();
  // GET /health is owned by the health router (index.ts wires it first) and
  // carries { ok, version, configOk } via its `shallow` extra.
  try {
    assertBillingConfig(env);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "config_error";
    console.error(`[config] ${detail}`);
    return json({ error: "misconfigured", detail }, 500);
  }
  if (req.method === "GET" && url.pathname === "/me") return handleMe(req, env, nowSec);
  if (req.method === "POST" && url.pathname === "/stripe/webhook") return handleWebhook(req, env, nowSec);
  if (req.method === "POST" && url.pathname === "/restore") return handleRestore(req, env, nowMs);
  return null;
}
