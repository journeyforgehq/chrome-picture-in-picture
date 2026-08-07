import { describe, it, expect } from "vitest";
import { handleTestMode, type TestModeHandlers } from "../src/test-mode/router";

const stub: TestModeHandlers = {
  async seed() { return new Response(JSON.stringify({ ok: true, via: "seed" }), { status: 200 }); },
  async reset() { return new Response(JSON.stringify({ ok: true, via: "reset" }), { status: 200 }); },
};
const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
  new Request(`https://w${path}`, { method: "POST", headers, body: JSON.stringify(body) });

describe("test-mode guard", () => {
  it("returns null for non-/__test__ paths", async () =>
    expect(await handleTestMode(post("/me"), "s", stub)).toBeNull());
  it("404 when E2E_SEED_SECRET is unset (prod-safe)", async () => {
    const r = await handleTestMode(post("/__test__/seed", { "X-Test-Secret": "s" }), undefined, stub);
    expect(r!.status).toBe(404);
  });
  it("404 when X-Test-Secret mismatches", async () => {
    const r = await handleTestMode(post("/__test__/seed", { "X-Test-Secret": "nope" }), "s", stub);
    expect(r!.status).toBe(404);
  });
  it("404 when secret is an empty string (misconfigured env var)", async () => {
    const r = await handleTestMode(post("/__test__/seed", { "X-Test-Secret": "" }), "", stub);
    expect(r!.status).toBe(404);
  });
  it("404 on production even with a valid secret (defense in depth)", async () => {
    const r = await handleTestMode(post("/__test__/seed", { "X-Test-Secret": "s" }), "s", stub, "production");
    expect(r!.status).toBe(404);
  });
  it("still routes on staging with a valid secret", async () => {
    const r = await handleTestMode(post("/__test__/seed", { "X-Test-Secret": "s" }), "s", stub, "staging");
    expect(r!.status).toBe(200);
    expect(await r!.json()).toEqual({ ok: true, via: "seed" });
  });
  it("404 for a non-POST test path even when enabled", async () => {
    const r = await handleTestMode(new Request("https://w/__test__/seed", { method: "GET", headers: { "X-Test-Secret": "s" } }), "s", stub);
    expect(r!.status).toBe(404);
  });
  it("routes /__test__/seed to the seed handler when authorized", async () => {
    const r = await handleTestMode(post("/__test__/seed", { "X-Test-Secret": "s" }), "s", stub);
    expect(r!.status).toBe(200);
    expect(await r!.json()).toEqual({ ok: true, via: "seed" });
  });
  it("routes /__test__/reset to the reset handler when authorized", async () => {
    const r = await handleTestMode(post("/__test__/reset", { "X-Test-Secret": "s" }), "s", stub);
    expect(await r!.json()).toEqual({ ok: true, via: "reset" });
  });
  it("404 for an unknown /__test__/ subpath when authorized", async () => {
    const r = await handleTestMode(post("/__test__/bogus", { "X-Test-Secret": "s" }), "s", stub);
    expect(r!.status).toBe(404);
  });
});
