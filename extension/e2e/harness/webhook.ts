// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { createHmac } from "node:crypto";
import { RUN_ID } from "./config";

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Build the `t=,v1=` header exactly as backend/src/billing/stripe-sig.ts verifies it. */
export function signStripeHeader(payload: string, secret: string, tSec: number): string {
  const v1 = createHmac("sha256", secret).update(`${tSec}.${payload}`).digest("hex");
  return `t=${tSec},v1=${v1}`;
}

let seq = 0;
function eventId(prefix: string): string {
  seq += 1;
  return `evt_e2e_${prefix}_${RUN_ID}_${seq}`;
}

/** A completed subscription checkout for `deviceId` — the worker grants pro (plan "annual"). */
export function checkoutCompleted(opts: {
  deviceId: string;
  customerId: string;
  subId: string;
  email?: string;
}): StripeEvent {
  return {
    id: eventId("cs"),
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "subscription",
        subscription: opts.subId,
        client_reference_id: opts.deviceId,
        customer: opts.customerId,
        customer_details: { email: opts.email ?? "e2e@example.com" },
      },
    },
  };
}

/** A canceled subscription — the worker revokes every device on the customer's cust: list. */
export function subscriptionDeleted(opts: { customerId: string; subId: string }): StripeEvent {
  return {
    id: eventId("sd"),
    type: "customer.subscription.deleted",
    data: { object: { id: opts.subId, customer: opts.customerId, status: "canceled" } },
  };
}

/** A subscription update (renewal) — the worker renews every device on the customer when active/trialing. */
export function subscriptionUpdated(opts: {
  customerId: string;
  periodEnd: number;
  status: string;
  eventId?: string;
}): StripeEvent {
  return {
    id: opts.eventId ?? eventId("su"),
    type: "customer.subscription.updated",
    data: {
      object: {
        customer: opts.customerId,
        status: opts.status,
        current_period_end: opts.periodEnd,
      },
    },
  };
}

/** A failed invoice payment — the worker marks active devices past_due. */
export function invoicePaymentFailed(opts: { customerId: string; eventId?: string }): StripeEvent {
  return {
    id: opts.eventId ?? eventId("ipf"),
    type: "invoice.payment_failed",
    data: { object: { customer: opts.customerId } },
  };
}

/** A paid invoice — the worker re-activates devices and refreshes periodEnd. */
export function invoicePaid(opts: { customerId: string; periodEnd: number; eventId?: string }): StripeEvent {
  return {
    id: opts.eventId ?? eventId("ip"),
    type: "invoice.paid",
    data: {
      object: {
        customer: opts.customerId,
        lines: { data: [{ period: { end: opts.periodEnd } }] },
      },
    },
  };
}

/** A refunded charge — the worker revokes every device on the customer's cust: list. */
export function chargeRefunded(opts: { customerId: string; eventId?: string }): StripeEvent {
  return {
    id: opts.eventId ?? eventId("cr"),
    type: "charge.refunded",
    data: { object: { customer: opts.customerId } },
  };
}

/** POST a signed event to the worker's /stripe/webhook and return the raw Response. */
export async function postWebhook(
  baseUrl: string,
  event: StripeEvent,
  secret: string,
  tSec: number = Math.floor(Date.now() / 1000),
): Promise<Response> {
  const payload = JSON.stringify(event);
  return fetch(`${baseUrl}/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signStripeHeader(payload, secret, tSec),
    },
    body: payload,
  });
}
