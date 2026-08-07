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

function activeFlag(sub: string, cus: string): PaidFlag {
  return { tier: "pro", status: "active", plan: "annual", periodEnd: NOW + 10_000, customerId: cus, subId: sub, email: "r@e.com" };
}

describe("handleWebhook revoke cascade", () => {
  it("sets status=canceled on EVERY device in the cust: list on subscription.deleted", async () => {
    await env.PAID.put("paid:device-r1", JSON.stringify(activeFlag("sub_r", "cus_r")));
    await env.PAID.put("paid:device-r2", JSON.stringify(activeFlag("sub_r", "cus_r")));
    await env.PAID.put("cust:cus_r", JSON.stringify(["device-r1", "device-r2"]));
    await env.PAID.put("sub:sub_r", "device-r1");

    const req = await signed({ id: "evt_rev", type: "customer.subscription.deleted", data: { object: { id: "sub_r", status: "canceled", customer: "cus_r" } } });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    expect((await env.PAID.get<PaidFlag>("paid:device-r1", "json"))?.status).toBe("canceled");
    expect((await env.PAID.get<PaidFlag>("paid:device-r2", "json"))?.status).toBe("canceled");
  });

  it("revokes on subscription.updated with a non-active status", async () => {
    await env.PAID.put("paid:device-r3", JSON.stringify(activeFlag("sub_r3", "cus_r3")));
    await env.PAID.put("cust:cus_r3", JSON.stringify(["device-r3"]));
    const req = await signed({ id: "evt_rev2", type: "customer.subscription.updated", data: { object: { id: "sub_r3", status: "past_due", customer: "cus_r3" } } });
    await handleWebhook(req, env as Env, NOW);
    expect((await env.PAID.get<PaidFlag>("paid:device-r3", "json"))?.status).toBe("canceled");
  });

  it("keeps the device active on subscription.updated with status=active", async () => {
    await env.PAID.put("paid:device-r4", JSON.stringify(activeFlag("sub_r4", "cus_r4")));
    await env.PAID.put("cust:cus_r4", JSON.stringify(["device-r4"]));
    const req = await signed({ id: "evt_upd", type: "customer.subscription.updated", data: { object: { id: "sub_r4", status: "active", customer: "cus_r4" } } });
    await handleWebhook(req, env as Env, NOW);
    expect((await env.PAID.get<PaidFlag>("paid:device-r4", "json"))?.status).toBe("active");
  });
});
