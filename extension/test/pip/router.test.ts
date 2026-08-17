import { describe, it, expect } from "vitest";
import { decideMode, type RouteInput } from "../../src/pip/router";

const base: RouteInput = {
  tier: "pro",
  enhancedWindow: true,
  documentPipSupported: true,
};

describe("decideMode", () => {
  it("routes a licensed, opted-in user with support to the enhanced window", () => {
    expect(decideMode(base)).toBe("document");
  });

  it("routes to native when the user has not opted in", () => {
    expect(decideMode({ ...base, enhancedWindow: false })).toBe("native");
  });

  it("routes to native on the free tier even with the setting on", () => {
    // A lapsed or never-paid user keeps a working product. The paywall lives on
    // the options page and NOWHERE else — showing one at the moment of use would
    // punish a paying customer during a backend outage.
    expect(decideMode({ ...base, tier: "free" })).toBe("native");
  });

  it("routes to native when the browser lacks documentPictureInPicture", () => {
    expect(decideMode({ ...base, documentPipSupported: false })).toBe("native");
  });

  it("is native for every combination that is not all three", () => {
    for (const tier of ["free", "pro"] as const)
      for (const enhancedWindow of [true, false])
        for (const documentPipSupported of [true, false]) {
          const all = tier === "pro" && enhancedWindow && documentPipSupported;
          expect(decideMode({ tier, enhancedWindow, documentPipSupported })).toBe(
            all ? "document" : "native"
          );
        }
  });
});
