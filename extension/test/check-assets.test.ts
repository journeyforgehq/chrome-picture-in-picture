/* ============================================================================
 * THE GATE'S OWN TEST.
 * ============================================================================
 *
 * scripts/check-assets.mjs blocks `npm run build:zip` — the command that
 * produces the Chrome Web Store archive — until a human replaces the
 * placeholder comparison image with a real capture. A gate nobody tested is a
 * gate that can silently stop gating, which is the failure
 * scripts/preflight.mjs's own header records: its placeholder regex quietly
 * stopped matching the tokens it existed to catch, and the green run then read
 * as "no placeholders shipped" rather than "not looking".
 *
 * It is run as a SUBPROCESS rather than imported, because the thing that
 * actually blocks a release is the process exit code, and that is what these
 * assert. CHECK_ASSETS_FILE redirects the guarded path (the same override
 * convention scripts/zip-dist.mjs uses for ZIP_DIST_DIR) so both branches are
 * exercised without touching the committed placeholder.
 * ==========================================================================*/
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/check-assets.mjs");
const ASSET = path.join(ROOT, "src/static/pro-window-comparison.png");

let tmp: string;

/** Runs the gate, optionally against a substitute file. */
function run(file?: string) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(file ? { CHECK_ASSETS_FILE: file } : {}) },
  });
  return { code: res.status, out: res.stdout ?? "", err: res.stderr ?? "" };
}

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "check-assets-"));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("check-assets — the release gate", () => {
  it("FAILS on a placeholder-sized file", () => {
    const tiny = path.join(tmp, "tiny.png");
    // The committed placeholder itself: 80 bytes of flat magenta.
    writeFileSync(tiny, readFileSync(ASSET));
    const { code, err } = run(tiny);
    expect(code).toBe(1);
    expect(err).toMatch(/release BLOCKED/i);
    expect(err).toMatch(/placeholder/i);
  });

  it("FAILS when the asset is missing entirely", () => {
    const { code, err } = run(path.join(tmp, "does-not-exist.png"));
    expect(code).toBe(1);
    expect(err).toMatch(/MISSING/);
  });

  it("PASSES on a file large enough to be a real capture", () => {
    const big = path.join(tmp, "real.png");
    // 64 KB — over the 40 KB floor. Content is irrelevant: the gate is
    // deliberately a SIZE check, because a structural "is this a valid PNG of
    // the right dimensions" check is exactly what a flat placeholder passes
    // (test/icons.test.ts, where a blue square did precisely that).
    writeFileSync(big, Buffer.alloc(64 * 1024, 7));
    const { code, out } = run(big);
    expect(code).toBe(0);
    expect(out).toMatch(/check-assets OK/);
  });

  /* The failure message is the ONLY place the human who has to produce this
   * asset learns how. If it degrades into "asset too small", the gate stops
   * being actionable and starts being an obstacle someone deletes. */
  it("tells the human exactly what to do, including why it cannot be one capture", () => {
    const { err } = run(path.join(tmp, "does-not-exist.png"));
    expect(err).toMatch(/src\/static\/pro-window-comparison\.png/);
    expect(err).toMatch(/same video/i);
    expect(err).toMatch(/same window size/i);
    expect(err).toMatch(/composite/i);
    // The constraint that makes a live demo impossible: Chrome permits exactly
    // one PiP surface at a time, so the two windows are mutually exclusive.
    expect(err).toMatch(/one Picture-in-\s*\n?Picture surface at a time/i);
    expect(err).toMatch(/mutually exclusive/i);
    expect(err).toMatch(/S-10/);
  });

  it("guards the real committed asset by default, and that asset is STILL the placeholder", () => {
    // No override: this is the shipped configuration. It currently fails, and
    // it is supposed to — the comparison image does not exist yet and cannot
    // be generated. When a human lands the real capture this expectation
    // flips to 0, and flipping it is the correct edit at that moment.
    const { code, err } = run();
    expect(code).toBe(1);
    expect(err).toMatch(/src\/static\/pro-window-comparison\.png/);
  });
});

describe("check-assets — wiring", () => {
  it("is the first step of build:zip, so no archive can be produced without it", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["check:assets"]).toBe("node scripts/check-assets.mjs");
    // FIRST, not last: zip-dist.mjs writes extension.zip, and a gate that runs
    // after it has already produced the very file it exists to prevent.
    expect(pkg.scripts["build:zip"]).toBe(
      "npm run check:assets && npm run build && node scripts/zip-dist.mjs"
    );
  });

  it("stays out of the inner loop — verify/test/build must not depend on it", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    // A gate wired into the dozens-of-times-a-day commands is a gate that gets
    // commented out. This one stands between the placeholder and a PUBLISHED
    // archive, and nowhere else.
    for (const s of ["verify", "test", "build", "build:dev"]) {
      expect(pkg.scripts[s]).not.toContain("check:assets");
    }
  });
});
