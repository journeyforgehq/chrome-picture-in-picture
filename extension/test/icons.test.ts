import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SIZES = [16, 48, 128];

// The shipped icons are DESIGN ASSETS, rendered from 05-graphics-src in the design
// package — not generated. scripts/gen-icons.mjs still exists as the factory's
// scaffold convenience, and it emits a flat accent-coloured square with no glyph.
//
// This test used to run gen-icons.mjs in beforeAll, which meant every `npm test`
// silently overwrote the real artwork with placeholders. It was also why a blank
// blue square survived all the way to the final visual checkpoint: the test
// asserted "a valid PNG of the right size", which a solid square satisfies
// perfectly. DO NOT reintroduce that beforeAll.
describe("shipped icons", () => {
  for (const size of SIZES) {
    it(`icon-${size}.png is a valid PNG at exactly ${size}x${size}`, () => {
      const file = path.join(ROOT, "src/static/icons", `icon-${size}.png`);
      expect(existsSync(file)).toBe(true);

      const buf = readFileSync(file);
      const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    });
  }

  // A solid square passes every structural check above, which is exactly how the
  // placeholder shipped unnoticed. Real artwork has detail, so it does not
  // compress to almost nothing. gen-icons.mjs emits 82 bytes at 16px and 359 at
  // 128px; the design icons are 322 and 1449.
  it("carries actual artwork, not the flat placeholder square", () => {
    const bytes = (s: number) =>
      readFileSync(path.join(ROOT, "src/static/icons", `icon-${s}.png`)).length;
    expect(bytes(16)).toBeGreaterThan(200);
    expect(bytes(128)).toBeGreaterThan(800);
  });
});
