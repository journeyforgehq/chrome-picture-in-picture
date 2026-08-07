import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SIZES = [16, 48, 128];

beforeAll(() => {
  execFileSync("node", [path.join(ROOT, "scripts/gen-icons.mjs")], { cwd: ROOT });
}, 30_000);

describe("gen-icons.mjs", () => {
  for (const size of SIZES) {
    it(`writes a non-empty, valid PNG at icon-${size}.png`, () => {
      const file = path.join(ROOT, "src/static/icons", `icon-${size}.png`);
      expect(existsSync(file)).toBe(true);

      const buf = readFileSync(file);
      expect(buf.length).toBeGreaterThan(0);

      const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);

      const ihdrType = buf.subarray(12, 16).toString("ascii");
      expect(ihdrType).toBe("IHDR");
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      expect(width).toBe(size);
      expect(height).toBe(size);
    });
  }
});
