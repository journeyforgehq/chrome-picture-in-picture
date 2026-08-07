// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { StorageArea } from "./device-id";
import { errorFor, type Tier, type Plan, type PaidStatus, type ResolvedError } from "../contract";

export interface EntitlementCache {
  tier: Tier;
  plan?: Plan;
  status?: PaidStatus;
  checkedAt: number;
}

export interface RestoreResult {
  ok: boolean;
  tier: Tier;
  error?: ResolvedError;
}

export interface Entitlement {
  refresh(): Promise<Tier>;
  restore(email: string): Promise<RestoreResult>;
  getCachedTier(): Promise<Tier>;
  getCached(): Promise<EntitlementCache | null>;
  clear(): Promise<void>;
}

export interface CreateEntitlementOptions {
  endpoint: string;
  deviceId: string;
  store: StorageArea;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
  graceMs?: number;
  devPro?: boolean;
}

const KEY = "entitlement_cache";
const DEFAULT_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, per spec §5

export function createEntitlement(opts: CreateEntitlementOptions): Entitlement {
  const {
    endpoint,
    deviceId,
    store,
    fetchImpl,
    now = () => Date.now(),
    graceMs = DEFAULT_GRACE_MS,
    devPro = false,
  } = opts;

  async function readCache(): Promise<EntitlementCache | null> {
    const val = (await store.get(KEY))[KEY] as EntitlementCache | undefined;
    return val ?? null;
  }

  async function writeCache(entry: Omit<EntitlementCache, "checkedAt">): Promise<void> {
    await store.set({ [KEY]: { ...entry, checkedAt: now() } });
  }

  async function refresh(): Promise<Tier> {
    if (devPro) {
      await writeCache({ tier: "pro" });
      return "pro";
    }

    try {
      const res = await fetchImpl(`${endpoint}/me`, {
        method: "GET",
        headers: { "X-Device-Id": deviceId },
      });
      if (!res.ok) throw new Error(`GET /me failed: ${res.status}`);
      const data = (await res.json()) as { tier: Tier; plan?: Plan; status?: PaidStatus };
      await writeCache({ tier: data.tier, plan: data.plan, status: data.status });
      return data.tier;
    } catch {
      // Offline/error path: honor the cached tier only within the grace window.
      const cache = await readCache();
      if (cache && cache.tier === "pro" && now() - cache.checkedAt < graceMs) {
        return "pro";
      }
      return "free";
    }
  }

  async function restore(email: string): Promise<RestoreResult> {
    try {
      const res = await fetchImpl(`${endpoint}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, deviceId }),
      });
      if (res.status === 404) {
        // Legacy backend: a miss is a bare HTTP 404 (no reliable JSON body).
        // Preserve the REAL HTTP status alongside the catalog name/message
        // so Plan 2b's RestoreForm can distinguish 404 (no purchase for that
        // email) from 429 (rate limited) from 5xx (server error). errorFor()
        // alone collapses unknown statuses (like 404) to 500.
        return { ok: false, tier: "free", error: { ...errorFor(404), status: 404 } };
      }
      if (!res.ok) {
        return { ok: false, tier: "free", error: { ...errorFor(res.status), status: res.status } };
      }
      // New backend: a miss is HTTP 200 with { ok: false }, not a 404 — so on
      // any 2xx response we must still inspect the body rather than assume
      // success. Guard the parse: a malformed/empty 200 body should read as
      // a miss, not throw and fall into the catch's generic 500.
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; tier?: Tier };
      if (body.ok === true) {
        const tier = body.tier ?? "pro";
        await refresh();
        return { ok: true, tier };
      }
      return { ok: false, tier: "free", error: { ...errorFor(404), status: res.status } };
    } catch {
      return { ok: false, tier: "free", error: errorFor(500) };
    }
  }

  async function getCachedTier(): Promise<Tier> {
    const cache = await readCache();
    return cache?.tier ?? "free";
  }

  async function getCached(): Promise<EntitlementCache | null> {
    return readCache();
  }

  async function clear(): Promise<void> {
    await store.set({ [KEY]: null });
  }

  return { refresh, restore, getCachedTier, getCached, clear };
}
