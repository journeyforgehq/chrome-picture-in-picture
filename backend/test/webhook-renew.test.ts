import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleWebhook, actionFromEvent } from "../src/billing/webhook";
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

function flag(over: Partial<PaidFlag> = {}): PaidFlag {
  return { tier: "pro", status: "active", plan: "annual", periodEnd: NOW + 100, customerId: "cus_rn", subId: "sub_rn", email: "n@e.com", ...over };
}

describe("actionFromEvent renew", () => {
  it("maps subscription.updated with active status to a renew carrying current_period_end", () => {
    const a = actionFromEvent({ id: "e", type: "customer.subscription.updated", data: { object: { id: "sub_rn", status: "active", customer: "cus_rn", current_period_end: NOW + 999 } } });
    expect(a).toMatchObject({ type: "renew", customerId: "cus_rn", periodEnd: NOW + 999 });
  });
  it("maps trialing the same way", () => {
    const a = actionFromEvent({ id: "e", type: "customer.subscription.updated", data: { object: { id: "s", status: "trialing", customer: "cus_rn", current_period_end: NOW + 5 } } });
    expect(a).toMatchObject({ type: "renew", periodEnd: NOW + 5 });
  });
});

describe("handleWebhook renew", () => {
  it("refreshes periodEnd on every device of the customer on active renewal", async () => {
    await env.PAID.put("paid:device-rn1", JSON.stringify(flag()));
    await env.PAID.put("paid:device-rn2", JSON.stringify(flag()));
    await env.PAID.put("cust:cus_rn", JSON.stringify(["device-rn1", "device-rn2"]));
    const newEnd = NOW + 400 * 86400;
    const req = await signed({ id: "evt_rn", type: "customer.subscription.updated", data: { object: { id: "sub_rn", status: "active", customer: "cus_rn", current_period_end: newEnd } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    expect((await env.PAID.get<PaidFlag>("paid:device-rn1", "json"))?.periodEnd).toBe(newEnd);
    expect((await env.PAID.get<PaidFlag>("paid:device-rn2", "json"))?.periodEnd).toBe(newEnd);
    expect((await env.PAID.get<PaidFlag>("paid:device-rn1", "json"))?.status).toBe("active");
  });

  it("customer.subscription.created (active) refreshes periodEnd from current_period_end", async () => {
    await env.PAID.put("paid:device-rnc", JSON.stringify(flag({ plan: "annual", customerId: "cus_rnc", periodEnd: NOW + 55 })));
    await env.PAID.put("cust:cus_rnc", JSON.stringify(["device-rnc"]));
    const newEnd = 1893456000;
    const req = await signed({ id: "evt_rnc", type: "customer.subscription.created", data: { object: { id: "sub_rnc", status: "active", customer: "cus_rnc", current_period_end: newEnd } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    const f = await env.PAID.get<PaidFlag>("paid:device-rnc", "json");
    expect(f?.periodEnd).toBe(newEnd);
    expect(f?.status).toBe("active");
  });

  it("reactivates a canceled device on renewal (status->active, periodEnd bumped)", async () => {
    await env.PAID.put("paid:device-rn3", JSON.stringify(flag({ status: "canceled", periodEnd: NOW - 10, customerId: "cus_rn3" })));
    await env.PAID.put("cust:cus_rn3", JSON.stringify(["device-rn3"]));
    const newEnd = NOW + 400 * 86400;
    const req = await signed({ id: "evt_rn3", type: "customer.subscription.updated", data: { object: { id: "sub_rn3", status: "active", customer: "cus_rn3", current_period_end: newEnd } } });
    await handleWebhook(req, env as Env, NOW);
    const f = await env.PAID.get<PaidFlag>("paid:device-rn3", "json");
    expect(f?.status).toBe("active");
    expect(f?.periodEnd).toBe(newEnd);
  });

  it("ignores an active update with no current_period_end (no-op, leaves flag unchanged)", async () => {
    await env.PAID.put("paid:device-rn4", JSON.stringify(flag({ customerId: "cus_rn4", periodEnd: NOW + 55 })));
    await env.PAID.put("cust:cus_rn4", JSON.stringify(["device-rn4"]));
    const req = await signed({ id: "evt_rn4", type: "customer.subscription.updated", data: { object: { id: "sub_rn4", status: "active", customer: "cus_rn4" } } });
    await handleWebhook(req, env as Env, NOW);
    const f = await env.PAID.get<PaidFlag>("paid:device-rn4", "json");
    expect(f?.periodEnd).toBe(NOW + 55); // unchanged
    expect(f?.status).toBe("active");
  });
});
