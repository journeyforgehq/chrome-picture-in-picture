import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The shipped defaults are `dist/` -> `extension.zip` at the extension root;
// nothing but a test ever sets these. test/zip-artifact.test.ts overrides both
// so it can build and inspect its OWN production dist: several other test files
// rebuild the shared dist/ concurrently (with `clean`), and reading it here
// would make the artifact assertions depend on vitest's file scheduling.
const dist = resolve(extRoot, process.env.ZIP_DIST_DIR || join(extRoot, "dist"));
const out = resolve(extRoot, process.env.ZIP_OUT || join(extRoot, "extension.zip"));

if (!existsSync(dist)) {
  console.error("dist/ not found — run `npm run build` first.");
  process.exit(1);
}
if (existsSync(out)) rmSync(out);
try {
  // Zip the CONTENTS of dist/ (CWS expects manifest.json at the archive root).
  execFileSync("zip", ["-r", "-q", out, "."], { cwd: dist, stdio: "inherit" });
} catch {
  console.error("`zip` CLI not found. Install it, or zip the dist/ contents manually (manifest.json must be at the archive root).");
  process.exit(1);
}
console.log(`Packaged -> ${out}`);
