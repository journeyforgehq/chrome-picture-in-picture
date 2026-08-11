/* ============================================================================
 * THE FILE THAT GOES TO THE CHROME WEB STORE.
 * ============================================================================
 *
 * `npm run build:zip` is the release command, and until this file it had never
 * been run, let alone inspected. Everything else in this repo asserts on inputs:
 * test/manifest.test.ts reads `src/static/manifest.json`, test/webpack-config
 * reads webpack's stats, test/injected-bundle reads one built chunk. Nobody had
 * ever looked at the ARCHIVE — and the archive is the deliverable.
 *
 * It is an ALLOWLIST, deliberately, for the same reason
 * test/manifest.test.ts's permission list is one: a denylist only catches the
 * files someone already thought of. A stray `.map`, a `.env` copied by a future
 * CopyPlugin pattern, a re-added `popup.html`, a `.DS_Store` — the failure mode
 * is always a file nobody meant to publish. Adding an entry below has to be a
 * conscious act.
 *
 * OWNS ITS OWN dist/. test/webpack-config.test.ts and test/separation.test.ts
 * both rebuild the shared `dist/` (with `clean`), and vitest runs files
 * concurrently — reading the shared dist here would make these assertions depend
 * on scheduling, which is exactly the flake test/injected-bundle.test.ts's
 * header documents. So this builds a production bundle into a private directory
 * and runs the REAL `scripts/zip-dist.mjs` over it via that script's own
 * ZIP_DIST_DIR / ZIP_OUT overrides.
 * ==========================================================================*/
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(EXT_ROOT, ".tmp-zip-dist");
const ZIP = path.join(EXT_ROOT, ".tmp-zip-dist.zip");

/**
 * EVERY path allowed inside the published archive. Directory entries are
 * normalised away before comparison, so list files only.
 */
const ALLOWED = new Set([
  "manifest.json",
  "background.js",
  "content.js",
  "options.html",
  "options.js",
  // Terser's extracted third-party licence notices (webpack's default
  // `extractComments`). NOT dead weight: these are the MIT/BSD attributions for
  // React, antd and rc-*, and stripping them would ship their code without the
  // notice their licences require. 13 KiB, no executable content, referenced by
  // a banner comment at the top of options.js.
  "options.js.LICENSE.txt",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  // The standard-vs-enhanced window comparison the Pro disclosure panel shows
  // (OptionsView's DpipDisclosure). Loaded by options.html from the package
  // root, so it must be IN the archive — but the copy in the tree is an
  // 80-byte placeholder, and scripts/check-assets.mjs blocks `npm run
  // build:zip` until a human replaces it. This entry says the file belongs in
  // the archive; that gate says which version of it may go there.
  "pro-window-comparison.png",
]);

/** The four things Chrome loads. Missing any of them = a broken upload. */
const REQUIRED = [
  "manifest.json",
  "background.js",
  "content.js",
  "options.html",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

interface ZipEntry {
  name: string;
  size: number;
}

/**
 * List a zip's entries by walking its central directory.
 *
 * Deliberately dependency-free: adding a zip library to devDependencies to read
 * ten filenames would put a package between this assertion and the bytes that
 * ship. The format is fixed (APPNOTE 4.3.12) and only the name + uncompressed
 * size are needed.
 */
function readZipEntries(buf: Buffer): ZipEntry[] {
  const EOCD_SIG = 0x06054b50;
  const CD_SIG = 0x02014b50;

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file: no end-of-central-directory record");

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== CD_SIG) throw new Error(`bad central directory header at ${off}`);
    const size = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    entries.push({ name: buf.subarray(off + 46, off + 46 + nameLen).toString("utf8"), size });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

let entries: ZipEntry[] = [];
/** Entry names with directory records dropped. */
let files: string[] = [];

beforeAll(async () => {
  const require_ = createRequire(import.meta.url);
  const webpack = require_("webpack");
  const prodConfig = require_("../webpack/webpack.prod.cjs");

  const stats = await new Promise<any>((resolve, reject) => {
    webpack(
      { ...prodConfig, output: { ...prodConfig.output, path: OUT_DIR, clean: true } },
      (err: Error | null, s: any) => (err ? reject(err) : resolve(s))
    );
  });
  if (stats.hasErrors()) {
    throw new Error("webpack failed:\n" + stats.toString({ all: false, errors: true }));
  }

  rmSync(ZIP, { force: true });
  // The real release script, over our private dist.
  execFileSync("node", [path.join(EXT_ROOT, "scripts/zip-dist.mjs")], {
    cwd: EXT_ROOT,
    env: { ...process.env, ZIP_DIST_DIR: OUT_DIR, ZIP_OUT: ZIP },
    stdio: "pipe",
  });

  expect(existsSync(ZIP), `zip-dist.mjs produced no archive at ${ZIP}`).toBe(true);
  entries = readZipEntries(readFileSync(ZIP));
  files = entries.filter((e) => !e.name.endsWith("/")).map((e) => e.name);
}, 180_000);

describe("the published zip", () => {
  it("puts manifest.json at the ARCHIVE ROOT, not under dist/", () => {
    // CWS rejects an upload whose manifest is one directory down. The script
    // zips the CONTENTS of dist (`cwd: dist`, `zip -r out .`); if that ever
    // becomes `zip -r out dist`, every path below gains a `dist/` prefix.
    expect(files).toContain("manifest.json");
    expect(files.some((f) => f.startsWith("dist/"))).toBe(false);
    expect(files.some((f) => f.startsWith("./"))).toBe(false);
  });

  it("contains everything Chrome needs to load the extension", () => {
    for (const required of REQUIRED) {
      expect(files, `${required} is missing from the shipped archive`).toContain(required);
    }
    // options.js is the page's bundle; options.html is inert without it.
    expect(files).toContain("options.js");
  });

  it("ships no empty or truncated files", () => {
    for (const e of entries.filter((x) => !x.name.endsWith("/"))) {
      expect(e.size, `${e.name} is empty in the archive`).toBeGreaterThan(0);
    }
  });

  it("ships no popup — it was deleted, and its absence is now enforced in the artifact", () => {
    // The popup died behind a parity gate (COMPLETION §2). webpack-config.test
    // asserts webpack emits no popup.html; this asserts nothing else puts one in
    // the box either — a stray file in src/static would be copied verbatim.
    expect(files).not.toContain("popup.html");
    expect(files).not.toContain("popup.js");
    expect(files.filter((f) => /popup/i.test(f))).toEqual([]);
  });

  it("ships no source maps, no .env, and no dotfiles", () => {
    // A .map republishes the whole readable source tree; a .env would publish
    // build config. Both are silent — the extension works perfectly with them.
    expect(files.filter((f) => f.endsWith(".map"))).toEqual([]);
    expect(files.filter((f) => /(^|\/)\.env/.test(f))).toEqual([]);
    expect(files.filter((f) => /(^|\/)\./.test(f))).toEqual([]); // .DS_Store, .git*, …
  });

  it("contains NOTHING outside the allowlist", () => {
    const unexpected = files.filter((f) => !ALLOWED.has(f));
    expect(
      unexpected,
      `unexpected file(s) in the store artifact: ${unexpected.join(", ")}. ` +
        "Do not widen ALLOWED to make this pass — decide whether the file should ship."
    ).toEqual([]);
  });

  it("has no directory entry outside icons/", () => {
    const dirs = entries.filter((e) => e.name.endsWith("/")).map((e) => e.name);
    expect(dirs).toEqual(["icons/"]);
  });
});
