import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("checkoutUrl", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_MONTHLY_URL = "https://buy.stripe.com/monthly-link";
    process.env.STRIPE_ANNUAL_URL = "https://buy.stripe.com/annual-link";
    process.env.STRIPE_LIFETIME_URL = "https://buy.stripe.com/lifetime-link?promo=launch";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("appends client_reference_id to a link with no existing query params", async () => {
    vi.resetModules();
    const { checkoutUrl } = await import("../src/billing/checkout");

    const url = checkoutUrl("annual", "device-abc-123");

    expect(url).toBe("https://buy.stripe.com/annual-link?client_reference_id=device-abc-123");
  });

  it("uses the monthly link for the monthly plan", async () => {
    vi.resetModules();
    const { checkoutUrl } = await import("../src/billing/checkout");

    const url = checkoutUrl("monthly", "dev1");

    expect(url).toBe("https://buy.stripe.com/monthly-link?client_reference_id=dev1");
  });

  it("appends client_reference_id to a link that already has query params", async () => {
    vi.resetModules();
    const { checkoutUrl } = await import("../src/billing/checkout");

    const url = checkoutUrl("lifetime", "device-abc-123");

    expect(url).toBe(
      "https://buy.stripe.com/lifetime-link?promo=launch&client_reference_id=device-abc-123"
    );
  });

  it("URL-encodes special characters in the device id", async () => {
    vi.resetModules();
    const { checkoutUrl } = await import("../src/billing/checkout");

    const url = checkoutUrl("annual", "device id/with+special&chars");

    expect(url).toBe(
      "https://buy.stripe.com/annual-link?client_reference_id=device%20id%2Fwith%2Bspecial%26chars"
    );
  });
});
