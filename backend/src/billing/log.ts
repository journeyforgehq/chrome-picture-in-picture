// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
// Structured, greppable, PII-safe logging. CORE (synced) — scaffolded extensions
// inherit this, so the whole fleet shares one log shape for money-path events.
//
// Emits `[area] key=value key=value` lines. NEVER log the raw email (pass a
// `hasEmail` boolean instead) — entitlement audit trails must stay PII-free.
// Cloudflare Workers Logs captures console.* when [observability] is enabled in
// wrangler.toml, so these become searchable in the dashboard / `wrangler tail`.
//
// Levels: info = audit/success (grant, revoke, renew, restore, quota signals);
//         warn = suspicious/abuse/degraded (bad signature, past_due, missing device);
//         error = real failures (unattributable refund, upstream/apply errors).
function logFields(f: Record<string, unknown>): string {
  return Object.entries(f)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

export const logInfo = (area: string, f: Record<string, unknown>): void =>
  console.log(`[${area}] ${logFields(f)}`);
export const logWarn = (area: string, f: Record<string, unknown>): void =>
  console.warn(`[${area}] ${logFields(f)}`);
export const logError = (area: string, f: Record<string, unknown>): void =>
  console.error(`[${area}] ${logFields(f)}`);
