import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import webpack from "webpack";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runWebpack(configPath: string) {
  const config = require(configPath);
  const compiler = webpack(config);
  const run = promisify(compiler.run.bind(compiler));
  return run().finally(() => promisify(compiler.close.bind(compiler))());
}

describe("content-script/ui-kit separation guard", () => {
  it("passes on the real build: content chunk stays antd-free", async () => {
    const stats: any = await runWebpack(
      path.resolve(__dirname, "../webpack/webpack.prod.cjs")
    );
    expect(stats.hasErrors()).toBe(false);

    const contentChunk = [...stats.compilation.chunks].find(
      (c: any) => c.name === "content"
    );
    const modules = [
      ...stats.compilation.chunkGraph.getChunkModulesIterable(contentChunk),
    ];
    const antdLeak = modules.some((m: any) =>
      /node_modules[\\/]antd|node_modules[\\/]@ant-design|[\\/]ui-kit[\\/]/.test(m.resource || "")
    );
    expect(antdLeak).toBe(false);
  }, 30_000);

  it("FAILS the build when the content entry transitively imports ui-kit", async () => {
    await expect(
      runWebpack(path.resolve(__dirname, "./separation-fixture/webpack.fixture.cjs"))
    ).rejects.toThrow(/separation-guard/i);
  }, 30_000);
});
