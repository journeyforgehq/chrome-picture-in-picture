import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // template/scripts
export const TEMPLATE_DIR = resolve(HERE, "..");
export const EXTENSION_DIR = resolve(TEMPLATE_DIR, "extension");
export const BACKEND_DIR = resolve(TEMPLATE_DIR, "backend");
export const WORKER_PORT = 8787; // wrangler dev default
export const MIN_NODE_MAJOR = 18;

/** Extract the major version from a `process.version`-style string ("v22.15.0" -> 22). */
export function parseNodeMajor(versionStr) {
  const m = /^v?(\d+)\./.exec(versionStr);
  return m ? Number(m[1]) : NaN;
}

export function nodeVersionOk(versionStr, min = MIN_NODE_MAJOR) {
  const major = parseNodeMajor(versionStr);
  return Number.isFinite(major) && major >= min;
}

/** Resolve true if a TCP port can be bound (nothing else is listening on it). */
export function portFree(port) {
  return new Promise((resolveP) => {
    const srv = createServer();
    srv.once("error", () => resolveP(false));
    srv.once("listening", () => srv.close(() => resolveP(true)));
    srv.listen(port, "127.0.0.1");
  });
}

/** Resolve true if `cmd --version` can be spawned (the CLI is on PATH). */
export function commandExists(cmd) {
  return new Promise((resolveP) => {
    const child = spawn(cmd, ["--version"], { stdio: "ignore" });
    child.on("error", () => resolveP(false));
    child.on("close", (code) => resolveP(code === 0));
  });
}

/**
 * Ensure backend/.dev.vars exists so `wrangler dev` gets ENVIRONMENT/DEV_FORCE_PRO.
 * Copies template/.dev.vars.example -> backend/.dev.vars when missing (dev-safe:
 * the example only enables dev-force-pro; no real secrets). Returns { created, path }.
 */
export function ensureDevVars(templateDir = TEMPLATE_DIR, backendDir = BACKEND_DIR) {
  const target = resolve(backendDir, ".dev.vars");
  if (existsSync(target)) return { created: false, path: target };
  const example = resolve(templateDir, ".dev.vars.example");
  if (!existsSync(example)) throw new Error(`.dev.vars.example missing at ${example}`);
  copyFileSync(example, target);
  return { created: true, path: target };
}

/** Run all preflight checks. Returns { ok, checks: [{ name, ok, detail }] }. */
export async function runDoctor(opts = {}) {
  const {
    needsStripeListener = false,
    port = WORKER_PORT,
    templateDir = TEMPLATE_DIR,
    extensionDir = EXTENSION_DIR,
    backendDir = BACKEND_DIR,
    nodeVersion = process.version,
  } = opts;

  const checks = [];

  checks.push({ name: `Node >= ${MIN_NODE_MAJOR}`, ok: nodeVersionOk(nodeVersion), detail: nodeVersion });

  // npm is the launcher for both `web` (npm run watch) and `api` (npm run dev);
  // check it up front so a missing npm is an actionable preflight line, not a
  // raw "spawn npm ENOENT" at process-start time.
  const hasNpm = await commandExists("npm");
  checks.push({ name: "npm CLI", ok: hasNpm, detail: hasNpm ? "ok" : "install Node.js (which bundles npm)" });

  const depsExt = existsSync(resolve(extensionDir, "node_modules"));
  checks.push({ name: "extension deps installed", ok: depsExt, detail: depsExt ? "ok" : "run: cd extension && npm install" });

  const depsApi = existsSync(resolve(backendDir, "node_modules"));
  checks.push({ name: "backend deps installed", ok: depsApi, detail: depsApi ? "ok" : "run: cd backend && npm install" });

  const dv = ensureDevVars(templateDir, backendDir);
  checks.push({ name: "backend/.dev.vars", ok: true, detail: dv.created ? "created from .dev.vars.example" : "present" });

  const free = await portFree(port);
  checks.push({ name: `port ${port} free`, ok: free, detail: free ? "ok" : `already in use — stop the stale worker on ${port}` });

  if (needsStripeListener) {
    const hasStripe = await commandExists("stripe");
    checks.push({ name: "stripe CLI", ok: hasStripe, detail: hasStripe ? "ok" : "install: https://stripe.com/docs/stripe-cli" });
  }

  return { ok: checks.every((c) => c.ok), checks };
}

// --- CLI entrypoint (only when run directly, not when imported by dev.mjs/tests) ---
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const { ok, checks } = await runDoctor();
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  if (!ok) {
    console.error("\ndoctor: preflight failed — fix the failing items above.");
    process.exit(1);
  }
  console.log("\ndoctor: all checks passed.");
}
