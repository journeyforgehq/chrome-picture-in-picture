import { describe, it, expect } from "vitest";
import { decideOutcome } from "../../src/background/action";
import type { PipEntryResult } from "../../src/pip/entry";

const frame = (p: Partial<PipEntryResult>): PipEntryResult => ({
  frame: "TOP", acted: false, winner: null, candidates: [], ...p,
});

describe("decideOutcome", () => {
  it("is silent on success — no toast when PiP opened", () => {
    expect(decideOutcome([frame({ acted: true, outcome: "PIP_OK" })])).toEqual({ toast: null });
  });

  it("is silent when PiP was closed by the same click", () => {
    expect(decideOutcome([frame({ acted: true, outcome: "PIP_EXITED" })])).toEqual({ toast: null });
  });

  it("reports NO_VIDEO when every frame found nothing", () => {
    expect(decideOutcome([frame({ reason: "none-found" })]).toast).toBe("NO_VIDEO");
  });

  it("prefers the site-disabled explanation over the generic empty one", () => {
    const out = decideOutcome([
      frame({ reason: "none-found" }),
      frame({ frame: "SUBFRAME", reason: "pip-disabled-by-site" }),
    ]);
    expect(out.toast).toBe("SITE_DISABLED");
  });

  it("prefers not-ready over none-found", () => {
    expect(decideOutcome([frame({ reason: "none-found" }), frame({ reason: "not-ready" })]).toast)
      .toBe("NOT_READY");
  });

  it("maps a SecurityError from a subframe to IFRAME_BLOCKED", () => {
    const out = decideOutcome([
      frame({ frame: "SUBFRAME", acted: true, outcome: "THREW", errorName: "SecurityError" }),
    ]);
    expect(out.toast).toBe("IFRAME_BLOCKED");
  });

  it("maps pip-unavailable to its own message", () => {
    expect(decideOutcome([frame({ reason: "pip-unavailable" })]).toast).toBe("PIP_UNAVAILABLE");
  });

  it("ignores frames that stood down — not-winner is arbitration working, not a failure", () => {
    const out = decideOutcome([
      frame({ acted: true, outcome: "PIP_OK" }),
      frame({ frame: "SUBFRAME", reason: "not-winner" }),
    ]);
    expect(out.toast).toBeNull();
  });

  it("reports NO_VIDEO when every frame stood down and none acted", () => {
    expect(decideOutcome([frame({ reason: "not-winner" })]).toast).toBe("NO_VIDEO");
  });

  it("treats an empty result array as a restricted URL", () => {
    expect(decideOutcome([]).toast).toBe("RESTRICTED_URL");
  });

  it("maps a NotAllowedError to PIP_UNAVAILABLE", () => {
    const out = decideOutcome([
      frame({ acted: true, outcome: "THREW", errorName: "NotAllowedError" }),
    ]);
    expect(out.toast).toBe("PIP_UNAVAILABLE");
  });
});
