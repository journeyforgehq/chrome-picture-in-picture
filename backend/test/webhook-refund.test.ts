import { env, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
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

function flag(plan: "annual" | "lifetime", cus: string): PaidFlag {
  const periodEnd = plan === "lifetime" ? NOW + 100 * 365 * 86400 : NOW + 31 * 86400;
  return { tier: "pro", status: "active", plan, periodEnd, customerId: cus, subId: null, email: "r@e.com" };
}

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

describe("handleWebhook refund cascade", () => {
  it("sets status=canceled on EVERY device in the cust: list on charge.refunded", async () => {
    await env.PAID.put("paid:dev-r", JSON.stringify(flag("lifetime", "cus_r")));
    await env.PAID.put("cust:cus_r", JSON.stringify(["dev-r"]));

    const req = await signed({ id: "evt_refund", type: "charge.refunded", data: { object: { customer: "cus_r", refunded: true } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:dev-r", "json"))?.status).toBe("canceled");
  });

  it("revokes on a REAL dispute payload — no customer field, resolved via the charge", async () => {
    await env.PAID.put("paid:dev-r2", JSON.stringify(flag("lifetime", "cus_r2")));
    await env.PAID.put("cust:cus_r2", JSON.stringify(["dev-r2"]));

    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/charges/ch_disputed", method: "GET" })
      .reply(200, { id: "ch_disputed", customer: "cus_r2" });

    // Real Stripe dispute shape: `charge` and `payment_intent`, NO `customer`.
    const req = await signed({
      id: "evt_dispute",
      type: "charge.dispute.created",
      data: { object: { object: "dispute", id: "dp_1", charge: "ch_disputed", payment_intent: "pi_1", reason: "fraudulent", status: "needs_response" } },
    });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:dev-r2", "json"))?.status).toBe("canceled");
  });

  it("revokes nothing when the charge lookup fails", async () => {
    await env.PAID.put("paid:dev-r5", JSON.stringify(flag("lifetime", "cus_r5")));
    await env.PAID.put("cust:cus_r5", JSON.stringify(["dev-r5"]));

    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/charges/ch_gone", method: "GET" })
      .reply(404, { error: { message: "No such charge" } });

    const req = await signed({
      id: "evt_dispute_404",
      type: "charge.dispute.created",
      data: { object: { object: "dispute", charge: "ch_gone" } },
    });
    expect((await handleWebhook(req, env as Env, NOW)).status).toBe(200);

    // Better to revoke nothing than to revoke the wrong customer.
    expect((await env.PAID.get<PaidFlag>("paid:dev-r5", "json"))?.status).toBe("active");
  });

  it("handles an expanded charge object on the dispute", async () => {
    await env.PAID.put("paid:dev-r6", JSON.stringify(flag("lifetime", "cus_r6")));
    await env.PAID.put("cust:cus_r6", JSON.stringify(["dev-r6"]));

    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/charges/ch_exp", method: "GET" })
      .reply(200, { id: "ch_exp", customer: "cus_r6" });

    const req = await signed({
      id: "evt_dispute_exp",
      type: "charge.dispute.created",
      data: { object: { object: "dispute", charge: { id: "ch_exp", object: "charge" } } },
    });
    expect((await handleWebhook(req, env as Env, NOW)).status).toBe(200);
    expect((await env.PAID.get<PaidFlag>("paid:dev-r6", "json"))?.status).toBe("canceled");
  });

  it("leaves entitlement ACTIVE on a partial refund (refunded !== true)", async () => {
    await env.PAID.put("paid:dev-p", JSON.stringify(flag("lifetime", "cus_p")));
    await env.PAID.put("cust:cus_p", JSON.stringify(["dev-p"]));

    const req = await signed({ id: "evt_partial", type: "charge.refunded", data: { object: { customer: "cus_p", refunded: false } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:dev-p", "json"))?.status).toBe("active");
  });

  it("leaves entitlement ACTIVE when `refunded` is ABSENT (untyped payload)", async () => {
    await env.PAID.put("paid:dev-a", JSON.stringify(flag("lifetime", "cus_a")));
    await env.PAID.put("cust:cus_a", JSON.stringify(["dev-a"]));

    const req = await signed({ id: "evt_absent", type: "charge.refunded", data: { object: { customer: "cus_a" } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:dev-a", "json"))?.status).toBe("active");
  });
});
