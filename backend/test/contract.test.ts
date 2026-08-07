import { describe, it, expect } from "vitest";
import { ERROR_CATALOG, errorFor, type Tier, type MeResponse, type RestoreRequest } from "../src/contract";

describe("contract error catalog", () => {
  it("maps the four billing statuses to semantic names + messages", () => {
    expect(ERROR_CATALOG[402]).toMatchObject({ name: "upgrade_required" });
    expect(ERROR_CATALOG[429]).toMatchObject({ name: "rate_limited" });
    expect(ERROR_CATALOG[413]).toMatchObject({ name: "too_long" });
    expect(ERROR_CATALOG[500]).toMatchObject({ name: "unavailable" });
  });

  it("errorFor returns {status,name,message} and falls back to unavailable", () => {
    expect(errorFor(429)).toEqual({ status: 429, name: "rate_limited", message: ERROR_CATALOG[429].message });
    expect(errorFor(418)).toEqual({ status: 500, name: "unavailable", message: ERROR_CATALOG[500].message });
  });

  it("exposes the wire types", () => {
    const t: Tier = "pro";
    const me: MeResponse = { tier: t, plan: "annual", status: "active" };
    const rr: RestoreRequest = { email: "a@b.com", deviceId: "device-xxxxxxxx" };
    expect(me.tier).toBe("pro");
    expect(rr.email).toBe("a@b.com");
  });
});
