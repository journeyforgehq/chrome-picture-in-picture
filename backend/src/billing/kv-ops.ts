// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { PaidFlag } from "../contract";
import { paidKey, custKey } from "./kv-schema";
import type { Env } from "./config";

/**
 * Plan-driven expiry (restore-normalization spec §3). Terminal statuses are rejected
 * FIRST — so a canceled/inactive lifetime is correctly revoked and the lifetime
 * short-circuit below can't resurrect it. Lifetime never time-expires (retires the old
 * 100-year `periodEnd` sentinel; new lifetime flags carry `periodEnd: null`, and old
 * sentinel records still read active because plan === "lifetime"). Subscriptions require
 * an active/past_due status within a live paid period.
 */
export function isFlagActive(flag: PaidFlag | null, nowSec: number): boolean {
  if (!flag) return false;
  if (flag.status === "canceled" || flag.status === "inactive") return false;
  if (flag.plan === "lifetime") return true;
  return (flag.status === "active" || flag.status === "past_due") && flag.periodEnd != null && flag.periodEnd > nowSec;
}

/**
 * Delete protection (restore-normalization spec §6, P1): the canonical way to make a
 * device un-Pro. NEVER hard-delete the paid: key via the KV binding — a hard delete
 * can orphan an `email:`/`sub:` POINTER that still references this device. Overwrite with an inert
 * flag instead (`isFlagActive` → false), so the key stays present and no pointer
 * dangles. Revoke/refund/reset all route through here; there is no `.delete(` on the
 * KV binding anywhere (enforced by the `guard:kv-no-delete` CI check).
 */
export async function softCancelPaid(env: Env, deviceId: string): Promise<void> {
  const tombstone: PaidFlag = {
    tier: "pro", status: "canceled", plan: "lifetime",
    periodEnd: 0, customerId: "", subId: null, email: "",
  };
  await env.PAID.put(paidKey(deviceId), JSON.stringify(tombstone));
}

// Best-effort secondary index of a customer's devices (used by the revoke/renew cascades).
// KV has no transactions, so this read-modify-write is non-atomic: concurrent grants/restores
// for the same customer can race and drop an entry. The authoritative entitlement is always
// the per-device paid:{deviceId} record.
export async function appendDevice(env: Env, customerId: string, deviceId: string): Promise<void> {
  if (!customerId || !deviceId) return;
  const list: string[] = JSON.parse((await env.PAID.get(custKey(customerId))) || "[]");
  if (!list.includes(deviceId)) {
    list.push(deviceId);
    await env.PAID.put(custKey(customerId), JSON.stringify(list));
  }
}

/**
 * Apply a mutation to every device flag in a customer's cust: list, writing each back.
 * Missing customerId or missing paid: records are safe no-ops. Shared by the revoke and
 * renew webhook cascades. Non-atomic (see appendDevice caveat).
 */
export async function forEachCustomerDevice(
  env: Env,
  customerId: string,
  mutate: (flag: PaidFlag) => void,
): Promise<number> {
  if (!customerId) return 0;
  const devices: string[] = JSON.parse((await env.PAID.get(custKey(customerId))) || "[]");
  let touched = 0;
  for (const d of devices) {
    const flag = await env.PAID.get<PaidFlag>(paidKey(d), "json");
    if (flag) {
      mutate(flag);
      await env.PAID.put(paidKey(d), JSON.stringify(flag));
      touched++;
    }
  }
  return touched;
}
