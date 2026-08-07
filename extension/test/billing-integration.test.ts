import { describe, it, expect, vi } from "vitest";
import { getDeviceId, createEntitlement, checkoutUrl } from "../src/billing";
import type { StorageArea } from "../src/billing/device-id";

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

describe("billing barrel integration", () => {
  it("wires device-id -> entitlement -> checkout end-to-end", async () => {
    const sync = makeArea();
    const local = makeArea();
    vi.stubGlobal("crypto", { randomUUID: () => "22222222-2222-2222-2222-222222222222" });

    const deviceId = await getDeviceId({ sync, local });
    expect(deviceId).toBe("22222222-2222-2222-2222-222222222222");

    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://api.example.com/me");
      return new Response(JSON.stringify({ tier: "pro", plan: "annual" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const entitlement = createEntitlement({
      endpoint: "https://api.example.com",
      deviceId,
      store: local,
      fetchImpl,
      now: () => Date.now(),
    });

    const tier = await entitlement.refresh();
    expect(tier).toBe("pro");

    const url = checkoutUrl("annual", deviceId);
    expect(url).toContain(`client_reference_id=${deviceId}`);

    vi.unstubAllGlobals();
  });
});
