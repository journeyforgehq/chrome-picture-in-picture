import { describe, it, expect } from "vitest";
import * as uiKit from "../../src/ui-kit";

describe("ui-kit barrel", () => {
  it("exports theme + ThemeProvider", () => {
    expect(typeof uiKit.buildTheme).toBe("function");
    expect(typeof uiKit.ThemeProvider).toBe("function");
  });

  it("exports all five billing components", () => {
    expect(typeof uiKit.TierBadge).toBe("function");
    expect(typeof uiKit.PlanBadge).toBe("function");
    expect(typeof uiKit.LockedFeature).toBe("function");
    expect(typeof uiKit.UpgradePaywall).toBe("function");
    expect(typeof uiKit.RestoreForm).toBe("function");
  });
});
