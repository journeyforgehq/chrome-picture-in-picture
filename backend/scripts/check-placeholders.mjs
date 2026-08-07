// Fail (exit 1) if the wrangler.toml section for --env still holds a REPLACE_WITH_ placeholder.
// Scoped so it gates the RIGHT deploy: wired as predeploy (--env top → legacy `deploy`),
// predeploy:staging (--env staging), predeploy:production (--env production). npm runs the
// matching pre<script> hook automatically before each deploy script.
//   --env top                 → the top-level section (everything before the first [env.*])
//   --env staging|production  → just that [env.<name>] block (through the next [env.*] / EOF)
import { readFileSync } from "node:fs";
import { parseArgs } from "./resolve-target.mjs";

const { env } = parseArgs(process.argv.slice(2));
if (!env) { console.error("check-placeholders: need --env <top|staging|production>"); process.exit(2); }

const lines = readFileSync("wrangler.toml", "utf8").split("\n");
const isEnvHeader = (l) => /^\[env\.[^.]+\]/.test(l.trim()); // [env.staging]; NOT [[env.staging.kv_namespaces]]

function section(name) {
  if (name === "top") {
    const end = lines.findIndex(isEnvHeader);
    return end === -1 ? lines : lines.slice(0, end);
  }
  const start = lines.findIndex((l) => l.trim() === `[env.${name}]`);
  if (start === -1) { console.error(`check-placeholders: no [env.${name}] block in wrangler.toml`); process.exit(2); }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) { if (isEnvHeader(lines[i])) { end = i; break; } }
  return lines.slice(start, end);
}

if (section(env).some((l) => l.includes("REPLACE_WITH_"))) {
  const where = env === "top" ? "top-level config" : `[env.${env}]`;
  console.error(`wrangler.toml ${where} has an unfilled REPLACE_WITH_ placeholder (KV id?). See DEPLOY.md.`);
  process.exit(1);
}
