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

export type PaidRecord = PaidFlag;
export type CustList = string[];

export const paidKey = (deviceId: string): string => `paid:${deviceId}`;
export const emailKey = (email: string): string => `email:${email.trim().toLowerCase()}`;
export const custKey = (customerId: string): string => `cust:${customerId}`;
export const subKey = (subId: string): string => `sub:${subId}`;
export const evtKey = (eventId: string): string => `evt:${eventId}`;
export const restoreKey = (deviceId: string, day: string): string => `restore:${deviceId}:${day}`;

/** UTC yyyy-mm-dd for the given epoch-ms (defaults to now). */
export function todayUTC(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
