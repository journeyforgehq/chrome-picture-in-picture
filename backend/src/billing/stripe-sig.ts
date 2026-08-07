// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
const TOLERANCE_SEC = 300; // 5 minutes, matching Stripe's default

/**
 * Verify a Stripe webhook signature header of the form `t=<unix>,v1=<hmac-sha256 hex>`.
 * The signed message is `${t}.${payload}`. Uses Web Crypto (crypto.subtle) HMAC-SHA256,
 * a timing-safe hex compare, and rejects timestamps older than TOLERANCE_SEC vs nowSec.
 */
export async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  secret: string,
  nowSec: number,
): Promise<boolean> {
  if (!sigHeader) return false;

  let t: string | undefined;
  const v1s: string[] = [];
  for (const segment of sigHeader.split(",")) {
    const eq = segment.indexOf("=");
    if (eq === -1) return false; // malformed segment -> fail closed
    const key = segment.slice(0, eq);
    const value = segment.slice(eq + 1);
    if (key === "t") t = value;
    else if (key === "v1") v1s.push(value);
    // other schemes (e.g. legacy v0 SHA-1) are intentionally ignored
  }
  if (!t || v1s.length === 0) return false;

  const tNum = Number(t);
  if (!Number.isFinite(tNum)) return false;
  if (Math.abs(nowSec - tNum) > TOLERANCE_SEC) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1s.some((v1) => timingSafeEqual(expected, v1));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
