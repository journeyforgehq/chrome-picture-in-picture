import { describe, it, expect, vi, beforeEach } from "vitest";
import { chromeSyncLocalStores, chromeLocalStore } from "../../src/billing/chrome-storage";

function makeChromeStorageArea(initial: Record<string, unknown> = {}) {
  let data: Record<string, unknown> = { ...initial };
  return {
    get(key: string, callback: (items: Record<string, unknown>) => void) {
      callback(key in data ? { [key]: data[key] } : {});
    },
    set(items: Record<string, unknown>, callback?: () => void) {
      data = { ...data, ...items };
      callback?.();
    },
  };
}

function installChromeMock() {
  const sync = makeChromeStorageArea();
  const local = makeChromeStorageArea();
  vi.stubGlobal("chrome", {
    storage: { sync, local },
    runtime: { lastError: undefined },
  });
  return { sync, local };
}

describe("chromeSyncLocalStores", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a value through the sync area", async () => {
    installChromeMock();
    const stores = chromeSyncLocalStores();
    await stores.sync.set({ device_id: "abc-123" });
    const result = await stores.sync.get("device_id");
    expect(result).toEqual({ device_id: "abc-123" });
  });

  it("round-trips a value through the local area", async () => {
    installChromeMock();
    const stores = chromeSyncLocalStores();
    await stores.local.set({ device_id: "local-xyz" });
    const result = await stores.local.get("device_id");
    expect(result).toEqual({ device_id: "local-xyz" });
  });

  it("returns an empty object when the key is absent", async () => {
    installChromeMock();
    const stores = chromeSyncLocalStores();
    const result = await stores.sync.get("device_id");
    expect(result).toEqual({});
  });

  it("keeps sync and local as independent areas", async () => {
    installChromeMock();
    const stores = chromeSyncLocalStores();
    await stores.sync.set({ device_id: "sync-value" });
    await stores.local.set({ device_id: "local-value" });
    expect(await stores.sync.get("device_id")).toEqual({ device_id: "sync-value" });
    expect(await stores.local.get("device_id")).toEqual({ device_id: "local-value" });
  });
});

describe("chromeLocalStore", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips the entitlement cache through chrome.storage.local", async () => {
    installChromeMock();
    const store = chromeLocalStore();
    await store.set({ entitlement_cache: { tier: "pro", checkedAt: 123 } });
    const result = await store.get("entitlement_cache");
    expect(result).toEqual({ entitlement_cache: { tier: "pro", checkedAt: 123 } });
  });

  it("returns an empty object when the cache key is absent", async () => {
    installChromeMock();
    const store = chromeLocalStore();
    const result = await store.get("entitlement_cache");
    expect(result).toEqual({});
  });

  it("is backed by chrome.storage.local, not chrome.storage.sync", async () => {
    const { sync, local } = installChromeMock();
    const store = chromeLocalStore();
    await store.set({ entitlement_cache: { tier: "free", checkedAt: 1 } });
    const localDirect = await new Promise((resolve) => local.get("entitlement_cache", resolve));
    const syncDirect = await new Promise((resolve) => sync.get("entitlement_cache", resolve));
    expect(localDirect).toEqual({ entitlement_cache: { tier: "free", checkedAt: 1 } });
    expect(syncDirect).toEqual({});
  });
});
