import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpack from "webpack";
import { promisify } from "node:util";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runWebpack(configPath: string): Promise<webpack.Stats> {
  const config = require(configPath);
  const compiler = webpack(config);
  const run = promisify(compiler.run.bind(compiler)) as () => Promise<webpack.Stats>;
  return run().finally(() => promisify(compiler.close.bind(compiler))());
}

describe("webpack.prod.cjs", () => {
  it("builds background.js and content.js with no errors", async () => {
    process.env.BACKEND_BASE_URL = "https://api.example.com";
    const stats = await runWebpack(path.resolve(__dirname, "../webpack/webpack.prod.cjs"));

    expect(stats.hasErrors()).toBe(false);
    const { assetsByChunkName } = stats.toJson({ assets: true });
    expect(assetsByChunkName?.background).toBeDefined();
    expect(assetsByChunkName?.content).toBeDefined();
  }, 30_000);

  it('pins DEV_PRO to "false" in the injected DefinePlugin regardless of shell env (spec §9)', () => {
    // Robust safety-gate check: assert what the prod config INJECTS, not a
    // substring of the (constant-folded, minified) output bundle.
    process.env.DEV_PRO = "true"; // hostile: try to force dev-pro on
    const prodConfig = require(path.resolve(__dirname, "../webpack/webpack.prod.cjs"));
    const define = prodConfig.plugins.find(
      (p: any) => p && p.constructor && p.constructor.name === "DefinePlugin"
    );
    expect(define).toBeDefined();
    expect(define.definitions["process.env.DEV_PRO"]).toBe('"false"');
    delete process.env.DEV_PRO;
  });

  it("builds options.js/options.html alongside background/content", async () => {
    process.env.BACKEND_BASE_URL = "https://api.example.com";
    const stats = await runWebpack(path.resolve(__dirname, "../webpack/webpack.prod.cjs"));

    expect(stats.hasErrors()).toBe(false);
    const { assetsByChunkName, assets } = stats.toJson({ assets: true });
    expect(assetsByChunkName?.options).toBeDefined();

    const assetNames = (assets ?? []).map((a) => a.name);
    expect(assetNames).toContain("options.html");

    // The popup is gone (inventory row 15, signed off 2026-08-09). Asserting its
    // ABSENCE, not just dropping the old assertion: a stray HtmlWebpackPlugin or
    // a re-added entry should fail here rather than quietly ship a dead page.
    expect(assetsByChunkName?.popup).toBeUndefined();
    expect(assetNames).not.toContain("popup.html");
  }, 30_000);

  /* ==========================================================================
   * THE GUARD THAT GUARDS THE GUARD.
   *
   * webpack/separation-guard.cjs opens with `if (!contentChunk) return;` — it
   * silently no-ops when no chunk is named `content`. That guard is the only
   * thing keeping antd and ui-kit out of the bundle injected into arbitrary
   * pages, and the way to disarm it is not to edit it: it is to rename or drop
   * the `content` entry in webpack.common.cjs. Deleting the popup was exactly
   * such an edit to that entry map, which is why this exists.
   *
   * test/separation.test.ts proves the guard WORKS. This proves it is ARMED.
   * ========================================================================*/
  it("keeps a chunk named `content` in existence, so the separation guard stays armed", async () => {
    process.env.BACKEND_BASE_URL = "https://api.example.com";
    const stats = await runWebpack(path.resolve(__dirname, "../webpack/webpack.prod.cjs"));

    const chunkNames = stats
      .toJson({ chunks: true })
      .chunks!.flatMap((c) => c.names ?? []);
    expect(chunkNames).toContain("content");
  }, 30_000);
});

describe("webpack.dev.cjs", () => {
  it("builds successfully with inline source maps", async () => {
    process.env.BACKEND_BASE_URL = "http://localhost:8787";
    const stats = await runWebpack(path.resolve(__dirname, "../webpack/webpack.dev.cjs"));

    expect(stats.hasErrors()).toBe(false);
    const json = stats.toJson({ errors: true });
    expect(json.errors).toHaveLength(0);
  }, 30_000);
});

describe("webpack.common.cjs .env loading", () => {
  it("webpack.common loads STRIPE_ANNUAL_URL from a .env file (dotenv) into DefinePlugin", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    const envFile = join(dir, ".env");
    writeFileSync(envFile, "STRIPE_ANNUAL_URL=https://buy.stripe.com/test_annual\n");
    const prev = process.env.STRIPE_ANNUAL_URL;
    delete process.env.STRIPE_ANNUAL_URL;
    process.env.DOTENV_CONFIG_PATH = envFile;
    try {
      vi.resetModules();
      // load the config module fresh (same require mechanism the file uses).
      // The top-level dotenv load runs at module-eval time, so bust the CJS
      // require cache to force re-evaluation with DOTENV_CONFIG_PATH set.
      const configPath = path.resolve(__dirname, "../webpack/webpack.common.cjs");
      delete require.cache[require.resolve(configPath)];
      const mod = require(configPath);
      const factory = typeof mod === "function" ? mod : mod.default;
      const config = factory(false);
      const define = config.plugins.find(
        (p: any) => p?.definitions?.["process.env.STRIPE_ANNUAL_URL"]
      );
      expect(define.definitions["process.env.STRIPE_ANNUAL_URL"]).toBe(
        JSON.stringify("https://buy.stripe.com/test_annual")
      );
    } finally {
      delete process.env.DOTENV_CONFIG_PATH;
      if (prev !== undefined) process.env.STRIPE_ANNUAL_URL = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
