// scripts/health-check.mjs — curl <base>/health/summary?token=…&fresh=1; exit non-zero unless status==="ok".
// Usage: node scripts/health-check.mjs --env <local|staging|production> --token <HEALTH_TOKEN>
//    or: node scripts/health-check.mjs --base <workerUrl> --token <HEALTH_TOKEN>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveBase, parseArgs } from "./resolve-target.mjs";

const args = parseArgs(process.argv.slice(2));
const token = args.token || process.env.HEALTH_TOKEN;
let targets = {};
try {
  targets = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "deploy.targets.json"), "utf8"));
} catch { /* file optional when --base is used */ }

let base;
try {
  base = resolveBase({ base: args.base, env: args.env, targets });
} catch (e) { console.error(`health-check: ${e.message}`); process.exit(2); }
if (!token) { console.error("health-check: need --token or HEALTH_TOKEN env"); process.exit(2); }

const url = `${base.replace(/\/+$/, "")}/health/summary?token=${encodeURIComponent(token)}&fresh=1`;
try {
  const res = await fetch(url);
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
  if (body.status !== "ok") { console.error(`health-check FAILED: status=${body.status}`); process.exit(1); }
  console.log("health-check OK");
} catch (e) { console.error(`health-check ERROR: ${e.message}`); process.exit(1); }
