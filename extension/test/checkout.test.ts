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

describe("startCheckout", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.BACKEND_BASE_URL = "https://api.example.com";
    process.env.STRIPE_MONTHLY_URL = "https://buy.stripe.com/monthly-link";
    process.env.STRIPE_ANNUAL_URL = "https://buy.stripe.com/annual-link";
    process.env.STRIPE_LIFETIME_URL = "https://buy.stripe.com/lifetime-link?promo=launch";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: unknown) {
    const fetchMock = vi.fn(impl as never);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("session mode POSTs to /checkout with the device header and returns the Stripe url", async () => {
    process.env.CHECKOUT_MODE = "session";
    const fetchMock = stubFetch(async () => ({
      ok: true,
      json: async () => ({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_123" }),
    }));
    vi.resetModules();
    const { startCheckout, TERMS_VERSION } = await import("../src/billing/checkout");

    const url = await startCheckout("lifetime", "device-abc-123", {
      priceShown: "$29",
      termsVersion: TERMS_VERSION,
    });

    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://api.example.com/checkout");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Device-Id"]).toBe("device-abc-123");
    expect(JSON.parse(init.body as string)).toEqual({
      plan: "lifetime",
      priceShown: "$29",
      termsVersion: TERMS_VERSION,
    });
  });

  it("defaults to session mode when CHECKOUT_MODE is unset", async () => {
    delete process.env.CHECKOUT_MODE;
    const fetchMock = stubFetch(async () => ({
      ok: true,
      json: async () => ({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_default" }),
    }));
    vi.resetModules();
    const { startCheckout } = await import("../src/billing/checkout");

    const url = await startCheckout("lifetime", "device-abc-123", {
      priceShown: "$29",
      termsVersion: "v1",
    });

    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_default");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the backend answers ok:false, so the caller can show an error", async () => {
    process.env.CHECKOUT_MODE = "session";
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ ok: false, reason: "rate_limited" }),
    }));
    vi.resetModules();
    const { startCheckout } = await import("../src/billing/checkout");

    const url = await startCheckout("lifetime", "device-abc-123", {
      priceShown: "$29",
      termsVersion: "v1",
    });

    expect(url).toBeNull();
  });

  it("returns null on a non-2xx HTTP response", async () => {
    process.env.CHECKOUT_MODE = "session";
    stubFetch(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, reason: "rate_limited" }),
    }));
    vi.resetModules();
    const { startCheckout } = await import("../src/billing/checkout");

    expect(
      await startCheckout("lifetime", "device-abc-123", { priceShown: "$29", termsVersion: "v1" })
    ).toBeNull();
  });

  it("never throws on a network error — it resolves to null", async () => {
    process.env.CHECKOUT_MODE = "session";
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.resetModules();
    const { startCheckout } = await import("../src/billing/checkout");

    await expect(
      startCheckout("lifetime", "device-abc-123", { priceShown: "$29", termsVersion: "v1" })
    ).resolves.toBeNull();
  });

  // The rollback path. CHECKOUT_MODE=link must keep shipping the legacy static
  // Payment Link (with client_reference_id) so the money path can be restored by
  // a rebuild, without a store resubmission — so it stays proven, not vestigial.
  it("link mode returns the legacy Payment Link with client_reference_id and never calls fetch", async () => {
    process.env.CHECKOUT_MODE = "link";
    const fetchMock = stubFetch(async () => {
      throw new Error("fetch must not be called in link mode");
    });
    vi.resetModules();
    const { startCheckout } = await import("../src/billing/checkout");

    const url = await startCheckout("lifetime", "device-abc-123", {
      priceShown: "$29",
      termsVersion: "v1",
    });

    expect(url).toBe(
      "https://buy.stripe.com/lifetime-link?promo=launch&client_reference_id=device-abc-123"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("link mode with an unconfigured link", () => {
  beforeEach(() => vi.resetModules());

  it("returns null instead of opening a blank tab when the link is empty", async () => {
    process.env.CHECKOUT_MODE = "link";
    process.env.STRIPE_LIFETIME_URL = "";
    const { startCheckout } = await import("../src/billing/checkout");
    const url = await startCheckout("lifetime", "device-abc-123", { priceShown: "$29", termsVersion: "v1" });
    expect(url).toBeNull();
    delete process.env.CHECKOUT_MODE;
  });
});
