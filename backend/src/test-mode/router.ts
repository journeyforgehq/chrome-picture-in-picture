// Guarded test-mode router (VENDORED byte-identical across backends — do not edit per-repo).
// ALL /__test__/* routes 404 unless E2E_SEED_SECRET is configured (STAGING only; never PROD)
// AND the request carries a matching X-Test-Secret header — so the endpoints are structurally
// absent on prod. The backend supplies seed/reset handlers wired to its own KV/DO.

function tjson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const notFound = () => tjson({ error: "not_found" }, 404);

export interface TestSeedBody {
  deviceId?: string;
  tier?: "free" | "pro";
  resetMeter?: boolean;
  plan?: string;
}
export interface TestModeHandlers {
  seed(body: TestSeedBody): Promise<Response>;
  reset(body: TestSeedBody): Promise<Response>;
}

/** Returns a Response for any /__test__/* path (404 when disabled/unauthorized), or null for non-test paths. */
export async function handleTestMode(
  req: Request,
  seedSecret: string | undefined,
  handlers: TestModeHandlers,
  environment?: string
): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/__test__/")) return null;
  // Defense in depth: test-mode is NEVER reachable on prod, even if E2E_SEED_SECRET is
  // misconfigured there (secret-store bleed, copy-paste). This makes prod-safety a CODE
  // invariant, not just "don't set the secret on prod" discipline — mirrors how DEV_FORCE_PRO
  // is honored only off-prod. Local dev (ENVIRONMENT unset) + staging stay secret-gated below.
  if (environment === "production") return notFound();
  // Disabled (no secret) or wrong secret → 404, indistinguishable from a nonexistent route.
  if (!seedSecret || req.headers.get("X-Test-Secret") !== seedSecret) return notFound();
  if (req.method !== "POST") return notFound();
  let body: TestSeedBody = {};
  try { body = (await req.json()) as TestSeedBody; } catch { body = {}; }
  if (url.pathname === "/__test__/seed") return handlers.seed(body);
  if (url.pathname === "/__test__/reset") return handlers.reset(body);
  return notFound();
}
