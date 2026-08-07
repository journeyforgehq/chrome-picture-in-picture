// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { PaidFlag, RestoreRequest, RestoreResponse } from "../contract";
import { json } from "./http";
import { logInfo, logWarn } from "./log";
import { paidKey, emailKey, subKey, restoreKey, todayUTC } from "./kv-schema";
import { appendDevice, isFlagActive } from "./kv-ops";
import type { Env } from "./config";

const RESTORE_MAX_PER_DAY = 5;
const RESTORE_TTL_SEC = 2 * 86400; // 2 days

// Soft abuse guard. Non-atomic counter (KV has no transactions), so a burst of
// concurrent restores from one device in the same second may slightly under-count.
async function bumpRateLimit(env: Env, deviceId: string, nowMs: number): Promise<number> {
  const key = restoreKey(deviceId, todayUTC(nowMs));
  const count = Number((await env.PAID.get(key)) || "0") + 1;
  await env.PAID.put(key, String(count), { expirationTtl: RESTORE_TTL_SEC });
  return count;
}

export async function handleRestore(req: Request, env: Env, nowMs: number): Promise<Response> {
  let body: Partial<RestoreRequest>;
  try {
    body = (await req.json()) as Partial<RestoreRequest>;
  } catch {
    return json({ ok: false, tier: "free" } satisfies RestoreResponse, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const deviceId = body.deviceId ?? "";
  if (!email || !deviceId) return json({ ok: false, tier: "free" } satisfies RestoreResponse, 400);

  // Always-on rate limit (spec §5).
  const attempts = await bumpRateLimit(env, deviceId, nowMs);
  if (attempts > RESTORE_MAX_PER_DAY) {
    // Abuse signal: email enumeration / Pro-rebinding attempts on this device.
    logWarn("restore", { event: "rate_limited", device: deviceId, attempts });
    return json({ ok: false, tier: "free" } satisfies RestoreResponse, 429);
  }

  const ownerDeviceId = await env.PAID.get(emailKey(email));
  const ownerFlag = ownerDeviceId ? await env.PAID.get<PaidFlag>(paidKey(ownerDeviceId), "json") : null;
  const nowSec = Math.floor(nowMs / 1000);
  const active = isFlagActive(ownerFlag, nowSec);
  if (!ownerFlag || !active) {
    // 200, not 404: business-outcome misses stay HTTP 200 (spec §2.2). The frontend
    // CORE (entitlement.ts) already tolerates both shapes (Tasks 2-3).
    logInfo("restore", { event: "miss", device: deviceId, hasEmail: true });
    return json({ ok: false, tier: "free", reason: "not_found" } satisfies RestoreResponse, 200);
  }

  // Multi-device model: restore intentionally leaves the OLD device's entitlement
  // active too — both devices are later revoked together via the cust: cascade
  // in webhook.ts when the subscription is canceled.
  const copied: PaidFlag = { ...ownerFlag, email };
  await env.PAID.put(paidKey(deviceId), JSON.stringify(copied));
  await env.PAID.put(emailKey(email), deviceId); // re-point index at the new device
  if (copied.subId) await env.PAID.put(subKey(copied.subId), deviceId);
  await appendDevice(env, copied.customerId, deviceId);

  // Email-based entitlement re-point onto a new device — audit (device only).
  logInfo("restore", { event: "granted", device: deviceId, cust: copied.customerId, plan: copied.plan });
  return json({ ok: true, tier: "pro", reason: "granted", plan: copied.plan } satisfies RestoreResponse, 200);
}
