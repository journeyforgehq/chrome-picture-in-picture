import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deriveUninstallUrl } from "../src/billing/config";

const ENV_KEYS = [
  "BACKEND_BASE_URL",
  "STRIPE_MONTHLY_URL",
  "STRIPE_ANNUAL_URL",
  "STRIPE_LIFETIME_URL",
  "WELCOME_URL",
  "ACCENT",
  "DEV_PRO",
] as const;

async function loadConfig() {
  // Fresh module registry per test so re-reading process.env picks up
  // the values set in that test (config.ts reads env at import time).
  vi.resetModules();
  return import("../src/billing/config");
}

describe("config", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it("provides sane defaults when no env vars are set", async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    const { config } = await loadConfig();

    expect(config.BACKEND_BASE_URL).toBe("http://localhost:8787");
    expect(config.STRIPE_LINKS).toEqual({ monthly: "", annual: "", lifetime: "" });
    expect(config.WELCOME_URL).toBe("");
    expect(config.ACCENT).toBe("#1677ff");
    expect(config.DEV_PRO).toBe(false);
  });

  it("reflects overrides from process.env", async () => {
    process.env.BACKEND_BASE_URL = "https://api.example.com";
    process.env.STRIPE_MONTHLY_URL = "https://buy.stripe.com/monthly";
    process.env.STRIPE_ANNUAL_URL = "https://buy.stripe.com/annual";
    process.env.STRIPE_LIFETIME_URL = "https://buy.stripe.com/lifetime";
    process.env.WELCOME_URL = "https://example.com/welcome";
    process.env.ACCENT = "#ff0000";
    process.env.DEV_PRO = "true";

    const { config } = await loadConfig();

    expect(config.BACKEND_BASE_URL).toBe("https://api.example.com");
    expect(config.STRIPE_LINKS).toEqual({
      monthly: "https://buy.stripe.com/monthly",
      annual: "https://buy.stripe.com/annual",
      lifetime: "https://buy.stripe.com/lifetime",
    });
    expect(config.WELCOME_URL).toBe("https://example.com/welcome");
    expect(config.ACCENT).toBe("#ff0000");
    expect(config.DEV_PRO).toBe(true);
  });

  it("populates STRIPE_LINKS.monthly from process.env.STRIPE_MONTHLY_URL", async () => {
    process.env.STRIPE_MONTHLY_URL = "https://buy.stripe.com/monthly";
    const { config } = await loadConfig();
    expect(config.STRIPE_LINKS.monthly).toBe("https://buy.stripe.com/monthly");
  });

  it("treats any DEV_PRO value other than the string 'true' as false", async () => {
    process.env.DEV_PRO = "1";
    const { config } = await loadConfig();
    expect(config.DEV_PRO).toBe(false);
  });
});

describe("deriveUninstallUrl", () => {
  it("returns '' for an empty welcome url", () => {
    expect(deriveUninstallUrl("")).toBe("");
  });
  it("appends /uninstall, stripping a trailing slash", () => {
    expect(deriveUninstallUrl("https://site.pages.dev/")).toBe("https://site.pages.dev/uninstall");
    expect(deriveUninstallUrl("https://site.pages.dev")).toBe("https://site.pages.dev/uninstall");
  });
});
