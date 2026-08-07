import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("webpack.preview.cjs", () => {
  it("builds the gallery entry to dist-preview/ without errors", async () => {
    const webpack = require("webpack");
    const { promisify } = require("node:util");
    const config = require(path.resolve(__dirname, "../webpack/webpack.preview.cjs"));
    const compiler = webpack(config);
    const run = promisify(compiler.run.bind(compiler));
    const stats: any = await run().finally(() => promisify(compiler.close.bind(compiler))());
    expect(stats.hasErrors()).toBe(false);

    const assetNames = Object.keys(stats.compilation.assets);
    expect(assetNames).toContain("gallery.js");
    expect(assetNames).toContain("index.html");
  }, 30_000);
});
