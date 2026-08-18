import { env, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { handleCheckout } from "../src/billing/checkout";
import type { CheckoutRequest, ConsentRecord } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000; // 2027-01-15T08:00:00Z -> day 2027-01-15
const DAY = "2027-01-15";

function req(body: Partial<CheckoutRequest>, deviceId: string | null = "device-abcdefgh", ip?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (deviceId) headers["X-Device-Id"] = deviceId;
  if (ip) headers["CF-Connecting-IP"] = ip;
  return new Request("https://w/checkout", { method: "POST", headers, body: JSON.stringify(body) });
}

/** Intercept one POST to Stripe's Checkout Sessions API, capturing the form body. */
function interceptSession(reply: object, capture?: (body: string) => void, times = 1): void {
  fetchMock
    .get("https://api.stripe.com")
    .intercept({ path: "/v1/checkout/sessions", method: "POST" })
    .reply(200, (opts) => {
      capture?.(String(opts.body ?? ""));
      return reply;
    })
    .times(times);
}

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => { try { fetchMock.assertNoPendingInterceptors(); } catch { /* none pending */ } });

describe("handleCheckout", () => {
  it("creates a Checkout Session and returns its url", async () => {
    interceptSession({ id: "cs_ok_1", url: "https://checkout.stripe.com/c/pay/cs_ok_1" });

    const res = await handleCheckout(
      req({ plan: "lifetime", priceShown: "$29", termsVersion: "2026-01-01" }),
      env as Env,
      NOW,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_ok_1" });
  });

  it("persists a consent record keyed by session id", async () => {
    interceptSession({ id: "cs_consent_1", url: "https://checkout.stripe.com/c/pay/cs_consent_1" });

    await handleCheckout(
      req({ plan: "lifetime", priceShown: "$29", termsVersion: "2026-01-01" }, "device-consent-1", "203.0.113.7"),
      env as Env,
      NOW,
    );

    const consent = await env.PAID.get<ConsentRecord>("consent:cs_consent_1", "json");
    expect(consent).toEqual({
      at: NOW,
      priceShown: "$29",
      plan: "lifetime",
      app: "test-app",
      termsVersion: "2026-01-01",
      ip: "203.0.113.7",
    });
  });

  it("records an empty ip when CF-Connecting-IP is unavailable", async () => {
    interceptSession({ id: "cs_noip", url: "https://checkout.stripe.com/c/pay/cs_noip" });
    await handleCheckout(req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, "device-noip-01"), env as Env, NOW);
    const consent = await env.PAID.get<ConsentRecord>("consent:cs_noip", "json");
    expect(consent?.ip).toBe("");
  });

  it("sends client_reference_id, metadata[app], metadata[plan] and the descriptor suffix on a PAYMENT session", async () => {
    let sent = "";
    interceptSession({ id: "cs_body_1", url: "https://checkout.stripe.com/c/pay/cs_body_1" }, (b) => { sent = b; });

    await handleCheckout(
      req({ plan: "lifetime", priceShown: "$29", termsVersion: "2026-01-01" }, "device-body-01"),
      env as Env,
      NOW,
    );

    const p = new URLSearchParams(sent);
    expect(p.get("mode")).toBe("payment");
    expect(p.get("line_items[0][price]")).toBe("price_lifetime_test");
    expect(p.get("line_items[0][quantity]")).toBe("1");
    expect(p.get("client_reference_id")).toBe("device-body-01");
    expect(p.get("metadata[app]")).toBe("test-app");
    expect(p.get("metadata[plan]")).toBe("lifetime");
    expect(p.get("payment_intent_data[statement_descriptor_suffix]")).toBe("TESTAPP");
  });

  it("NEVER sends payment_intent_data[statement_descriptor_suffix] on a SUBSCRIPTION session", async () => {
    let sent = "";
    interceptSession({ id: "cs_sub_1", url: "https://checkout.stripe.com/c/pay/cs_sub_1" }, (b) => { sent = b; });

    await handleCheckout(
      req({ plan: "annual", priceShown: "$19/yr", termsVersion: "2026-01-01" }, "device-sub-001"),
      env as Env,
      NOW,
    );

    const p = new URLSearchParams(sent);
    expect(p.get("mode")).toBe("subscription");
    // Stripe REJECTS a per-session descriptor on subscription mode (it derives it
    // from the Product), so this must be absent — not empty, absent.
    expect(p.get("payment_intent_data[statement_descriptor_suffix]")).toBeNull();
    expect(p.has("payment_intent_data[statement_descriptor_suffix]")).toBe(false);
    expect([...p.keys()].some((k) => k.includes("statement_descriptor"))).toBe(false);
    expect(sent).not.toContain("statement_descriptor");
  });

  it("rejects a plan with no configured price id -> 400 not_configured", async () => {
    const res = await handleCheckout(
      req({ plan: "monthly", priceShown: "$5/mo", termsVersion: "v1" }, "device-nocfg-1"),
      env as Env,
      NOW,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: "not_configured" });
  });

  it("rejects an unknown plan -> 400 bad_plan", async () => {
    const res = await handleCheckout(
      req({ plan: "forever" as CheckoutRequest["plan"], priceShown: "$1", termsVersion: "v1" }, "device-badplan"),
      env as Env,
      NOW,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, reason: "bad_plan" });
  });

  it("rejects a missing / too-short X-Device-Id -> 400 bad_plan", async () => {
    const noHeader = await handleCheckout(req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, null), env as Env, NOW);
    expect(noHeader.status).toBe(400);
    const short = await handleCheckout(req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, "short"), env as Env, NOW);
    expect(short.status).toBe(400);
  });

  it("rate-limits a device after 10 attempts in a UTC day -> 429", async () => {
    interceptSession({ id: "cs_rl", url: "https://checkout.stripe.com/c/pay/cs_rl" }, undefined, 10);

    for (let i = 0; i < 10; i++) {
      const res = await handleCheckout(
        req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, "device-ratelimit"),
        env as Env,
        NOW,
      );
      expect(res.status).toBe(200);
    }
    expect(await env.PAID.get(`checkout:device-ratelimit:${DAY}`)).toBe("10");

    const blocked = await handleCheckout(
      req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, "device-ratelimit"),
      env as Env,
      NOW,
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("returns 502 stripe_error on a Stripe failure and never leaks Stripe's body", async () => {
    fetchMock
      .get("https://api.stripe.com")
      .intercept({ path: "/v1/checkout/sessions", method: "POST" })
      .reply(400, { error: { message: "No such price for customer cus_other_tenant" } });

    const res = await handleCheckout(
      req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, "device-stripe-err"),
      env as Env,
      NOW,
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, reason: "stripe_error" });
    expect(JSON.stringify(body)).not.toContain("cus_other_tenant");
    // and no consent is banked for a session that was never created
    expect(await env.PAID.get("consent:cs_ok_1")).toBeNull();
  });

  it("returns 502 when Stripe answers 200 with no url", async () => {
    interceptSession({ id: "cs_nourl" });
    const res = await handleCheckout(
      req({ plan: "lifetime", priceShown: "$29", termsVersion: "v1" }, "device-nourl-01"),
      env as Env,
      NOW,
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, reason: "stripe_error" });
  });
});
