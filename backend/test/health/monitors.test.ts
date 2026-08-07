import { describe, it, expect, vi } from "vitest";
import { envPresence, kvMonitor, stripeMonitor, openrouterMonitor } from "../../src/health/monitors";

describe("standard monitors", () => {
  it("envPresence flags missing vars", async () => {
    expect(await envPresence({ A: "x", B: undefined, C: "" })()).toEqual({ ok: false, detail: "missing: B, C" });
    expect(await envPresence({ A: "x" })()).toEqual({ ok: true });
  });
  it("kvMonitor round-trips a probe key", async () => {
    const store = new Map<string, string>();
    const kv = { put: async (k: string, v: string) => void store.set(k, v), get: async (k: string) => store.get(k) ?? null } as any;
    expect(await kvMonitor(kv)()).toEqual({ ok: true });
  });
  it("stripeMonitor ok on 200, fail on non-200 / no key", async () => {
    const okFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await stripeMonitor("sk_test", "https://api.stripe.test", okFetch)()).toEqual({ ok: true });
    const badFetch = vi.fn(async () => new Response("", { status: 401 }));
    expect(await stripeMonitor("sk_test", "https://api.stripe.test", badFetch)()).toMatchObject({ ok: false });
    expect(await stripeMonitor(undefined, "https://api.stripe.test", okFetch)()).toMatchObject({ ok: false, detail: "no STRIPE_SECRET_KEY" });
  });
  it("openrouterMonitor ok on 200", async () => {
    const okFetch = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await openrouterMonitor("k", "https://or.test", okFetch)()).toEqual({ ok: true });
  });
});
