import { describe, it, expect, vi } from "vitest";
import { createEntitlement } from "../src/billing/entitlement";
import type { StorageArea } from "../src/billing/device-id";

function makeStore(initial: Record<string, unknown> = {}): StorageArea {
  let data: Record<string, unknown> = { ...initial };
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(obj: Record<string, unknown>) {
      data = { ...data, ...obj };
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const DEVICE_ID = "device-123";
const ENDPOINT = "https://api.example.com";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("createEntitlement", () => {
  it("refresh() returns pro and caches it from a successful /me call", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${ENDPOINT}/me`);
      expect((init?.headers as Record<string, string>)["X-Device-Id"]).toBe(DEVICE_ID);
      return jsonResponse({ tier: "pro", plan: "annual", status: "active" });
    });
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });

    const tier = await entitlement.refresh();

    expect(tier).toBe("pro");
    expect(await entitlement.getCachedTier()).toBe("pro");
  });

  it("refresh() returns free from a successful /me call reporting free", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse({ tier: "free" }));
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });

    const tier = await entitlement.refresh();

    expect(tier).toBe("free");
    expect(await entitlement.getCachedTier()).toBe("free");
  });

  it("offline within the grace window keeps the last-known pro tier", async () => {
    let now = 1_000_000;
    const store = makeStore();
    const okFetch = vi.fn(async () => jsonResponse({ tier: "pro" }));
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: okFetch,
      now: () => now, devPro: false,
    });
    await entitlement.refresh(); // caches pro at now=1_000_000

    const failingFetch = vi.fn(async () => { throw new Error("network down"); });
    now = 1_000_000 + 6 * DAY_MS; // within default 7-day grace
    const offlineEntitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: failingFetch,
      now: () => now, devPro: false,
    });

    const tier = await offlineEntitlement.refresh();

    expect(tier).toBe("pro");
  });

  it("offline past the grace window falls back to free", async () => {
    let now = 1_000_000;
    const store = makeStore();
    const okFetch = vi.fn(async () => jsonResponse({ tier: "pro" }));
    const seedEntitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: okFetch,
      now: () => now, devPro: false,
    });
    await seedEntitlement.refresh();

    const failingFetch = vi.fn(async () => { throw new Error("network down"); });
    now = 1_000_000 + 8 * DAY_MS; // past default 7-day grace
    const offlineEntitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: failingFetch,
      now: () => now, devPro: false,
    });

    const tier = await offlineEntitlement.refresh();

    expect(tier).toBe("free");
  });

  it("respects a custom graceMs", async () => {
    let now = 0;
    const store = makeStore();
    const okFetch = vi.fn(async () => jsonResponse({ tier: "pro" }));
    const seedEntitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: okFetch,
      now: () => now, devPro: false, graceMs: 60_000,
    });
    await seedEntitlement.refresh();

    const failingFetch = vi.fn(async () => { throw new Error("down"); });
    now = 61_000; // 1s past the 60s custom grace
    const offline = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: failingFetch,
      now: () => now, devPro: false, graceMs: 60_000,
    });

    expect(await offline.refresh()).toBe("free");
  });

  it("restore() success refreshes the cached tier to pro", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${ENDPOINT}/restore`) {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ email: "user@example.com", deviceId: DEVICE_ID });
        return jsonResponse({ ok: true, tier: "pro" });
      }
      if (url === `${ENDPOINT}/me`) return jsonResponse({ tier: "pro", plan: "lifetime" });
      throw new Error(`unexpected url ${url}`);
    });
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });

    const result = await entitlement.restore("user@example.com");

    expect(result.ok).toBe(true);
    expect(result.tier).toBe("pro");
    expect(await entitlement.getCachedTier()).toBe("pro");
  });

  it("restore() maps a 404 (no active purchase) via the contract error catalog", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, tier: "free" }, 404));
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });

    const result = await entitlement.restore("nobody@example.com");

    expect(result.ok).toBe(false);
    // 404 has no catalog entry, so name/message fall back to "unavailable",
    // but the REAL status is preserved so Plan 2b can show a "no purchase
    // found for that email" message instead of a generic server error.
    expect(result.error?.name).toBe("unavailable");
    expect(result.error?.status).toBe(404);
  });

  it("restore() maps a 429 (rate limited) via the contract error catalog", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: false, tier: "free" }, 429));
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });

    const result = await entitlement.restore("user@example.com");

    expect(result.ok).toBe(false);
    expect(result.error?.name).toBe("rate_limited");
    expect(result.error?.message).toMatch(/too many requests/i);
  });

  it("getCachedTier() returns free when nothing has been cached yet", async () => {
    const store = makeStore();
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl: vi.fn(),
      now: () => 1_000_000, devPro: false,
    });

    expect(await entitlement.getCachedTier()).toBe("free");
  });

  it("clear() wipes the cache back to free", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () => jsonResponse({ tier: "pro" }));
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });
    await entitlement.refresh();
    expect(await entitlement.getCachedTier()).toBe("pro");

    await entitlement.clear();

    expect(await entitlement.getCachedTier()).toBe("free");
  });

  it("devPro short-circuits to pro with no network call and seeds the cache", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn();
    const entitlement = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: true,
    });

    const tier = await entitlement.refresh();

    expect(tier).toBe("pro");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await entitlement.getCachedTier()).toBe("pro");
  });

  it("getCached() returns the full cached record (tier, plan, status) after a refresh", async () => {
    const store = makeStore();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ tier: "pro", plan: "annual", status: "active" })
    );
    const ent = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store, fetchImpl,
      now: () => 1_000_000, devPro: false,
    });
    await ent.refresh();
    const cached = await ent.getCached();
    expect(cached).toMatchObject({ tier: "pro", plan: "annual", status: "active" });
  });

  it("getCached() returns null when nothing is cached", async () => {
    const ent = createEntitlement({
      endpoint: ENDPOINT, deviceId: DEVICE_ID, store: makeStore(), fetchImpl: vi.fn(),
      now: () => 1_000_000, devPro: false,
    });
    expect(await ent.getCached()).toBeNull();
  });
});
