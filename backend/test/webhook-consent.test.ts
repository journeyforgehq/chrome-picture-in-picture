import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleWebhook, actionFromEvent } from "../src/billing/webhook";
import type { ConsentRecord, PaidFlag } from "../src/contract";
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

const consent: ConsentRecord = {
  at: NOW - 60,
  priceShown: "$29",
  plan: "lifetime",
  app: "test-app",
  termsVersion: "2026-01-01",
  ip: "203.0.113.9",
};

describe("consent folded into the entitlement on grant", () => {
  it("carries the session id on the grant action (pure mapping, no KV)", () => {
    const a = actionFromEvent({
      id: "evt_c0", type: "checkout.session.completed",
      data: { object: { id: "cs_c0", client_reference_id: "device-c0", customer: "cus_c0", mode: "payment" } },
    });
    expect(a).toMatchObject({ type: "grant", sessionId: "cs_c0" });
  });

  it("copies the pending consent record onto the granted PaidFlag", async () => {
    await env.PAID.put("consent:cs_c1", JSON.stringify(consent));
    const req = await signed({
      id: "evt_c1", type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_c1", client_reference_id: "device-consent-w1", customer: "cus_c1",
          mode: "payment", subscription: null, customer_details: { email: "c1@example.com" },
        },
      },
    });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    const flag = await env.PAID.get<PaidFlag>("paid:device-consent-w1", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active", plan: "lifetime" });
    expect(flag?.consent).toEqual(consent);
  });

  it("grants cleanly with NO consent record and leaves `consent` ABSENT (Payment Link rollback path)", async () => {
    const req = await signed({
      id: "evt_c2", type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_c2", client_reference_id: "device-consent-w2", customer: "cus_c2",
          mode: "subscription", subscription: "sub_c2", customer_details: { email: "c2@example.com" },
        },
      },
    });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    const raw = await env.PAID.get("paid:device-consent-w2");
    const flag = JSON.parse(raw!) as PaidFlag;
    expect(flag).toMatchObject({ tier: "pro", status: "active", plan: "annual" });
    expect("consent" in flag).toBe(false);
    expect(raw).not.toContain("consent");
  });

  it("grants cleanly when the session carries no id at all (legacy Payment Link event)", async () => {
    const req = await signed({
      id: "evt_c3", type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "device-consent-w3", customer: "cus_c3",
          mode: "payment", subscription: null, customer_details: { email: "c3@example.com" },
        },
      },
    });
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);
    const flag = await env.PAID.get<PaidFlag>("paid:device-consent-w3", "json");
    expect(flag).toMatchObject({ tier: "pro", plan: "lifetime" });
    expect(flag?.consent).toBeUndefined();
  });
});
