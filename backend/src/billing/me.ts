// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { MeResponse, PaidFlag } from "../contract";
import { json } from "./http";
import { paidKey } from "./kv-schema";
import { isFlagActive } from "./kv-ops";
import { devForceProTier, type Env } from "./config";

/** Derive the /me response from a stored PaidFlag at the given time. */
export function tierFromRecord(flag: PaidFlag | null, nowSec: number): MeResponse {
  const active = isFlagActive(flag, nowSec);
  if (active && flag) return { tier: "pro", plan: flag.plan, status: flag.status };
  return { tier: "free" };
}

export async function handleMe(req: Request, env: Env, nowSec: number): Promise<Response> {
  const forced = devForceProTier(env);
  if (forced) return json(forced);

  const deviceId = req.headers.get("X-Device-Id");
  if (!deviceId || deviceId.length < 8) return json({ tier: "free" } satisfies MeResponse);

  const flag = await env.PAID.get<PaidFlag>(paidKey(deviceId), "json");
  return json(tierFromRecord(flag, nowSec));
}
