import { describe, it, expect } from "vitest";
import { assertBillingConfig, isDevForcePro, devForceProTier, appVersion, type Env } from "../src/billing/config";

function baseEnv(over: Partial<Env> = {}): Env {
  return {
    PAID: {} as unknown as KVNamespace,
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: "whsec_test_123",
    ENVIRONMENT: "production",
    APP_VERSION: "1.2.3",
    ...over,
  };
}

describe("assertBillingConfig", () => {
  it("passes when both Stripe secrets are present", () => {
    expect(() => assertBillingConfig(baseEnv())).not.toThrow();
  });

  it("throws when a required secret is missing in production", () => {
    expect(() => assertBillingConfig(baseEnv({ STRIPE_SECRET_KEY: "" }))).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => assertBillingConfig(baseEnv({ STRIPE_WEBHOOK_SECRET: "" }))).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("does NOT throw on missing secrets when dev-force-pro short-circuits billing", () => {
    const env = baseEnv({ STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", ENVIRONMENT: "dev", DEV_FORCE_PRO: "1" });
    expect(() => assertBillingConfig(env)).not.toThrow();
  });
});

describe("isDevForcePro", () => {
  it("is true only when ENVIRONMENT=dev AND DEV_FORCE_PRO=1", () => {
    expect(isDevForcePro(baseEnv({ ENVIRONMENT: "dev", DEV_FORCE_PRO: "1" }))).toBe(true);
    expect(isDevForcePro(baseEnv({ ENVIRONMENT: "production", DEV_FORCE_PRO: "1" }))).toBe(false);
    expect(isDevForcePro(baseEnv({ ENVIRONMENT: "dev", DEV_FORCE_PRO: undefined }))).toBe(false);
  });
});

describe("devForceProTier", () => {
  it("returns a pro tier payload when forced, else null", () => {
    expect(devForceProTier(baseEnv({ ENVIRONMENT: "dev", DEV_FORCE_PRO: "1" }))).toEqual({
      tier: "pro",
      plan: "lifetime",
      status: "active",
    });
    expect(devForceProTier(baseEnv())).toBeNull();
  });
});

describe("appVersion", () => {
  it("returns APP_VERSION or a fallback", () => {
    expect(appVersion(baseEnv({ APP_VERSION: "1.2.3" }))).toBe("1.2.3");
    expect(appVersion(baseEnv({ APP_VERSION: "" }))).toBe("0.0.0");
  });
});
