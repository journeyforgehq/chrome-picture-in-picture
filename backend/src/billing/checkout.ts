// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { CheckoutRequest, CheckoutResponse, ConsentRecord, Plan } from "../contract";
import { json } from "./http";
import { logInfo, logWarn, logError } from "./log";
import { checkoutKey, consentKey, todayUTC } from "./kv-schema";
import type { Env } from "./config";

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";
const CHECKOUT_MAX_PER_DAY = 10;
const CHECKOUT_RL_TTL_SEC = 2 * 86400; // 2 days — outlives the UTC day the counter keys
/** Well past any realistic Stripe dispute window (120 days), so the consent record
 *  is still there when evidence is submitted. */
const CONSENT_TTL_SEC = 90 * 86400;

/** monthly and annual are recurring prices; lifetime is a one-time charge. */
const PLAN_MODE: Record<Plan, "payment" | "subscription"> = {
  monthly: "subscription",
  annual: "subscription",
  lifetime: "payment",
};

function isPlan(v: unknown): v is Plan {
  return v === "monthly" || v === "annual" || v === "lifetime";
}

function priceIdFor(env: Env, plan: Plan): string {
  if (plan === "monthly") return env.STRIPE_PRICE_MONTHLY || "";
  if (plan === "annual") return env.STRIPE_PRICE_ANNUAL || "";
  return env.STRIPE_PRICE_LIFETIME || "";
}

// Soft abuse guard, mirroring restore.ts. Non-atomic (KV has no transactions), so a
// concurrent burst from one device may slightly under-count — acceptable for a guard
// whose job is to make card-testing at volume unattractive.
async function bumpRateLimit(env: Env, deviceId: string, nowSec: number): Promise<number> {
  const key = checkoutKey(deviceId, todayUTC(nowSec * 1000));
  const count = Number((await env.PAID.get(key)) || "0") + 1;
  await env.PAID.put(key, String(count), { expirationTtl: CHECKOUT_RL_TTL_SEC });
  return count;
}

/**
 * Mint a Stripe Checkout Session server-side.
 *
 * This exists because a static Payment Link cannot: carry `metadata.app` (so a shared
 * Stripe account can attribute disputes to one extension), carry a per-extension
 * statement descriptor, be rate limited (a public link on a distributed extension is a
 * card-testing magnet), or bank a consent record of what the customer was shown.
 *
 * DESCRIPTOR CAVEAT: `statement_descriptor_suffix` is settable per session ONLY in
 * mode=payment, via payment_intent_data. In mode=subscription Stripe derives the
 * descriptor from the account descriptor and the Product, and passing the parameter is
 * an API ERROR — not a silent no-op. So it is added strictly on the payment branch.
 */
export async function handleCheckout(req: Request, env: Env, nowSec: number): Promise<Response> {
  const deviceId = req.headers.get("X-Device-Id");
  if (!deviceId || deviceId.length < 8) {
    logWarn("checkout", { event: "no_device" });
    return json({ ok: false, reason: "bad_plan" } satisfies CheckoutResponse, 400);
  }

  let body: Partial<CheckoutRequest>;
  try {
    body = (await req.json()) as Partial<CheckoutRequest>;
  } catch {
    logWarn("checkout", { event: "bad_body", device: deviceId });
    return json({ ok: false, reason: "bad_plan" } satisfies CheckoutResponse, 400);
  }

  const plan = body.plan;
  if (!isPlan(plan)) {
    logWarn("checkout", { event: "bad_plan", device: deviceId, plan: String(plan) });
    return json({ ok: false, reason: "bad_plan" } satisfies CheckoutResponse, 400);
  }

  const price = priceIdFor(env, plan);
  if (!price) {
    // Config gap, not user error: this plan has no Price ID wired for this deployment.
    logError("checkout", { event: "not_configured", device: deviceId, plan });
    return json({ ok: false, reason: "not_configured" } satisfies CheckoutResponse, 400);
  }

  const attempts = await bumpRateLimit(env, deviceId, nowSec);
  if (attempts > CHECKOUT_MAX_PER_DAY) {
    // Abuse signal: card testing / session farming from one device.
    logWarn("checkout", { event: "rate_limited", device: deviceId, attempts });
    return json({ ok: false, reason: "rate_limited" } satisfies CheckoutResponse, 429);
  }

  const mode = PLAN_MODE[plan];
  const form = new URLSearchParams({
    mode,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: deviceId,
    "metadata[app]": env.APP_SLUG || "",
    "metadata[plan]": plan,
  });
  if (env.CHECKOUT_SUCCESS_URL) form.set("success_url", env.CHECKOUT_SUCCESS_URL);
  if (env.CHECKOUT_CANCEL_URL) form.set("cancel_url", env.CHECKOUT_CANCEL_URL);
  // ONLY on payment mode — see DESCRIPTOR CAVEAT above.
  if (mode === "payment" && env.STATEMENT_DESCRIPTOR_SUFFIX) {
    form.set("payment_intent_data[statement_descriptor_suffix]", env.STATEMENT_DESCRIPTOR_SUFFIX);
  }

  const res = await fetch(STRIPE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!res.ok) {
    // Never echo Stripe's error body to the client — it can name other customers.
    logError("checkout", { event: "stripe_error", device: deviceId, plan, status: res.status });
    return json({ ok: false, reason: "stripe_error" } satisfies CheckoutResponse, 502);
  }

  const session = (await res.json()) as { id?: string; url?: string };
  if (!session.url) {
    logError("checkout", { event: "stripe_no_url", device: deviceId, plan });
    return json({ ok: false, reason: "stripe_error" } satisfies CheckoutResponse, 502);
  }

  if (session.id) {
    const consent: ConsentRecord = {
      at: nowSec,
      priceShown: String(body.priceShown ?? ""),
      plan,
      app: env.APP_SLUG || "",
      termsVersion: String(body.termsVersion ?? ""),
      ip: req.headers.get("CF-Connecting-IP") || "",
    };
    await env.PAID.put(consentKey(session.id), JSON.stringify(consent), { expirationTtl: CONSENT_TTL_SEC });
  } else {
    // Session created but unidentifiable — the grant can never fold consent in.
    logError("checkout", { event: "session_no_id", device: deviceId, plan });
  }

  logInfo("checkout", { event: "session_created", device: deviceId, plan, mode, session: session.id });
  return json({ ok: true, url: session.url } satisfies CheckoutResponse);
}
