import { describe, it, expect } from "vitest";
import { normalizeSize, sizeForOrigin, SIZE_PRESETS, type GeometryMap } from "../../src/pip/geometry";

describe("normalizeSize", () => {
  it("clamps to a floor so a corrupt record can never open a 0x0 window", () => {
    expect(normalizeSize({ w: 0, h: 0 })).toEqual({ w: 240, h: 135 });
  });

  it("clamps to a ceiling so a record larger than any screen cannot be requested", () => {
    expect(normalizeSize({ w: 99999, h: 99999 })).toEqual({ w: 1920, h: 1080 });
  });

  it("rejects NaN rather than passing it to requestWindow", () => {
    expect(normalizeSize({ w: NaN, h: 225 })).toEqual({ w: 240, h: 225 });
  });

  it("leaves a sane size untouched", () => {
    expect(normalizeSize({ w: 400, h: 225 })).toEqual({ w: 400, h: 225 });
  });
});

describe("sizeForOrigin", () => {
  const map: GeometryMap = { "https://a.example": { w: 640, h: 360 } };

  it("returns the remembered size for an origin that has one", () => {
    expect(sizeForOrigin(map, "https://a.example", "medium")).toEqual({ w: 640, h: 360 });
  });

  it("falls back to the preset for an origin that does not", () => {
    expect(sizeForOrigin(map, "https://b.example", "medium")).toEqual(SIZE_PRESETS.medium);
  });

  it("normalizes a remembered size, so a corrupt record cannot escape via memory", () => {
    expect(sizeForOrigin({ "https://c.example": { w: -5, h: -5 } }, "https://c.example", "small"))
      .toEqual({ w: 240, h: 135 });
  });
});
