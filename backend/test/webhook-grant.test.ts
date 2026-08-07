import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleWebhook, actionFromEvent } from "../src/billing/webhook";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000;

async function signed(payload: object, t = NOW): Promise<Request> {
  const raw = JSON.stringify(payload);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode("whsec_test_123"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://w/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${hex}` },
    body: raw,
  });
}

describe("actionFromEvent", () => {
  it("maps a subscription checkout to a grant with plan=annual", () => {
    const a = actionFromEvent({
      id: "evt_1", type: "checkout.session.completed",
      data: { object: { client_reference_id: "device-x", customer: "cus_1", mode: "subscription", subscription: "sub_1", customer_details: { email: "A@B.com" } } },
    });
    expect(a).toMatchObject({ type: "grant", deviceId: "device-x", customerId: "cus_1", subId: "sub_1", plan: "annual", email: "a@b.com" });
  });

  it("maps a one-time (payment) checkout to a grant with plan=lifetime and null subId", () => {
    const a = actionFromEvent({
      id: "evt_2", type: "checkout.session.completed",
      data: { object: { client_reference_id: "device-y", customer: "cus_2", mode: "payment", subscription: null, customer_details: { email: "b@b.com" } } },
    });
    expect(a).toMatchObject({ type: "grant", plan: "lifetime", subId: null });
  });
});

describe("handleWebhook grant", () => {
  it("rejects a bad signature with 400", async () => {
    const req = new Request("https://w/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: "{}" });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(400);
  });

  it("grants pro on a subscription checkout: paid, email, cust, sub", async () => {
    const req = await signed({
      id: "evt_g1", type: "checkout.session.completed",
      data: { object: { client_reference_id: "device-grant-1", customer: "cus_g1", mode: "subscription", subscription: "sub_g1", customer_details: { email: "Grant@Example.com" } } },
    });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true });

    const flag = await env.PAID.get<PaidFlag>("paid:device-grant-1", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active", plan: "annual", customerId: "cus_g1", subId: "sub_g1", email: "grant@example.com" });
    expect(flag?.periodEnd).toBeGreaterThan(NOW);
    expect(await env.PAID.get("email:grant@example.com")).toBe("device-grant-1");
    expect(await env.PAID.get("sub:sub_g1")).toBe("device-grant-1");
    expect(JSON.parse((await env.PAID.get("cust:cus_g1"))!)).toEqual(["device-grant-1"]);
  });

  it("grants lifetime on a payment checkout (no sub index)", async () => {
    const req = await signed({
      id: "evt_g2", type: "checkout.session.completed",
      data: { object: { client_reference_id: "device-grant-2", customer: "cus_g2", mode: "payment", subscription: null, customer_details: { email: "life@example.com" } } },
    });
    await handleWebhook(req, env as Env, NOW);
    const flag = await env.PAID.get<PaidFlag>("paid:device-grant-2", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active", plan: "lifetime", subId: null });
    expect(flag?.periodEnd).toBeNull(); // lifetime carries periodEnd null (sentinel retired, spec §3)
    expect(await env.PAID.get("sub:null")).toBeNull();
  });

  it("ignores a checkout with no client_reference_id (200, no write)", async () => {
    const req = await signed({
      id: "evt_g3", type: "checkout.session.completed",
      data: { object: { client_reference_id: null, customer: "cus_g3", mode: "subscription", subscription: "sub_g3" } },
    });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    expect(await env.PAID.get("sub:sub_g3")).toBeNull();
  });
});
