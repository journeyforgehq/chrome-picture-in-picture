import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHILD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pure scanner: given file contents + parsed env, return a list of human-readable
 * issue strings (empty === ready to ship). Kept pure so it's unit-testable.
 */
export function scanForIssues({ files, env }) {
  const issues = [];
  // Two placeholder spellings, because this child uses both.
  //
  // REPLACE_WITH_* is the factory's original convention. The design package uses
  // __DOUBLE_UNDERSCORE__ tokens (__ORG__, __EXT_ID__, __DOMAIN__), and the
  // welcome-page rewrite introduced them here — which left this guard blind to
  // exactly the placeholders it exists to catch, on the one page every new
  // install sees. Found at the final visual checkpoint, not by the gate.
  //
  // A guard that silently stops matching is worse than no guard: the green run
  // reads as "no placeholders shipped" rather than "not looking".
  const PLACEHOLDER = /REPLACE_WITH_[A-Z_]+|__[A-Z][A-Z0-9_]*__/g;
  for (const [path, content] of Object.entries(files)) {
    const m = content.match(PLACEHOLDER);
    if (m) for (const token of new Set(m)) issues.push(`${path}: unfilled placeholder ${token}`);
  }
  if (!env.BACKEND_BASE_URL) issues.push("extension/.env: BACKEND_BASE_URL is empty (paywall + /me will target localhost)");
  if (!env.STRIPE_ANNUAL_URL && !env.STRIPE_LIFETIME_URL) {
    issues.push("extension/.env: no STRIPE_ANNUAL_URL or STRIPE_LIFETIME_URL (checkout has no link)");
  }
  return issues;
}

/** Read a .env file into a flat object (best-effort; ignores comments/blank lines). */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function readIf(rel) {
  const p = join(CHILD_ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function runPreflight() {
  const files = {
    "backend/wrangler.toml": readIf("backend/wrangler.toml"),
    "welcome-page/src/content.ts": readIf("welcome-page/src/content.ts"),
  };
  const env = parseEnvFile(readIf("extension/.env"));
  return scanForIssues({ files, env });
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const issues = runPreflight();
  if (issues.length) {
    console.error("Preflight found issues before shipping:\n" + issues.map((i) => "  ✗ " + i).join("\n"));
    console.error("\nFix these (or set --welcome-url/--backend-url etc. at scaffold time), then re-run. See DEPLOY.md.");
    process.exit(1);
  }
  console.log("Preflight OK — no unfilled placeholders, required build config present.");
}
