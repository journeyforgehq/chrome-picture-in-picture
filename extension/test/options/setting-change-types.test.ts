import { describe, it, expect } from "vitest";
import type { ComponentProps } from "react";
import type { PipSettings } from "../../src/pip/state";

/* A compile-time guard, asserted at runtime only so vitest counts it. If the
 * signature regresses to `value: boolean`, the @ts-expect-error below stops
 * being an error and tsc fails the build — which is the actual assertion. */
describe("onSettingChange is key-bound", () => {
  it("rejects a boolean for windowSize", () => {
    type Handler = <K extends keyof PipSettings>(key: K, value: PipSettings[K]) => void;
    const h: Handler = () => {};
    // @ts-expect-error windowSize is a SizePreset, not a boolean
    h("windowSize", true);
    h("windowSize", "large");
    h("enhancedWindow", true);
    expect(true).toBe(true);
  });

  /* The guard above is only meaningful if OptionsView's REAL prop has that
   * shape — a matching local type alias would keep passing while the component
   * drifted back to `value: boolean`. So assign the real prop type too. */
  it("is the shape OptionsView actually declares", async () => {
    const { OptionsView } = await import("../../src/options/OptionsView");
    type Real = ComponentProps<typeof OptionsView>["onSettingChange"];
    const real: Real = () => {};
    // @ts-expect-error windowSize is a SizePreset, not a boolean
    real("windowSize", true);
    real("windowSize", "small");
    real("toastEnabled", false);
    expect(typeof OptionsView).toBe("function");
  });
});
