// Resolve a health-check base URL from CLI args + a targets map.
// Precedence: --base (explicit) > --env lookup in targets. Throws on unresolved/placeholder.
export function resolveBase({ base, env, targets }) {
  if (base) return base;
  if (!env) throw new Error("need --base or --env <local|staging|production>");
  const url = targets && targets[env];
  if (!url) throw new Error(`unknown --env "${env}" (have: ${Object.keys(targets || {}).join(", ") || "none"})`);
  if (/^REPLACE_WITH_/.test(url)) throw new Error(`target "${env}" is an unfilled placeholder in deploy.targets.json — see DEPLOY.md`);
  return url;
}

export function parseArgs(argv) {
  return Object.fromEntries(argv.flatMap((a, i, arr) => (a.startsWith("--") ? [[a.slice(2), arr[i + 1]]] : [])));
}
