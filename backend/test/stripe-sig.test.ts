import { describe, it, expect } from "vitest";
import { verifyStripeSignature } from "../src/billing/stripe-sig";

const SECRET = "whsec_test_123";

async function signStripe(payload: string, t: number, secret = SECRET): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

const NOW = 1_800_000_000;

describe("verifyStripeSignature", () => {
  it("accepts a correctly signed payload", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "x" });
    const sig = await signStripe(payload, NOW);
    expect(await verifyStripeSignature(payload, sig, SECRET, NOW)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const sig = await signStripe(JSON.stringify({ id: "evt_1" }), NOW);
    expect(await verifyStripeSignature(JSON.stringify({ id: "evt_2" }), sig, SECRET, NOW)).toBe(false);
  });

  it("rejects a wrong secret", async () => {
    const payload = "{}";
    const sig = await signStripe(payload, NOW, "whsec_wrong");
    expect(await verifyStripeSignature(payload, sig, SECRET, NOW)).toBe(false);
  });

  it("rejects a missing or malformed header", async () => {
    expect(await verifyStripeSignature("{}", null, SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature("{}", "t=1", SECRET, NOW)).toBe(false);
    expect(await verifyStripeSignature("{}", "v1=abc", SECRET, NOW)).toBe(false);
  });

  it("rejects a stale timestamp beyond tolerance (5 min)", async () => {
    const payload = "{}";
    const t = NOW - 600; // 10 min old
    const sig = await signStripe(payload, t);
    expect(await verifyStripeSignature(payload, sig, SECRET, NOW)).toBe(false);
  });

  it("accepts when a valid v1 is present among multiple v1 signatures (secret rotation)", async () => {
    const payload = JSON.stringify({ id: "evt_rotate" });
    const validSig = await signStripe(payload, NOW);
    const validHex = validSig.split(",").find((s) => s.startsWith("v1="))!.slice(3);
    const headerA = `t=${NOW},v1=deadbeef,v1=${validHex}`;
    const headerB = `t=${NOW},v1=${validHex},v1=deadbeef`;
    expect(await verifyStripeSignature(payload, headerA, SECRET, NOW)).toBe(true);
    expect(await verifyStripeSignature(payload, headerB, SECRET, NOW)).toBe(true);
  });

  it("rejects when multiple v1 values are all wrong", async () => {
    expect(await verifyStripeSignature("{}", `t=${NOW},v1=aaaa,v1=bbbb`, SECRET, NOW)).toBe(false);
  });

  it("rejects a segment with no '=' (fails closed)", async () => {
    expect(await verifyStripeSignature("{}", "t=1,garbage", SECRET, NOW)).toBe(false);
  });
});
