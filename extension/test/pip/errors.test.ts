import { describe, it, expect } from "vitest";
import { PIP_ERROR_CODES, messageFor, severityFor } from "../../src/pip/errors";

describe("pip error catalogue", () => {
  it("maps every code to a non-empty, sentence-cased message", () => {
    for (const code of PIP_ERROR_CODES) {
      const msg = messageFor(code);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg[0]).toBe(msg[0].toUpperCase());
    }
  });

  it("carries the six states the free product can reach", () => {
    expect(PIP_ERROR_CODES).toEqual([
      "NO_VIDEO",
      "NOT_READY",
      "SITE_DISABLED",
      "IFRAME_BLOCKED",
      "PIP_UNAVAILABLE",
      "RESTRICTED_URL",
    ]);
  });

  it("uses the exact shipped copy", () => {
    expect(messageFor("NO_VIDEO")).toBe("No video found on this page.");
    expect(messageFor("NOT_READY")).toBe(
      "This video hasn't loaded yet. Press play, then try again."
    );
    expect(messageFor("SITE_DISABLED")).toBe(
      "This site has turned off picture-in-picture for this video."
    );
    expect(messageFor("IFRAME_BLOCKED")).toBe(
      "This embedded player doesn't allow picture-in-picture."
    );
    expect(messageFor("PIP_UNAVAILABLE")).toBe(
      "Picture-in-picture is turned off in this browser."
    );
  });

  // No injection is possible on chrome:// or the Web Store, so there is
  // nowhere to render a toast. The icon tooltip is the only channel.
  it("marks RESTRICTED_URL as tooltip-only", () => {
    expect(severityFor("RESTRICTED_URL")).toBe("tooltip");
  });

  it("splits the rest into info and blocked severities", () => {
    expect(severityFor("NO_VIDEO")).toBe("info");
    expect(severityFor("NOT_READY")).toBe("info");
    expect(severityFor("SITE_DISABLED")).toBe("blocked");
    expect(severityFor("IFRAME_BLOCKED")).toBe("blocked");
    expect(severityFor("PIP_UNAVAILABLE")).toBe("blocked");
  });
});
