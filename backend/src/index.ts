export type { Env } from "./billing/config";
import type { Env } from "./billing/config";
import { json } from "./billing/http";
import { logWarn, logError } from "./billing/log";
import { appVersion, isBillingConfigured } from "./billing/config";
import { handleBilling } from "./billing/router";
import { MonitorService } from "./health/monitor-service";
import { envPresence, kvMonitor, stripeMonitor } from "./health/monitors";
import { handleHealth } from "./health/router";
import { handleTestMode } from "./test-mode/router";
import { testHandlers } from "./test-mode/handlers";
// Feature routes live here — this file is a SLOT (child-owned, not synced).
// Add your product's endpoints below; billing stays in the synced core router.

let _service: MonitorService | null = null;
function healthService(env: Env): MonitorService {
  if (_service) return _service;
  const s = new MonitorService(env.ENVIRONMENT || "unknown");
  s.register("env", envPresence({ STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET }));
  s.register("kv", kvMonitor(env.PAID));
  s.register("stripe", stripeMonitor(env.STRIPE_SECRET_KEY));
  _service = s;
  return s;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // Central request logger + top-level safety net (CORE behavior scaffolded
    // extensions inherit): every 4xx/5xx is greppable with method+path+status, and
    // any uncaught throw becomes a LOGGED 500 instead of an opaque runtime error.
    const url = new URL(req.url);
    let res: Response;
    try {
      res = await route(req, env);
    } catch (e) {
      logError("request", { method: req.method, path: url.pathname, status: 500, err: e instanceof Error ? e.message : "unhandled" });
      res = json({ error: "internal_error" }, 500);
    }
    if (res.status >= 400) logWarn("request", { method: req.method, path: url.pathname, status: res.status });
    return res;
  },
};

async function route(req: Request, env: Env): Promise<Response> {
  // Health runs FIRST so both the shallow /health and the token-guarded
  // /health/summary answer even when billing is misconfigured (they must, to
  // report that misconfiguration). The shallow /health carries the richer
  // liveness contract `{ ok, version, configOk }` via the `shallow` extra.
  const health = await handleHealth(req, () => healthService(env), env.HEALTH_TOKEN, {
    version: appVersion(env),
    configOk: isBillingConfigured(env),
  });
  if (health) return health;

  const test = await handleTestMode(req, env.E2E_SEED_SECRET, testHandlers(env), env.ENVIRONMENT);
  if (test) return test;

  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  const billing = await handleBilling(req, env, nowSec, nowMs);
  if (billing) return billing;

  // e.g. if (new URL(req.url).pathname === "/feature") return handleFeature(req, env);

  return json({ error: "not_found" }, 404);
}
