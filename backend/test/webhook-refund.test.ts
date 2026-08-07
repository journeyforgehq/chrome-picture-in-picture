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

function flag(plan: "annual" | "lifetime", cus: string): PaidFlag {
  const periodEnd = plan === "lifetime" ? NOW + 100 * 365 * 86400 : NOW + 31 * 86400;
  return { tier: "pro", status: "active", plan, periodEnd, customerId: cus, subId: null, email: "r@e.com" };
}

describe("handleWebhook refund cascade", () => {
  it("sets status=canceled on EVERY device in the cust: list on charge.refunded", async () => {
    await env.PAID.put("paid:dev-r", JSON.stringify(flag("lifetime", "cus_r")));
    await env.PAID.put("cust:cus_r", JSON.stringify(["dev-r"]));

    const req = await signed({ id: "evt_refund", type: "charge.refunded", data: { object: { customer: "cus_r" } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:dev-r", "json"))?.status).toBe("canceled");
  });

  it("sets status=canceled on EVERY device in the cust: list on charge.dispute.created", async () => {
    await env.PAID.put("paid:dev-r2", JSON.stringify(flag("lifetime", "cus_r2")));
    await env.PAID.put("cust:cus_r2", JSON.stringify(["dev-r2"]));

    const req = await signed({ id: "evt_dispute", type: "charge.dispute.created", data: { object: { customer: "cus_r2" } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:dev-r2", "json"))?.status).toBe("canceled");
  });
});
