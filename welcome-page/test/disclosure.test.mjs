// R-06 guard. The decision on record: this hosted welcome page counts page hits
// in AGGREGATE ONLY — cookieless, no fingerprinting, no per-user identifier —
// and that fact is disclosed in one plain sentence.
//
// Why a test and not a comment: the store's data declaration covers the
// EXTENSION, which genuinely collects nothing. If a user reads a blanket
// we-measure-nothing claim on this page and then finds a counter on it, we have
// been caught doing the exact thing our positioning says we do not do. Without
// this guard the decision quietly decays into that problem the first time
// somebody tightens the copy.
//
// Node's built-in runner on purpose: welcome-page has no test framework, and
// the factory root already standardises on `node --test`. Do not add vitest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentPath = join(root, "src", "content.ts");
const publicDir = join(root, "public");

/** The disclosure, verbatim. Change it here AND in src/content.ts, never one alone. */
const DISCLOSURE =
  "This welcome page counts page hits in aggregate, without cookies, fingerprinting or any per-user identifier.";

/**
 * Blanket "we measure nothing" claims. Any of these next to a page counter is
 * the dishonesty this rule exists to prevent, so they are banned outright
 * rather than allowed with a qualifier bolted on.
 */
const FORBIDDEN_CLAIMS = [
  /\bno\s+analytics\b/i,
  /\bno\s+tracking\b/i,
  /\bno\s+trackers\b/i,
  /\bno\s+telemetry\b/i,
  /\bzero\s+analytics\b/i,
  /\bwe\s+(do\s+not|don'?t)\s+track\s+you\b/i,
  /\bwithout\s+any\s+analytics\b/i,
];

/** Every file under `dir`, recursively. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test("source: content.ts discloses the aggregate page-hit counting", () => {
  const src = readFileSync(contentPath, "utf8");
  assert.ok(
    src.includes(DISCLOSURE),
    `src/content.ts must contain the R-06 disclosure verbatim:\n  ${DISCLOSURE}`
  );
});

test("source: content.ts makes no blanket we-measure-nothing claim", () => {
  const src = readFileSync(contentPath, "utf8");
  for (const claim of FORBIDDEN_CLAIMS) {
    const hit = src.match(claim);
    assert.equal(
      hit,
      null,
      `src/content.ts must not claim ${JSON.stringify(hit && hit[0])} — this page counts page hits ` +
        `in aggregate, so an unqualified claim would be false. Disclose instead.`
    );
  }
});

// The assertion that actually matters: the sentence has to reach what a user
// sees, not merely sit in a source file that a build step could drop.
test("built: the disclosure survives into public/", (t) => {
  if (!existsSync(publicDir)) {
    t.skip(
      "welcome-page/public/ not found — run `npm run build` first. " +
        "This test is advisory locally and strict in CI, where the build runs before it."
    );
    return;
  }

  const candidates = walk(publicDir).filter((f) => [".html", ".js", ".json"].includes(extname(f)));
  assert.ok(candidates.length > 0, "public/ exists but contains no built html/js — build looks broken");

  const carriers = candidates.filter((f) => readFileSync(f, "utf8").includes(DISCLOSURE));
  assert.ok(
    carriers.length > 0,
    `The R-06 disclosure reached no built file under public/. Users would see a page that ` +
      `counts hits without saying so. Expected verbatim:\n  ${DISCLOSURE}`
  );

  // Server-rendered HTML specifically: the sentence must be visible without JS.
  const inHtml = carriers.some((f) => extname(f) === ".html");
  assert.ok(
    inHtml,
    "The disclosure is only in a JS bundle, not in server-rendered HTML — it must be readable without JS."
  );
});
