import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { isFlagActive, appendDevice, forEachCustomerDevice } from "../src/billing/kv-ops";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000;
const flag = (over: Partial<PaidFlag> = {}): PaidFlag => ({ tier: "pro", status: "active", plan: "annual", periodEnd: NOW + 100, customerId: "c", subId: "s", email: "e@e.com", ...over });

describe("isFlagActive", () => {
  it("true for active + future period", () => expect(isFlagActive(flag(), NOW)).toBe(true));
  it("false for null", () => expect(isFlagActive(null, NOW)).toBe(false));
  it("false at the exact boundary (periodEnd === nowSec)", () => expect(isFlagActive(flag({ periodEnd: NOW }), NOW)).toBe(false));
  it("false for null periodEnd", () => expect(isFlagActive(flag({ periodEnd: null }), NOW)).toBe(false));
  it("false when canceled even if period is future", () => expect(isFlagActive(flag({ status: "canceled" }), NOW)).toBe(false));
  // Plan-driven expiry (spec §3): lifetime never time-expires; the 100-year periodEnd sentinel is retired.
  it("lifetime is active with periodEnd null (sentinel retired)", () =>
    expect(isFlagActive(flag({ plan: "lifetime", periodEnd: null }), NOW)).toBe(true));
  it("lifetime with an old 100-year sentinel periodEnd still reads active (migration-safe)", () =>
    expect(isFlagActive(flag({ plan: "lifetime", periodEnd: NOW + 100 * 365 * 86400 }), NOW)).toBe(true));
  it("a canceled lifetime is NOT active (terminal status wins over the lifetime short-circuit)", () =>
    expect(isFlagActive(flag({ plan: "lifetime", status: "canceled", periodEnd: null }), NOW)).toBe(false));
  it("isFlagActive keeps a past_due flag Pro until its periodEnd (already-paid period)", () => {
    const base = { tier: "pro", plan: "annual", periodEnd: 2000, customerId: "c", subId: "s", email: "e" } as const;
    expect(isFlagActive({ ...base, status: "past_due" }, 1000)).toBe(true);   // within paid period
    expect(isFlagActive({ ...base, status: "past_due" }, 3000)).toBe(false);  // period ended
    expect(isFlagActive({ ...base, status: "canceled" }, 1000)).toBe(false);  // canceled never active
  });
});

describe("appendDevice", () => {
  it("dedupes", async () => {
    await appendDevice(env as Env, "cus_ap", "d1");
    await appendDevice(env as Env, "cus_ap", "d1");
    await appendDevice(env as Env, "cus_ap", "d2");
    expect(JSON.parse((await env.PAID.get("cust:cus_ap"))!)).toEqual(["d1", "d2"]);
  });
  it("no-ops on empty customerId/deviceId", async () => {
    await appendDevice(env as Env, "", "d");
    await appendDevice(env as Env, "cus_x", "");
    expect(await env.PAID.get("cust:")).toBeNull();
  });
});

describe("forEachCustomerDevice", () => {
  it("mutates every existing device flag and skips missing ones", async () => {
    await env.PAID.put("paid:fe1", JSON.stringify(flag()));
    await env.PAID.put("paid:fe2", JSON.stringify(flag()));
    await env.PAID.put("cust:cus_fe", JSON.stringify(["fe1", "fe2", "fe-missing"]));
    await forEachCustomerDevice(env as Env, "cus_fe", (f) => { f.status = "canceled"; });
    expect((await env.PAID.get<PaidFlag>("paid:fe1", "json"))?.status).toBe("canceled");
    expect((await env.PAID.get<PaidFlag>("paid:fe2", "json"))?.status).toBe("canceled");
    expect(await env.PAID.get("paid:fe-missing")).toBeNull(); // skipped, not created
  });
  it("no-ops on empty/missing customer", async () => {
    await forEachCustomerDevice(env as Env, "", () => { throw new Error("should not run"); });
    await forEachCustomerDevice(env as Env, "cus_none", () => { throw new Error("should not run"); });
  });
});
