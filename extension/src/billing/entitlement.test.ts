// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { describe, it, expect } from "vitest";
import { createEntitlement } from "./entitlement";
import type { StorageArea } from "./device-id";

// In-memory StorageArea matching the interface createEntitlement expects.
function memStore(): StorageArea {
  let data: Record<string, unknown> = {};
  return {
    async get(key: string) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(obj: Record<string, unknown>) {
      data = { ...data, ...obj };
    },
  };
}

function ent(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  return createEntitlement({ endpoint: "https://api", deviceId: "dev_abc12345", store: memStore(), fetchImpl });
}

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("entitlement.restore() response tolerance", () => {
  it("treats HTTP 404 as not-found (legacy backend)", async () => {
    const r = await ent(async () => res(404, { restored: false })).restore("a@x.com");
    expect(r.ok).toBe(false);
  });

  it("treats 200 {ok:false} as not-found (new backend)", async () => {
    const r = await ent(async () => res(200, { ok: false, tier: "free", reason: "not_found" })).restore("a@x.com");
    expect(r.ok).toBe(false);
  });

  it("treats 200 {ok:true} as granted", async () => {
    const r = await ent(async () => res(200, { ok: true, tier: "pro" })).restore("a@x.com");
    expect(r.ok).toBe(true);
    expect(r.tier).toBe("pro");
  });
});
