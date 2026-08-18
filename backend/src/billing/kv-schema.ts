// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { PaidFlag } from "../contract";

// Unified KV schema (spec §5).
//   paid:{deviceId}                -> PaidFlag JSON
//   email:{lowercased email}       -> owner deviceId
//   cust:{customerId}              -> string[] deviceIds
//   sub:{subId}                    -> deviceId
//   evt:{stripeEventId}            -> "1" idempotency marker (TTL)
//   restore:{deviceId}:{yyyy-mm-dd}-> attempt counter (TTL)
//   checkout:{deviceId}:{yyyy-mm-dd}-> checkout attempt counter (TTL)
//   consent:{sessionId}            -> pending ConsentRecord JSON (TTL)

export type PaidRecord = PaidFlag;
export type CustList = string[];

export const paidKey = (deviceId: string): string => `paid:${deviceId}`;
export const emailKey = (email: string): string => `email:${email.trim().toLowerCase()}`;
export const custKey = (customerId: string): string => `cust:${customerId}`;
export const subKey = (subId: string): string => `sub:${subId}`;
export const evtKey = (eventId: string): string => `evt:${eventId}`;
export const restoreKey = (deviceId: string, day: string): string => `restore:${deviceId}:${day}`;

export const checkoutKey = (deviceId: string, day: string): string => `checkout:${deviceId}:${day}`;

/** Pending consent captured at session creation, keyed by Checkout Session id.
 *  Folded into the PaidFlag on checkout.session.completed, then expires. */
export const consentKey = (sessionId: string): string => `consent:${sessionId}`;

/** UTC yyyy-mm-dd for the given epoch-ms (defaults to now). */
export function todayUTC(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
