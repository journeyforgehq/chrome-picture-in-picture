/* ============================================================================
 * RELEASE GATE FOR HUMAN-CAPTURED ARTWORK.
 * ============================================================================
 *
 * Wired into `npm run build:zip` — the command that produces the file uploaded
 * to the Chrome Web Store (see test/zip-artifact.test.ts's header: "`npm run
 * build:zip` is the release command"). It is deliberately NOT in `verify` or
 * `test`: those run dozens of times a day during development, and a gate that
 * blocks the inner loop gets commented out. This one only stands between the
 * placeholder and a published archive.
 *
 * IT GATES ON FILE SIZE, NOT ON VALIDITY OR DIMENSIONS. That is the whole
 * lesson of test/icons.test.ts: a flat blue placeholder square shipped all the
 * way to the final visual checkpoint because the test asked "is this a valid
 * PNG of the right size?", and a solid square answers yes to both. Real
 * artwork — and especially a photographic composite of two browser windows —
 * has detail, so it cannot compress to nothing. A structural check is exactly
 * the check a placeholder passes.
 *
 * The asset it guards cannot be produced by a tool, which is why it needs a
 * gate rather than a build step. See the failure message below.
 * ==========================================================================*/
import { statSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const EXT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The one asset this gate guards, and the floor it must clear.
 *
 * 40 KB is chosen the way icons.test.ts chooses its thresholds: measured
 * against what the placeholder actually is versus what the real thing cannot
 * help being. The committed placeholder is 80 bytes (a 24x12 flat magenta
 * PNG). The real asset is a composite of two screenshots of a video playing in
 * two browser windows, roughly 1300x400 or larger; at 40 KB that would be
 * about 0.08 bits per pixel, which no photographic content reaches. Anything
 * under the floor is synthetic — flat fill, solid blocks, a mock drawn in
 * code — and this gate exists precisely to refuse those.
 */
export const GUARDED_ASSETS = [
  {
    path: "src/static/pro-window-comparison.png",
    minBytes: 40_000,
    what: "the standard-vs-enhanced window comparison shown in the Pro disclosure panel",
  },
];

/** Pure checker: given {exists, bytes} for each asset, return human-readable
 *  issue strings (empty === ready to ship). Kept pure so it is unit-testable
 *  without touching the filesystem, matching scripts/preflight.mjs. */
export function scanAssets(assets) {
  const issues = [];
  for (const a of assets) {
    if (!a.exists) {
      issues.push(`${a.path}: MISSING — ${a.what}`);
      continue;
    }
    if (a.bytes < a.minBytes) {
      issues.push(
        `${a.path}: ${a.bytes} bytes, under the ${a.minBytes}-byte floor — this is still the placeholder, not ${a.what}`
      );
    }
  }
  return issues;
}

/** Reads the guarded assets off disk and scans them. CHECK_ASSETS_FILE
 *  overrides the single guarded path (used by test/check-assets.test.ts to
 *  exercise both branches without touching the committed placeholder), the
 *  same override convention scripts/zip-dist.mjs uses for ZIP_DIST_DIR. */
export function runCheckAssets(env = process.env) {
  const override = env.CHECK_ASSETS_FILE;
  const assets = GUARDED_ASSETS.map((a) => {
    const abs = override ? resolve(EXT_ROOT, override) : resolve(EXT_ROOT, a.path);
    const exists = existsSync(abs);
    return {
      ...a,
      path: override ? relative(EXT_ROOT, abs) : a.path,
      exists,
      bytes: exists ? statSync(abs).size : 0,
    };
  });
  return scanAssets(assets);
}

/* The message a human has to be able to act on WITHOUT reading this file, the
 * plan, or the spike. Every constraint in it is a fact about Chrome, not a
 * preference: the two windows cannot be photographed together, so this cannot
 * be a screen recording, a live demo, or anything a script can capture. */
export const HOW_TO_FIX = `
How to produce src/static/pro-window-comparison.png (a human has to do this;
no tool in this repo can, and generating an approximation is worse than
shipping nothing — a plausible fake survives review by LOOKING finished):

  1. Open a video in real Chrome. Pop it out with the STANDARD window
     (Settings > Enhanced window OFF). Screenshot that window.
  2. On the SAME video, at the SAME window size, turn Enhanced window ON,
     pop out again, and screenshot the Document PiP window — including the
     title bar Chrome draws across its top.
  3. Composite the two shots side by side into one static image and save it
     over src/static/pro-window-comparison.png.

Step 2 cannot be merged into step 1. Chrome permits exactly ONE Picture-in-
Picture surface at a time: opening a Document PiP window closes the native
one and vice versa. They are mutually exclusive, so no live demo, recording,
or automated capture can ever show them together. Two separate captures,
composited — that is the only way this image exists. See spike S-10, which
recorded the constraint and flagged this exact asset as "not captured".

The panel this image sits in is the paywall's honesty: it shows what a buyer
gains AND the 34px title bar they cannot remove, before asking for money.
Shipping the placeholder ships a magenta rectangle in its place.

AFTER you replace the file, two things need updating with it:
  - the visual baselines that currently contain the magenta rectangle:
      npm run e2e:visual -- --update-snapshots
    (dpip-disclosure-desktop-darwin.png, dpip-disclosure-mobile-darwin.png)
  - the last case in test/check-assets.test.ts, which asserts the shipped
    asset is STILL the placeholder. It flips to expecting exit code 0.
`.trimEnd();

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const issues = runCheckAssets();
  if (issues.length) {
    console.error(
      "check-assets: release BLOCKED — placeholder artwork is still in the tree:\n" +
        issues.map((i) => "  ✗ " + i).join("\n")
    );
    console.error(HOW_TO_FIX);
    process.exit(1);
  }
  console.log("check-assets OK — every guarded asset is real artwork, not a placeholder.");
}
