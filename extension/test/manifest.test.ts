import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("manifest.json", () => {
  const manifest = JSON.parse(
    readFileSync(path.resolve(__dirname, "../src/static/manifest.json"), "utf8")
  );

  it("is an MV3 manifest with the required billing permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage", "activeTab"]);
  });

  it("declares a module-type background service worker", () => {
    expect(manifest.background).toEqual({
      service_worker: "background.js",
      type: "module",
    });
  });

  it("declares exactly one content script entry, running at document_idle", () => {
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.content_scripts[0]).toMatchObject({
      js: ["content.js"],
      run_at: "document_idle",
    });
    expect(Array.isArray(manifest.content_scripts[0].matches)).toBe(true);
    expect(manifest.content_scripts[0].matches.length).toBeGreaterThan(0);
  });

  it("content script uses a narrow default match (not <all_urls>)", () => {
    const cs = manifest.content_scripts?.[0];
    expect(cs.matches).not.toContain("<all_urls>");
    expect(cs.matches).toEqual(["https://example.com/*"]);
  });

  it("uses the Picture in Picture - Floating Video Player scaffold token as the display name", () => {
    expect(manifest.name).toBe("Picture in Picture - Floating Video Player");
  });

  it("declares a popup action and an options page with icon triples", () => {
    expect(manifest.action).toEqual({
      default_popup: "popup.html",
      default_icon: {
        16: "icons/icon-16.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png",
      },
    });
    expect(manifest.options_page).toBe("options.html");
    expect(manifest.icons).toEqual({
      16: "icons/icon-16.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png",
    });
  });
});
