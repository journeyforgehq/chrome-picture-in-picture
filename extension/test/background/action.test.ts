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

  it("maps the pip-unavailable REASON to PIP_UNAVAILABLE", () => {
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

  /* ==========================================================================
   * THE TWO PATHS THAT USED TO SHARE ONE MESSAGE.
   * ==========================================================================
   * entry.ts checks document.pictureInPictureEnabled and returns the
   * `pip-unavailable` REASON *before* it ever calls requestPictureInPicture().
   * So a NotAllowedError OUTCOME can only come from a frame that got past that
   * guard — picture-in-picture was enabled, and the request was refused for
   * another cause (a spent user activation, in practice). Mapping it to
   * PIP_UNAVAILABLE told users with working picture-in-picture that their
   * browser had it switched off, and pointed them at nothing they could do.
   * ========================================================================*/
  it("maps a NotAllowedError OUTCOME to PIP_REFUSED, not PIP_UNAVAILABLE", () => {
    const out = decideOutcome([
      frame({ acted: true, outcome: "THREW", errorName: "NotAllowedError" }),
    ]);
    expect(out.toast).toBe("PIP_REFUSED");
  });

  it("keeps the two paths distinguishable: same click, two different toasts", () => {
    // A frame that never reached the API because the capability is off.
    const disabled = decideOutcome([frame({ reason: "pip-unavailable" })]);
    // A frame that DID reach the API and had the request refused.
    const refused = decideOutcome([
      frame({ acted: true, outcome: "THREW", errorName: "NotAllowedError" }),
    ]);

    expect(disabled.toast).toBe("PIP_UNAVAILABLE");
    expect(refused.toast).toBe("PIP_REFUSED");
    expect(disabled.toast).not.toBe(refused.toast);
  });

  it("lets the acting frame's refusal beat a sibling's pip-unavailable reason", () => {
    // The reason branch is only consulted when NOBODY acted, so an actor that
    // was refused must not be relabelled by another frame's stale capability
    // report.
    const out = decideOutcome([
      frame({ frame: "SUBFRAME", reason: "pip-unavailable" }),
      frame({ acted: true, outcome: "THREW", errorName: "NotAllowedError" }),
    ]);
    expect(out.toast).toBe("PIP_REFUSED");
  });
});

describe("decideOutcome — the enhanced-window fallback", () => {
  it("says so when the enhanced window failed and the native one opened instead", () => {
    expect(decideOutcome([{ frame: "TOP", acted: true, winner: null, candidates: [],
      mode: "native", fellBackFrom: "document", outcome: "PIP_OK" }]))
      .toEqual({ toast: "ENHANCED_UNAVAILABLE" });
  });

  it("stays SILENT on an ordinary native success — success has never had a toast", () => {
    expect(decideOutcome([{ frame: "TOP", acted: true, winner: null, candidates: [],
      mode: "native", outcome: "PIP_OK" }])).toEqual({ toast: null });
  });

  it("stays silent when the enhanced window opened as intended", () => {
    expect(decideOutcome([{ frame: "TOP", acted: true, winner: null, candidates: [],
      mode: "document", outcome: "PIP_OK" }])).toEqual({ toast: null });
  });

  it("reports the real failure, not the fallback notice, when the native fallback itself fails", () => {
    // pipEntry can produce THREW with fellBackFrom still set: the enhanced
    // window failed, native was tried as a rescue, and native ALSO failed. The
    // user got no window at all here, so the actionable failure code must win
    // over the (silent-except-for-fallback) ENHANCED_UNAVAILABLE notice.
    const out = decideOutcome([
      { frame: "TOP", acted: true, winner: null, candidates: [], mode: "native",
        fellBackFrom: "document", outcome: "THREW", errorName: "NotAllowedError" },
    ]);
    expect(out.toast).toBe("PIP_REFUSED");
  });
});
