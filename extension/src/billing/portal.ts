// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { config } from "./config";
import type { PortalResponse } from "../contract";

/**
 * Mint a portal session and return its URL, or null on any failure.
 * The backend deliberately does not expose Stripe's error text (it can name
 * other customers), so callers show a generic message.
 */
export async function fetchPortalUrl(deviceId: string): Promise<string | null> {
  try {
    const res = await fetch(`${config.BACKEND_BASE_URL}/portal`, {
      method: "POST",
      headers: { "X-Device-Id": deviceId },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PortalResponse;
    return body.ok && body.url ? body.url : null;
  } catch {
    return null;
  }
}
