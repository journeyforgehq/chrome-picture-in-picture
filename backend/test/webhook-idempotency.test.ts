import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleWebhook } from "../src/billing/webhook";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000;

async function signed(payload: object, t = NOW): Promise<Request> {
  const raw = JSON.stringify(payload);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("whsec_test_123"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://w/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${hex}` }, body: raw });
}

describe("webhook idempotency", () => {
  it("processes an event once and no-ops on redelivery of the same event id", async () => {
    const evt = {
      id: "evt_idem_1", type: "checkout.session.completed",
      data: { object: { client_reference_id: "device-idem-1", customer: "cus_i1", mode: "subscription", subscription: "sub_i1", customer_details: { email: "i@e.com" } } },
    };

    const r1 = await handleWebhook(await signed(evt), env as Env, NOW);
    expect(await r1.json()).toEqual({ received: true });
    expect(await env.PAID.get("evt:evt_idem_1")).toBe("1");
    expect(JSON.parse((await env.PAID.get("cust:cus_i1"))!)).toEqual(["device-idem-1"]);

    // Simulate a revoke landing between the two deliveries, then redeliver the grant:
    const flag = await env.PAID.get<PaidFlag>("paid:device-idem-1", "json");
    flag!.status = "canceled";
    await env.PAID.put("paid:device-idem-1", JSON.stringify(flag));

    const r2 = await handleWebhook(await signed(evt), env as Env, NOW);
    expect(await r2.json()).toEqual({ received: true });
    // Redelivery must NOT re-grant (status stays canceled) and cust: stays single-entry.
    expect((await env.PAID.get<PaidFlag>("paid:device-idem-1", "json"))?.status).toBe("canceled");
    expect(JSON.parse((await env.PAID.get("cust:cus_i1"))!)).toEqual(["device-idem-1"]);
  });
});
