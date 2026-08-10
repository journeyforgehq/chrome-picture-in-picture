import { describe, it, expect } from "vitest";
import { prefsFrom, type PipPrefs } from "../../src/pip/prefs";
import { DEFAULT_SETTINGS } from "../../src/pip/state";

describe("prefsFrom", () => {
  it("builds a prefs record from settings + entitlement cache + geometry", () => {
    const p = prefsFrom(
      { ...DEFAULT_SETTINGS, enhancedWindow: true, windowSize: "large" },
      { tier: "pro", checkedAt: 0 },
      { "https://a.example": { w: 500, h: 281 } }
    );
    expect(p).toEqual<PipPrefs>({
      tier: "pro",
      enhancedWindow: true,
      windowSize: "large",
      rememberSizePerSite: true,
      inWindowControls: true,
      subtitles: false,
      geometry: { "https://a.example": { w: 500, h: 281 } },
    });
  });

  it("treats a missing entitlement cache as free, never as pro", () => {
    // Fail closed. A null cache means "we do not know", and guessing pro would
    // hand the paid window to everyone whose cache had not been written yet.
    expect(prefsFrom(DEFAULT_SETTINGS, null, {}).tier).toBe("free");
  });
});
