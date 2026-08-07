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

function flag(over: Partial<PaidFlag> = {}): PaidFlag {
  return { tier: "pro", status: "active", plan: "annual", periodEnd: NOW + 100, customerId: "cus_d", subId: "sub_d", email: "d@e.com", ...over };
}

describe("handleWebhook dunning", () => {
  it("invoice.payment_failed sets active devices to past_due and leaves periodEnd unchanged", async () => {
    const futureEnd = NOW + 300 * 86400;
    await env.PAID.put("paid:dev-d", JSON.stringify(flag({ status: "active", periodEnd: futureEnd })));
    await env.PAID.put("cust:cus_d", JSON.stringify(["dev-d"]));
    const req = await signed({ id: "evt_dun_fail", type: "invoice.payment_failed", data: { object: { customer: "cus_d" } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    const f = await env.PAID.get<PaidFlag>("paid:dev-d", "json");
    expect(f?.status).toBe("past_due");
    expect(f?.periodEnd).toBe(futureEnd); // unchanged
  });

  it("invoice.paid sets devices back to active and bumps periodEnd from the invoice line period end", async () => {
    await env.PAID.put("paid:dev-d", JSON.stringify(flag({ status: "past_due", periodEnd: NOW + 300 * 86400 })));
    await env.PAID.put("cust:cus_d", JSON.stringify(["dev-d"]));
    const req = await signed({ id: "evt_dun_paid", type: "invoice.paid", data: { object: { customer: "cus_d", lines: { data: [{ period: { end: 4102444800 } }] } } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    const f = await env.PAID.get<PaidFlag>("paid:dev-d", "json");
    expect(f?.status).toBe("active");
    expect(f?.periodEnd).toBe(4102444800);
  });
});
