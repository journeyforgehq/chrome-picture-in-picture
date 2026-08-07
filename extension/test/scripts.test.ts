import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("package.json scripts", () => {
  const pkg = JSON.parse(
    readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
  );

  it("has build, build:dev, test, typecheck, and verify scripts", () => {
    expect(pkg.scripts.build).toBe("webpack --config webpack/webpack.prod.cjs");
    expect(pkg.scripts["build:dev"]).toBe("webpack --config webpack/webpack.dev.cjs");
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
    expect(pkg.scripts.verify).toBe("npm run typecheck && npm run test && npm run build");
  });
});
