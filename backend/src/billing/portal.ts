// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { PaidFlag, PortalResponse } from "../contract";
import { json } from "./http";
import { logInfo, logWarn, logError } from "./log";
import { paidKey } from "./kv-schema";
import { isFlagActive } from "./kv-ops";
import type { Env } from "./config";

const STRIPE_API = "https://api.stripe.com/v1/billing_portal/sessions";

/**
 * Mint a Stripe-hosted Customer Portal session.
 *
 * AUTH: the device IS the credential. A device holding an active PaidFlag was
 * granted it by a signature-verified webhook, so no further proof is needed.
 * This deliberately does NOT accept an email — /restore's email path is
 * unverified and must never gate a session that can cancel a subscription and
 * read invoices.
 *
 * past_due is allowed through on purpose: that customer's card failed and
 * fixing it is exactly what the portal is for. isFlagActive already treats
 * past_due as active until periodEnd.
 */
export async function handlePortal(req: Request, env: Env, nowSec: number): Promise<Response> {
  const deviceId = req.headers.get("X-Device-Id");
  if (!deviceId || deviceId.length < 8) {
    logWarn("portal", { event: "no_device" });
    return json({ ok: false, reason: "no_entitlement" } satisfies PortalResponse, 403);
  }

  const flag = await env.PAID.get<PaidFlag>(paidKey(deviceId), "json");
  if (!isFlagActive(flag, nowSec)) {
    logWarn("portal", { event: "no_entitlement", device: deviceId });
    return json({ ok: false, reason: "no_entitlement" } satisfies PortalResponse, 403);
  }
  if (!flag?.customerId) {
    logError("portal", { event: "no_customer", device: deviceId });
    return json({ ok: false, reason: "no_customer" } satisfies PortalResponse, 403);
  }

  const body = new URLSearchParams({ customer: flag.customerId });
  if (env.PORTAL_RETURN_URL) body.set("return_url", env.PORTAL_RETURN_URL);

  const res = await fetch(STRIPE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    // Never echo Stripe's error body to the client — it can name other customers.
    logError("portal", { event: "stripe_error", device: deviceId, status: res.status });
    return json({ ok: false, reason: "stripe_error" } satisfies PortalResponse, 502);
  }

  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    logError("portal", { event: "stripe_no_url", device: deviceId });
    return json({ ok: false, reason: "stripe_error" } satisfies PortalResponse, 502);
  }

  logInfo("portal", { event: "minted", device: deviceId, cust: flag.customerId });
  return json({ ok: true, url: data.url } satisfies PortalResponse);
}
