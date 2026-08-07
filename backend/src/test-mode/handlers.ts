import type { Env } from "../billing/config";
import type { TestModeHandlers, TestSeedBody } from "./router";
import { softCancelPaid } from "../billing/kv-ops";

const FAR_FUTURE = 4102444800; // 2100-01-01T00:00:00Z in unix seconds — pro period never expires in tests

function j(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Backends that add a usage meter (seo/compose) also reset it here via their UserMeter DO's
// POST /reset route; the template backend has no meter, so resetMeter is a KV-only no-op.
export function testHandlers(env: Env): TestModeHandlers {
  return {
    async seed(body: TestSeedBody) {
      const deviceId = body.deviceId;
      if (!deviceId || deviceId.length < 8) return j({ error: "deviceId must be >= 8 chars" }, 400);
      if (body.tier === "pro") {
        await env.PAID.put(
          `paid:${deviceId}`,
          JSON.stringify({ tier: "pro", status: "active", periodEnd: FAR_FUTURE, customerId: "c_e2e", subId: "s_e2e" })
        );
      } else {
        await softCancelPaid(env, deviceId); // §6/P3: tombstone, never hard-delete (pointer safety)
      }
      return j({ ok: true, deviceId, tier: body.tier || "free" });
    },
    async reset(body: TestSeedBody) {
      const deviceId = body.deviceId;
      if (!deviceId || deviceId.length < 8) return j({ error: "deviceId must be >= 8 chars" }, 400);
      await softCancelPaid(env, deviceId); // §6/P3: tombstone, never hard-delete (pointer safety)
      return j({ ok: true, deviceId });
    },
  };
}
