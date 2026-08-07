import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("provides a PAID KV binding and injected secrets", async () => {
    await env.PAID.put("smoke", "1");
    expect(await env.PAID.get("smoke")).toBe("1");
    expect(env.STRIPE_WEBHOOK_SECRET).toBe("whsec_test_123");
  });
});
