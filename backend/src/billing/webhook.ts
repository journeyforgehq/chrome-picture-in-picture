// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { ConsentRecord, PaidFlag, Plan } from "../contract";
import { json } from "./http";
import { logInfo, logWarn, logError } from "./log";
import { paidKey, emailKey, subKey, evtKey, consentKey } from "./kv-schema";
import { verifyStripeSignature } from "./stripe-sig";
import { appendDevice, forEachCustomerDevice } from "./kv-ops";
import type { Env } from "./config";

const SUBSCRIPTION_PERIOD_SEC = 31 * 86400; // near-future placeholder; refined by subscription.updated
const EVENT_TTL_SEC = 3 * 86400; // 3 days

export type Action =
  | { type: "grant"; deviceId: string | null; customerId: string; email: string; plan: Plan; subId: string | null; sessionId: string | null }
  | { type: "revoke"; subId: string | null; customerId: string }
  | { type: "revoke_by_charge"; chargeId: string }
  | { type: "renew"; customerId: string; periodEnd: number }
  | { type: "past_due"; customerId: string }
  | { type: "invoice_paid"; customerId: string; periodEnd: number }
  | { type: "ignore" };

function custId(c: unknown): string {
  if (!c) return "";
  return typeof c === "string" ? c : (c as { id: string }).id;
}

/**
 * Resolve the customer behind a charge. Stripe's Dispute object has no customer
 * field, so a chargeback can only be attributed by retrieving the charge it
 * disputes. Returns "" on any failure — the caller logs and revokes nothing,
 * which is strictly better than revoking the wrong customer.
 */
async function customerIdFromCharge(env: Env, chargeId: string): Promise<string> {
  const res = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(chargeId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) {
    logError("webhook", { event: "charge_lookup_failed", charge: chargeId, status: res.status });
    return "";
  }
  const charge = (await res.json()) as { customer?: unknown };
  return custId(charge.customer);
}

/** Pure event → action mapping (spec §6). */
export function actionFromEvent(event: any): Action {
  const obj = (event && event.data && event.data.object) || {};
  if (event?.type === "checkout.session.completed") {
    const isSub = obj.mode === "subscription" && !!obj.subscription;
    // monthly and annual are BOTH subscriptions; the interval isn't reliably
    // available on checkout.session.completed, so the displayed `plan` label is
    // best-effort ("annual" for any subscription). This is cosmetic only: the
    // durable entitlement (tier/status) and periodEnd are interval-agnostic, and
    // renewal events (subscription.updated / invoice.paid) refresh periodEnd.
    return {
      type: "grant",
      deviceId: obj.client_reference_id || null,
      customerId: custId(obj.customer),
      email: ((obj.customer_details && obj.customer_details.email) || obj.customer_email || "").toLowerCase(),
      plan: isSub ? "annual" : "lifetime",
      subId: isSub ? (typeof obj.subscription === "string" ? obj.subscription : (obj.subscription.id ?? null)) : null,
      // Only the id is carried here. The consent:{sessionId} lookup is a KV read and
      // belongs in applyAction — this function is pure by contract.
      sessionId: obj.id || null,
    };
  }
  if (
    (event?.type === "customer.subscription.created" || event?.type === "customer.subscription.updated") &&
    (obj.status === "active" || obj.status === "trialing")
  ) {
    return { type: "renew", customerId: custId(obj.customer), periodEnd: Number(obj.current_period_end) || 0 };
  }
  if (
    event?.type === "customer.subscription.deleted" ||
    (event?.type === "customer.subscription.updated" && obj.status && obj.status !== "active" && obj.status !== "trialing")
  ) {
    return { type: "revoke", subId: obj.id || null, customerId: custId(obj.customer) };
  }
  if (event?.type === "invoice.payment_failed") {
    return { type: "past_due", customerId: custId(obj.customer) };
  }
  if (event?.type === "invoice.paid" || event?.type === "invoice.payment_succeeded") {
    const end = Number(obj?.lines?.data?.[0]?.period?.end) || 0;
    return { type: "invoice_paid", customerId: custId(obj.customer), periodEnd: end };
  }
  // Full refunds and chargebacks revoke. A PARTIAL refund (refunded !== true) is a
  // no-op: revoking on a goodwill partial refund destroys a paying customer's
  // access and generates the dispute the refund was meant to prevent.
  if (event?.type === "charge.refunded" && obj.refunded === true) {
    return { type: "revoke", subId: null, customerId: custId(obj.customer) };
  }
  if (event?.type === "charge.dispute.created") {
    // Stripe's Dispute object carries NO customer field — only `charge` and
    // `payment_intent`. A chargeback can only be attributed by retrieving the
    // charge it disputes, which is an API call, so it happens in applyAction:
    // this function is pure by contract.
    const charge = obj.charge;
    const chargeId = typeof charge === "string" ? charge : (charge && charge.id) || "";
    return { type: "revoke_by_charge", chargeId };
  }
  return { type: "ignore" };
}

