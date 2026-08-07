#!/usr/bin/env node
// Delete-protection guard — restore-normalization spec §6 (P2).
//
// Entitlement KV keys (paid:/email:/sub:/cust:) must be SOFT-canceled (tombstoned),
// never hard-deleted: a hard delete of paid:{device} can orphan an email:/sub: POINTER
// that still references it. This guard fails the build if any entitlement KV binding
// `.delete(` appears in source, so a future edit can't reintroduce a hard delete.
//
// Use softCancelPaid()/a tombstone put instead. See docs/specs/restore-normalization.md §6.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".wrangler", "dist", "coverage", ".git", "scripts"]);
// Receiver is one of the KV bindings/handles we use (env.PAID, env.ENTITLEMENTS, or a
// `const kv = KV(env)` handle). `headers.delete(...)`, `Map.delete`, etc. are NOT matched.
const KV_DELETE = /\b(?:PAID|ENTITLEMENTS|kv)\s*\.\s*delete\s*\(/;

const root = process.cwd();
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (extname(p) !== ".ts" || p.endsWith(".d.ts") || /\.(test|spec)\.ts$/.test(p)) continue;
    readFileSync(p, "utf8").split("\n").forEach((line, i) => {
      if (KV_DELETE.test(line)) offenders.push(`${p}:${i + 1}: ${line.trim()}`);
    });
  }
}

walk(root);

if (offenders.length) {
  console.error("✗ delete-protection guard FAILED — entitlement KV must be tombstoned, not hard-deleted:");
  for (const o of offenders) console.error("  " + o);
  console.error("\nUse softCancelPaid() / a tombstone put. See docs/specs/restore-normalization.md §6.");
  process.exit(1);
}
console.log("✓ delete-protection guard: no entitlement KV .delete() in source.");
