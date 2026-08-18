import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleWebhook } from "../src/billing/webhook";
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

describe("corrupt consent record must not block the grant", () => {
  it("still grants Pro when the consent key holds unreadable JSON", async () => {
    await env.PAID.put("consent:cs_corrupt", "{not-valid-json");
    const req = await signed({
      id: "evt_corrupt", type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_corrupt", client_reference_id: "dev-corrupt-1", customer: "cus_x",
          mode: "payment", customer_details: { email: "a@b.com" },
        },
      },
    });
    const res = await handleWebhook(req, env as Env, NOW);
    expect(res.status).toBe(200);
    const flag = await env.PAID.get<PaidFlag>("paid:dev-corrupt-1", "json");
    expect(flag?.tier).toBe("pro"); // customer PAID — they must get what they bought
  });
});