export async function applyAction(env: Env, action: Action, nowSec: number): Promise<void> {
  if (action.type === "grant" && action.deviceId) {
    // Consent banked by POST /checkout when the session was minted. Absent for grants
    // that came from a static Payment Link (pre-P5, or a rollback), which must still
    // grant cleanly — hence the conditional spread below.
    // Consent is dispute EVIDENCE, never a precondition for granting. KV's "json"
    // mode THROWS on a malformed value, and an unguarded throw here escapes
    // handleWebhook — the customer's money is taken and no PaidFlag is written,
    // and Stripe's retries fail identically forever. Losing the evidence is bad;
    // losing the entitlement someone paid for is unacceptable.
    let consent: ConsentRecord | null = null;
    if (action.sessionId) {
      try {
        consent = await env.PAID.get<ConsentRecord>(consentKey(action.sessionId), "json");
      } catch {
        logError("webhook", { event: "consent_unreadable", session: action.sessionId });
      }
    }
    const flag: PaidFlag = {
      tier: "pro",
      status: "active",
      plan: action.plan,
      periodEnd: action.plan === "lifetime" ? null : nowSec + SUBSCRIPTION_PERIOD_SEC, // lifetime never expires (spec §3); subs refined by subscription.updated
      customerId: action.customerId,
      subId: action.subId,
      email: action.email,
      // Conditional spread, not `consent: consent ?? undefined` — this keeps the key
      // ABSENT rather than serializing an explicit undefined.
      ...(consent ? { consent } : {}),
    };
    await env.PAID.put(paidKey(action.deviceId), JSON.stringify(flag));
    if (action.email) await env.PAID.put(emailKey(action.email), action.deviceId);
    if (action.subId) await env.PAID.put(subKey(action.subId), action.deviceId);
    await appendDevice(env, action.customerId, action.deviceId);
    // Primary revenue event: a device just became Pro. Audit (no email in logs).
    logInfo("webhook", { event: "grant", device: action.deviceId, sub: action.subId, cust: action.customerId, plan: action.plan, hasEmail: !!action.email });
  } else if (action.type === "grant") {
    // Highest-severity silent failure: a completed checkout with no
    // client_reference_id — the customer PAID but there is no device to grant to.
    logError("webhook", { event: "grant_no_device", cust: action.customerId, plan: action.plan });
  }
  if (action.type === "revoke") {
    // Note: the sub:{subId} reverse index (written on grant) is not cleaned up
    // here. It is currently write-only / forward-looking; keeping it in sync
    // on revoke is a known follow-up.
    const devices = await forEachCustomerDevice(env, action.customerId, (f) => {
      f.status = "canceled";
    });
    if (action.customerId) logInfo("webhook", { event: "revoke", cust: action.customerId, devices });
    else logError("webhook", { event: "revoke_no_customer" });
  }
  if (action.type === "renew" && action.periodEnd > 0) {
    const devices = await forEachCustomerDevice(env, action.customerId, (f) => {
      f.periodEnd = action.periodEnd;
      f.status = "active";
    });
    logInfo("webhook", { event: "renew", cust: action.customerId, devices, periodEnd: action.periodEnd });
  }
  if (action.type === "past_due") {
    const devices = await forEachCustomerDevice(env, action.customerId, (f) => {
      if (f.status === "active") f.status = "past_due"; // keep Pro until periodEnd (R1)
    });
    logWarn("webhook", { event: "past_due", cust: action.customerId, devices });
  }
  if (action.type === "invoice_paid") {
    const devices = await forEachCustomerDevice(env, action.customerId, (f) => {
      f.status = "active";
      if (action.periodEnd > 0) f.periodEnd = action.periodEnd;
    });
    logInfo("webhook", { event: "invoice_paid", cust: action.customerId, devices, periodEnd: action.periodEnd });
  }
  // Last branch in the function: it returns early on the unattributable cases,
  // and the other branches above are sequential `if`s that must all get a look.
  if (action.type === "revoke_by_charge") {
    if (!action.chargeId) {
      logError("webhook", { event: "dispute_no_charge" });
      return;
    }
    const customerId = await customerIdFromCharge(env, action.chargeId);
    if (!customerId) {
      logError("webhook", { event: "dispute_unattributed", charge: action.chargeId });
      return;
    }
    const devices = await forEachCustomerDevice(env, customerId, (f) => {
      f.status = "canceled";
    });
    logInfo("webhook", { event: "revoke", reason: "dispute", cust: customerId, devices });
  }
}

export async function handleWebhook(req: Request, env: Env, nowSec: number): Promise<Response> {
  const raw = await req.text(); // RAW body, read exactly once — required for signature verification
  const sigHeader = req.headers.get("stripe-signature");
  const ok = await verifyStripeSignature(raw, sigHeader, env.STRIPE_WEBHOOK_SECRET, nowSec);
  if (!ok) {
    // Security signal: a forged event or a misconfigured STRIPE_WEBHOOK_SECRET.
    logWarn("webhook", { event: "sig_rejected", hasSig: !!sigHeader });
    return json({ error: "invalid_signature" }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    logError("webhook", { event: "bad_payload" });
    return json({ error: "invalid_payload" }, 400);
  }
  const eventId: string | undefined = event?.id;

  // Idempotency guard (spec §7): if we've seen this event id, no-op.
  if (eventId && (await env.PAID.get(evtKey(eventId)))) {
    logInfo("webhook", { event: "duplicate_skip", id: eventId, type: event?.type });
    return json({ received: true });
  }

  const action = actionFromEvent(event);
  if (action.type === "ignore") {
    // Received-but-unhandled Stripe event — visibility into what Stripe delivers.
    logInfo("webhook", { event: "ignored", type: event?.type });
  }
  await applyAction(env, action, nowSec);

  if (eventId) {
    await env.PAID.put(evtKey(eventId), "1", { expirationTtl: EVENT_TTL_SEC });
  }
  return json({ received: true });
}
