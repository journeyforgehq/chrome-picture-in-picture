import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleRestore } from "../src/billing/restore";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW_MS = Date.UTC(2026, 6, 2, 12, 0, 0); // 2026-07-02
const NOW_SEC = Math.floor(NOW_MS / 1000);

const restoreReq = (body: object) =>
  new Request("https://w/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function ownerFlag(): PaidFlag {
  return { tier: "pro", status: "active", plan: "annual", periodEnd: NOW_SEC + 86400, customerId: "cus_o", subId: "sub_o", email: "owner@example.com" };
}

describe("handleRestore", () => {
  it("copies an active entitlement to the new device and re-points indices", async () => {
    await env.PAID.put("paid:device-owner-r", JSON.stringify(ownerFlag()));
    await env.PAID.put("email:owner@example.com", "device-owner-r");
    await env.PAID.put("sub:sub_o", "device-owner-r");
    await env.PAID.put("cust:cus_o", JSON.stringify(["device-owner-r"]));

    const r = await handleRestore(restoreReq({ email: "Owner@Example.com", deviceId: "device-newone-r" }), env as Env, NOW_MS);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, tier: "pro", reason: "granted", plan: "annual" });

    const flag = await env.PAID.get<PaidFlag>("paid:device-newone-r", "json");
    expect(flag).toMatchObject({ tier: "pro", status: "active", subId: "sub_o" });
    expect(await env.PAID.get("email:owner@example.com")).toBe("device-newone-r");
    expect(await env.PAID.get("sub:sub_o")).toBe("device-newone-r");
    expect(JSON.parse((await env.PAID.get("cust:cus_o"))!)).toContain("device-newone-r");
  });

  it("returns 200 {ok:false, tier:free, reason:not_found} when the email has no active owner", async () => {
    const r = await handleRestore(restoreReq({ email: "nobody@example.com", deviceId: "device-none-rr" }), env as Env, NOW_MS);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, tier: "free", reason: "not_found" });
  });

  it("returns 400 for missing email or deviceId", async () => {
    const r = await handleRestore(restoreReq({ email: "", deviceId: "" }), env as Env, NOW_MS);
    expect(r.status).toBe(400);
  });

  it("rate-limits after 5 attempts per device per day (6th => 429)", async () => {
    const body = { email: "nobody2@example.com", deviceId: "device-rl-aaaa" };
    for (let i = 0; i < 5; i++) {
      const r = await handleRestore(restoreReq(body), env as Env, NOW_MS);
      expect(r.status).toBe(200); // consumed but not rate-limited (miss is 200, not 404)
    }
    const sixth = await handleRestore(restoreReq(body), env as Env, NOW_MS);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ ok: false });
  });
});
