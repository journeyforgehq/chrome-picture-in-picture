import { describe, it, expect, vi } from "vitest";
import { getDeviceId, type StorageArea } from "../src/billing/device-id";

// In-memory chrome.storage.{sync,local}-shaped mock.
function makeArea(initial: Record<string, unknown> = {}): StorageArea {
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

describe("getDeviceId", () => {
  it("generates a fresh id and persists it to BOTH sync and local when neither has one", async () => {
    const sync = makeArea();
    const local = makeArea();
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-1111-1111-111111111111" });

    const id = await getDeviceId({ sync, local });

    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect((await sync.get("device_id")).device_id).toBe(id);
    expect((await local.get("device_id")).device_id).toBe(id);
    vi.unstubAllGlobals();
  });

  it("returns the existing sync value without generating a new one", async () => {
    const sync = makeArea({ device_id: "sync-id-abc" });
    const local = makeArea();
    const id = await getDeviceId({ sync, local });
    expect(id).toBe("sync-id-abc");
  });

  it("falls back to local and migrates the value into sync", async () => {
    const sync = makeArea();
    const local = makeArea({ device_id: "local-id-xyz" });
    const id = await getDeviceId({ sync, local });
    expect(id).toBe("local-id-xyz");
    expect((await sync.get("device_id")).device_id).toBe("local-id-xyz");
  });

  it("is stable across repeated calls", async () => {
    const sync = makeArea();
    const local = makeArea();
    const first = await getDeviceId({ sync, local });
    const second = await getDeviceId({ sync, local });
    expect(second).toBe(first);
  });

  it("prefers sync over local when both are present but differ", async () => {
    const sync = makeArea({ device_id: "sync-wins" });
    const local = makeArea({ device_id: "local-loses" });
    const id = await getDeviceId({ sync, local });
    expect(id).toBe("sync-wins");
  });
});
