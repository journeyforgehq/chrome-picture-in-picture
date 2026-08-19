import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleWebhook, actionFromEvent } from "../src/billing/webhook";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000;

// APP_SLUG for the test Worker comes from vitest.config.ts miniflare bindings.
const OUR_SLUG = "test-app";

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

/** checkout.session.completed shell; `metadata` is spread in only when supplied. */
function checkout(id: string, deviceId: string, metadata?: Record<string, string>) {
  return {
    id: `evt_${id}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${id}`,
        client_reference_id: deviceId,
        customer: `cus_${id}`,
        mode: "payment",
        subscription: null,
        customer_details: { email: `${id}@example.com` },
        ...(metadata ? { metadata } : {}),
      },
    },
  };
}

describe("webhook ignores checkouts belonging to another extension", () => {
  it("IGNORES a foreign app's checkout and writes no paid: record", async () => {
    const req = await signed(checkout("s1", "device-scope-foreign", { app: "other-extension" }));
    const r = await handleWebhook(req, env as Env, NOW);
    // 200, not an error: Stripe must not retry an event that is simply not ours.
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true });

    expect(await env.PAID.get("paid:device-scope-foreign")).toBeNull();
  });

  it("GRANTS our own app's checkout", async () => {
    const req = await signed(checkout("s2", "device-scope-ours", { app: OUR_SLUG }));
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    const flag = await env.PAID.get<PaidFlag>("paid:device-scope-ours", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active", plan: "lifetime" });
  });

  it("GRANTS when the session carries no metadata at all (Payment Link / pre-P5 path)", async () => {
    const req = await signed(checkout("s3", "device-scope-nometa"));
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    const flag = await env.PAID.get<PaidFlag>("paid:device-scope-nometa", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active" });
  });

  it("GRANTS when metadata is present but empty", async () => {
    const req = await signed(checkout("s4", "device-scope-emptymeta", {}));
    const r = await handleWebhook(req, env as Env, NOW);
    expect(r.status).toBe(200);

    const flag = await env.PAID.get<PaidFlag>("paid:device-scope-emptymeta", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active" });
  });

  it("FAILS OPEN: an unset APP_SLUG still grants a foreign event", async () => {
    // Most deployments have not set APP_SLUG yet. Failing closed would silently
    // stop granting for every one of them — far worse than the contamination.
    const noSlug = { ...(env as Env), APP_SLUG: "" } as Env;
    const req = await signed(checkout("s5", "device-scope-noslug", { app: "other-extension" }));
    const r = await handleWebhook(req, noSlug, NOW);
    expect(r.status).toBe(200);

    const flag = await env.PAID.get<PaidFlag>("paid:device-scope-noslug", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active" });
  });
});

describe("actionFromEvent stays pure", () => {
  it("returns ignore for a mismatched app with no env in scope", () => {
    // No `env`, no KV, no fetch — this pins that the guard introduced no I/O.
    const a = actionFromEvent(
      {
        id: "evt_s6", type: "checkout.session.completed",
        data: { object: { id: "cs_s6", client_reference_id: "device-s6", customer: "cus_s6", mode: "payment", metadata: { app: "other-extension" } } },
      },
      "some-app",
    );
    expect(a).toEqual({ type: "ignore" });
  });

  it("returns grant for a matching app", () => {
    const a = actionFromEvent(
      {
        id: "evt_s7", type: "checkout.session.completed",
        data: { object: { id: "cs_s7", client_reference_id: "device-s7", customer: "cus_s7", mode: "payment", metadata: { app: "some-app" } } },
      },
      "some-app",
    );
    expect(a).toMatchObject({ type: "grant", deviceId: "device-s7" });
  });

  it("returns grant when called with no slug at all (existing single-arg callers)", () => {
    const a = actionFromEvent({
      id: "evt_s8", type: "checkout.session.completed",
      data: { object: { id: "cs_s8", client_reference_id: "device-s8", customer: "cus_s8", mode: "payment", metadata: { app: "other-extension" } } },
    });
    expect(a).toMatchObject({ type: "grant", deviceId: "device-s8" });
  });
});
