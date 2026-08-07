import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
});
