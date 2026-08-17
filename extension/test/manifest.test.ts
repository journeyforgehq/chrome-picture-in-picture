import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.resolve(__dirname, "../src/static/manifest.json"), "utf8")
);

describe("manifest permission allowlist (R-04)", () => {
  // An ALLOWLIST, not a denylist. A denylist would miss `proxy`, `debugger`,
  // `management`, `webRequestBlocking`, and anything Chrome adds after 2026.
  // Adding ANY permission fails here until someone consciously edits this line.
  it("declares exactly these three permissions and nothing else", () => {
    expect(manifest.permissions).toEqual(["storage", "activeTab", "scripting"]);
  });

  it("declares no static host permissions", () => {
    expect(manifest.host_permissions).toEqual([]);
  });

  it("requests <all_urls> only as an optional host permission", () => {
    expect(manifest.optional_host_permissions).toEqual(["<all_urls>"]);
  });

  // R-03: a static block would stake the minimal-install-prompt advantage on
  // "a block probably stays inert while host_permissions is empty".
  it("has no static content_scripts block", () => {
    expect(manifest.content_scripts).toBeUndefined();
  });

  // S-06: not because page CSP would block a stylesheet (it would not — content
  // scripts are CSP-exempt), but because fewer exposed resources means less
  // fingerprinting surface. The toast uses a shadow root instead.
  it("exposes no web-accessible resources", () => {
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  // Gesture invariant 3: the key and the click must share ONE handler.
  it("binds the shortcut to _execute_action, never a custom command", () => {
    expect(manifest.commands._execute_action).toEqual({
      suggested_key: { default: "Alt+P", mac: "Alt+P" },
    });
    const custom = Object.keys(manifest.commands).filter((k) => !k.startsWith("_"));
    expect(custom).toEqual([]);
  });

  it("has no default_popup — the toolbar button is the feature", () => {
    expect(manifest.action.default_popup).toBeUndefined();
  });

  // documentPictureInPicture (the paid tier, a later plan) requires exactly 116.
  it("floors at Chrome 116", () => {
    expect(manifest.minimum_chrome_version).toBe("116");
  });

  it("keeps the icon triple the factory actually generates", () => {
    expect(manifest.icons).toEqual({
      16: "icons/icon-16.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    });
  });

  /* --------------------------------------------------------------------------
   * `action.default_icon` — the TOOLBAR button's artwork.
   *
   * Narrow on purpose. The whole-`action` `toEqual` was dropped when
   * default_popup was removed (a recorded, conscious trade — see "manifest
   * identity" below) and is deliberately NOT restored here: re-pinning the whole
   * object just breaks again the next time the shape moves. What was left
   * unguarded by that trade is this one key. `icons` above is the *store/
   * extensions-page* icon; delete `default_icon` and Chrome falls back to a grey
   * puzzle piece on the toolbar — which is the entire UI of this product — while
   * every other assertion in this file stays green.
   *
   * The paths are resolved on disk, not merely compared as strings, because this
   * repo has already shipped an icon defect that a string check could not see
   * (COMPLETION §5: a flat blue placeholder square passed `test/icons.test.ts`).
   * A manifest that points at a file that isn't there is the other half of that.
   * ------------------------------------------------------------------------*/
  it("carries the 16/48/128 default_icon triple on the toolbar action", () => {
    expect(manifest.action.default_icon).toEqual({
      16: "icons/icon-16.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    });
  });

  it("points default_icon at files that exist on disk", () => {
    const paths = Object.values(manifest.action.default_icon as Record<string, string>);
    expect(paths).toHaveLength(3);
    for (const rel of paths) {
      const file = path.resolve(__dirname, "../src/static", rel);
      expect(existsSync(file), `${rel} is declared in the manifest but missing`).toBe(true);
    }
  });
});

/* ============================================================================
 * SCAFFOLD-RENAME GUARD — restored, not new.
 *
 * The factory stamps this child's name into the manifest, and the template
 * pinned that literal so a half-finished rename could not ship. The R-04
 * rewrite of this file dropped the assertion; it is back because it was ALSO
 * the compensating control for deliberately dropping inventory row 34, the
 * `data-picture-in-picture-present` slug-token check in test/content.test.ts.
 * That drop was justified on the grounds that this assertion would still catch
 * a missed rename. With both gone, nothing did. The two are not in tension with
 * the allowlist above — one guards identity, the other guards privilege.
 * ==========================================================================*/
describe("manifest identity", () => {
  it("pins the child's name, so a half-finished scaffold rename cannot ship", () => {
    expect(manifest.name).toBe("Picture in Picture - Floating Video Player");
  });

  it("is MV3 and carries a description and a version", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.description).toBeTruthy();
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // Deliberately NOT a toEqual on the whole `action`/`background` blocks — those
  // were narrowed on purpose when default_popup was removed, and re-pinning whole
  // objects would just break again the next time the shape moves.
  it("ships options.html as the extension's page", () => {
    expect(manifest.options_page).toBe("options.html");
  });

  // FOUND BY LOOKING AT THE REAL PAGE (task 22). The preview gallery supplies
  // its own HTML shell, so the options page's <title> is invisible to every
  // gallery screenshot and to every spec that asserts on rendered React — and
  // it still read "Reference Extension — Settings" while the <h2> six lines
  // below it read "Picture in Picture — Settings". It is the string Chrome puts
  // in the tab and in the window title, i.e. the one piece of the options page
  // that React never renders. Pinned here with the manifest name because it is
  // the same failure mode: a half-finished scaffold rename.
  it("names the options page after the product, not the scaffold", () => {
    const html = readFileSync(path.resolve(__dirname, "../src/options/options.html"), "utf8");
    expect(html).toContain("<title>Picture in Picture — Settings</title>");
    expect(html).not.toMatch(/Reference Extension/);
  });
});
