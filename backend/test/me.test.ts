import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { handleMe } from "../src/billing/me";
import type { PaidFlag } from "../src/contract";
import type { Env } from "../src/billing/config";

const NOW = 1_800_000_000;
const meReq = (deviceId?: string) =>
  new Request("https://w/me", { headers: deviceId ? { "X-Device-Id": deviceId } : {} });

describe("handleMe", () => {
  it("returns free when no device id header is present", async () => {
    const r = await handleMe(meReq(), env as Env, NOW);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ tier: "free" });
  });

  it("returns free when there is no paid flag", async () => {
    const r = await handleMe(meReq("device-nopaidxx"), env as Env, NOW);
    expect(await r.json()).toEqual({ tier: "free" });
  });

  it("returns pro with plan+status for an active flag", async () => {
    const flag: PaidFlag = {
      tier: "pro", status: "active", plan: "annual", periodEnd: NOW + 10_000,
      customerId: "cus_m", subId: "sub_m", email: "m@e.com",
    };
    await env.PAID.put("paid:device-prome-xx", JSON.stringify(flag));
    const r = await handleMe(meReq("device-prome-xx"), env as Env, NOW);
    expect(await r.json()).toEqual({ tier: "pro", plan: "annual", status: "active" });
  });

  it("downgrades to free when the period has ended", async () => {
    const flag: PaidFlag = {
      tier: "pro", status: "active", plan: "annual", periodEnd: NOW - 10,
      customerId: "c", subId: "s", email: "x@e.com",
    };
    await env.PAID.put("paid:device-expme-xx", JSON.stringify(flag));
    const r = await handleMe(meReq("device-expme-xx"), env as Env, NOW);
    expect(await r.json()).toEqual({ tier: "free" });
  });

  it("honors DEV_FORCE_PRO only in dev, ignoring KV", async () => {
    const devEnv = { ...(env as Env), ENVIRONMENT: "dev", DEV_FORCE_PRO: "1" } as Env;
    const r = await handleMe(meReq("device-anything"), devEnv, NOW);
    expect(await r.json()).toEqual({ tier: "pro", plan: "lifetime", status: "active" });

    const prodEnv = { ...(env as Env), ENVIRONMENT: "production", DEV_FORCE_PRO: "1" } as Env;
    const r2 = await handleMe(meReq("device-anything"), prodEnv, NOW);
    expect(await r2.json()).toEqual({ tier: "free" });
  });
});
