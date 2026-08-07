import type { MonitorFn } from "./monitor-service";

type Fetch = typeof fetch;

/** All required env vars/secrets are present + non-empty. Synchronous, free, always safe. */
export function envPresence(vars: Record<string, string | undefined>): MonitorFn {
  return async () => {
    const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
    return missing.length ? { ok: false, detail: `missing: ${missing.join(", ")}` } : { ok: true };
  };
}

/** Round-trip a probe key through the KV binding. */
export function kvMonitor(kv: KVNamespace): MonitorFn {
  return async () => {
    const key = "__health__probe";
    await kv.put(key, "1", { expirationTtl: 60 });
    const v = await kv.get(key);
    return v === "1" ? { ok: true } : { ok: false, detail: "kv probe read-back mismatch" };
  };
}

/** Validate the Stripe secret key with one cheap authenticated GET (/v1/balance). */
export function stripeMonitor(secretKey: string | undefined, baseUrl = "https://api.stripe.com", fetchImpl: Fetch = fetch): MonitorFn {
  return async () => {
    if (!secretKey) return { ok: false, detail: "no STRIPE_SECRET_KEY" };
    const res = await fetchImpl(`${baseUrl}/v1/balance`, { headers: { Authorization: `Bearer ${secretKey}` } });
    return res.ok ? { ok: true } : { ok: false, detail: `stripe ${res.status}` };
  };
}

/** Validate the OpenRouter key with GET /models (no token cost). */
export function openrouterMonitor(key: string | undefined, baseUrl = "https://openrouter.ai/api/v1", fetchImpl: Fetch = fetch): MonitorFn {
  return async () => {
    if (!key) return { ok: false, detail: "no OPENROUTER_KEY" };
    const res = await fetchImpl(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
    return res.ok ? { ok: true } : { ok: false, detail: `openrouter ${res.status}` };
  };
}
