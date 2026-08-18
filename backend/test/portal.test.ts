import { env, fetchMock } from "cloudflare:test";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { handlePortal } from "../src/billing/portal";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000;

function flag(over: Partial<PaidFlag> = {}): PaidFlag {
  return { tier: "pro", status: "active", plan: "annual", periodEnd: NOW + 86400, customerId: "cus_1", subId: "sub_1", email: "a@b.com", ...over };
}
const req = (deviceId?: string) =>
  new Request("https://w/portal", { method: "POST", headers: deviceId ? { "X-Device-Id": deviceId } : {} });

beforeAll(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
afterEach(() => { try { fetchMock.assertNoPendingInterceptors(); } catch { /* none pending */ } });

describe("handlePortal", () => {
  it("mints a portal session for a device holding an active entitlement", async () => {
    await env.PAID.put("paid:dev-ok-123", JSON.stringify(flag()));
    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/billing_portal/sessions", method: "POST" })
      .reply(200, { url: "https://billing.stripe.com/session/xyz" });

    const res = await handlePortal(req("dev-ok-123"), env as Env, NOW);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: "https://billing.stripe.com/session/xyz" });
  });

  it("refuses a device with no entitlement", async () => {
    const res = await handlePortal(req("dev-none-123"), env as Env, NOW);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, reason: "no_entitlement" });
  });

  it("refuses an EXPIRED entitlement", async () => {
    await env.PAID.put("paid:dev-exp-123", JSON.stringify(flag({ periodEnd: NOW - 1 })));
    const res = await handlePortal(req("dev-exp-123"), env as Env, NOW);
    expect(res.status).toBe(403);
  });

  it("refuses a CANCELED entitlement even within the period", async () => {
    await env.PAID.put("paid:dev-can-123", JSON.stringify(flag({ status: "canceled" })));
    const res = await handlePortal(req("dev-can-123"), env as Env, NOW);
    expect(res.status).toBe(403);
  });

  it("STILL SERVES a past_due device — fixing the card is the whole point", async () => {
    await env.PAID.put("paid:dev-pd-123", JSON.stringify(flag({ status: "past_due" })));
    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/billing_portal/sessions", method: "POST" })
      .reply(200, { url: "https://billing.stripe.com/session/pd" });

    const res = await handlePortal(req("dev-pd-123"), env as Env, NOW);
    expect(res.status).toBe(200);
  });

  it("refuses a missing X-Device-Id", async () => {
    const res = await handlePortal(req(), env as Env, NOW);
    expect(res.status).toBe(403);
  });

  it("sends the customer id to Stripe, form-encoded", async () => {
    await env.PAID.put("paid:dev-body-123", JSON.stringify(flag({ customerId: "cus_body" })));
    let sent = "";
    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/billing_portal/sessions", method: "POST" })
      .reply(200, (opts) => { sent = String(opts.body ?? ""); return { url: "https://billing.stripe.com/s/b" }; });

    await handlePortal(req("dev-body-123"), env as Env, NOW);
    expect(new URLSearchParams(sent).get("customer")).toBe("cus_body");
  });

  it("surfaces a Stripe failure as stripe_error and never leaks Stripe's body", async () => {
    await env.PAID.put("paid:dev-err-123", JSON.stringify(flag({ customerId: "cus_err" })));
    fetchMock.get("https://api.stripe.com")
      .intercept({ path: "/v1/billing_portal/sessions", method: "POST" })
      .reply(400, { error: { message: "No such customer: cus_other_tenant" } });

    const res = await handlePortal(req("dev-err-123"), env as Env, NOW);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, reason: "stripe_error" });
    expect(JSON.stringify(body)).not.toContain("cus_other_tenant");
  });
});
