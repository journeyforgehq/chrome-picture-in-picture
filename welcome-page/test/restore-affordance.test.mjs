/* ============================================================================
 * The restore affordance must be something that WORKS.
 * ============================================================================
 *
 * `pro.restoreHref` used to be `chrome-extension://__EXT_ID__/options.html`,
 * recorded as "substitute the real id before submission". That reading was
 * wrong, and the wrongness is the reason this file exists: **a hosted web page
 * cannot navigate to a `chrome-extension://` URL at all** unless the target is
 * listed in the extension's `web_accessible_resources` with matching origins,
 * and this manifest deliberately has none (less fingerprinting surface). The id
 * was never the missing piece. Filling it in would have produced a link that
 * looked finished and did nothing — the same class of bug as the dead
 * `chrome://extensions/shortcuts` anchor already fixed in the options page.
 *
 * So the guard is not "is the placeholder resolved". It is "does this page ship
 * a `chrome-extension://` link at all", plus "is the thing that replaced it
 * actually present" — because a check for absence alone would also pass if the
 * restore affordance had simply been deleted, which would strip a paying user's
 * only route back to their purchase.
 *
 * Node's built-in runner on purpose — see the note in disclosure.test.mjs.
 * ==========================================================================*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentPath = join(root, "src", "content.ts");
const indexPath = join(root, "src", "pages", "index.tsx");
const publicDir = join(root, "public");

/** Strip comments: this file's own explanations quote the URL scheme it bans. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function walkDir(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkDir(p));
    else out.push(p);
  }
  return out;
}

test("source: no chrome-extension:// URL is configured anywhere in the content", () => {
  const content = stripComments(readFileSync(contentPath, "utf8"));
  assert.ok(
    !content.includes("chrome-extension://"),
    "content.ts configures a chrome-extension:// URL. A hosted page cannot navigate to one " +
      "without web_accessible_resources, and this manifest deliberately has none — the link " +
      "would be inert no matter which extension id is filled in."
  );
  // The token that used to sit inside that URL. Its absence must not be read as
  // "resolved": there was nothing to resolve.
  assert.ok(!content.includes("__EXT_ID__"), "the __EXT_ID__ placeholder is back in content.ts");
});

test("source: restoreHref is empty, not a plausible-looking URL", () => {
  const content = stripComments(readFileSync(contentPath, "utf8"));
  const match = content.match(/restoreHref:\s*"([^"]*)"/);
  assert.ok(match, "restoreHref is missing — WelcomeContent requires it");
  assert.equal(
    match[1],
    "",
    `restoreHref is ${JSON.stringify(match[1])}. Nothing renders it, and no URL it could hold ` +
      `would open the extension's options from a hosted page. Empty is visibly broken rather ` +
      `than quietly inert.`
  );
});

test("source: CORE ProTeaser is not mounted, its replacement is", () => {
  // CORE `sections/ProTeaser.tsx` renders restoreHref unconditionally as a
  // button, so mounting it would put the dead link straight back on the page.
  const index = stripComments(readFileSync(indexPath, "utf8")).replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
  assert.ok(
    !/<ProTeaser\s/.test(index),
    "CORE ProTeaser is mounted again — it renders pro.restoreHref as a button, which cannot work"
  );
  assert.match(
    index,
    /<ProTeaserWithRestoreNote\s/,
    "the Pro teaser replacement is not mounted — the Pro section would vanish entirely"
  );
});

test("built: the served page offers restore INSTRUCTIONS and no chrome-extension:// link", (t) => {
  if (!existsSync(publicDir)) {
    t.skip(
      "welcome-page/public/ not found — run `npm run build` first. " +
        "This test is advisory locally and strict in CI, where the build runs before it."
    );
    return;
  }

  const html = walkDir(publicDir).filter((f) => extname(f) === ".html");
  assert.ok(html.length > 0, "public/ exists but contains no built html — build looks broken");

  for (const f of html) {
    const body = readFileSync(f, "utf8");
    assert.ok(
      !body.includes("chrome-extension://"),
      `${f} ships a chrome-extension:// URL — it would be an inert control on a hosted page`
    );
  }

  // The replacement actually reached the user, server-rendered, without JS.
  const withNote = html.filter((f) => {
    const body = readFileSync(f, "utf8");
    return body.includes('data-testid="restore-instructions"');
  });
  assert.ok(
    withNote.length > 0,
    "no server-rendered HTML carries the restore instructions — a paying user would have no " +
      "route back to their purchase from this page"
  );

  // And it names the route that works.
  const note = readFileSync(withNote[0], "utf8");
  assert.match(
    note,
    /Options/,
    "the restore instructions do not tell the user to open the extension's Options page"
  );

  // The Pro CTA survived the section replacement — parity, not a redesign.
  const withCta = html.filter((f) => readFileSync(f, "utf8").includes('data-testid="pro-cta"'));
  assert.ok(withCta.length > 0, "the Pro CTA disappeared along with the dead restore link");
});
