import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { PaidFlag } from "../src/contract";

async function signedBody(payload: object): Promise<{ body: string; sig: string }> {
  const raw = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("whsec_test_123"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { body: raw, sig: `t=${t},v1=${hex}` };
}

describe("router", () => {
  it("GET /health returns ok + version", async () => {
    const r = await SELF.fetch("https://w/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it("GET /health reports configOk: true under a valid configured env", async () => {
    const r = await SELF.fetch("https://w/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, configOk: true });
  });

  it("isBillingConfigured is false when a required secret is missing (prod)", async () => {
    const { isBillingConfigured } = await import("../src/billing/config");
    expect(isBillingConfigured({
      PAID: {} as any, STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "",
      ENVIRONMENT: "production", APP_VERSION: "t", APP_SLUG: "test-app",
    })).toBe(false);
  });

  it("OPTIONS returns a 204 preflight with CORS", async () => {
    const r = await SELF.fetch("https://w/me", { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Headers")).toContain("X-Device-Id");
  });

  it("GET /me returns free with no device", async () => {
    const r = await SELF.fetch("https://w/me");
    expect(await r.json()).toEqual({ tier: "free" });
  });

  it("unknown path returns 404 not_found", async () => {
    const r = await SELF.fetch("https://w/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });

  it("handleBilling returns null for a non-billing path (slot may add feature routes)", async () => {
    const { handleBilling } = await import("../src/billing/router");
    const res = await handleBilling(new Request("https://x/feature/thing"), env, Math.floor(Date.now() / 1000), Date.now());
    expect(res).toBeNull();
  });

  it("full loop: webhook grants pro, then /me reports pro for that device", async () => {
    const { body, sig } = await signedBody({
      id: "evt_router_1", type: "checkout.session.completed",
      data: { object: { client_reference_id: "device-router-1", customer: "cus_rt", mode: "subscription", subscription: "sub_rt", customer_details: { email: "rt@e.com" } } },
    });
    const wh = await SELF.fetch("https://w/stripe/webhook", { method: "POST", headers: { "stripe-signature": sig }, body });
    expect(await wh.json()).toEqual({ received: true });

    const me = await SELF.fetch("https://w/me", { headers: { "X-Device-Id": "device-router-1" } });
    expect(await me.json()).toMatchObject({ tier: "pro", plan: "annual", status: "active" });

    // sanity: the KV flag exists
    expect((await env.PAID.get<PaidFlag>("paid:device-router-1", "json"))?.tier).toBe("pro");
  });
});
