import { describe, it, expect, vi } from "vitest";
import { handleInstalled, handleMessage, uninstallUrl } from "../src/background/background";

describe("handleInstalled", () => {
  it("opens the welcome URL on a fresh install", () => {
    const openTab = vi.fn();
    handleInstalled({ reason: "install" }, "https://example.com/welcome", openTab);
    expect(openTab).toHaveBeenCalledWith("https://example.com/welcome");
  });

  it("does not open the welcome URL on update", () => {
    const openTab = vi.fn();
    handleInstalled({ reason: "update" }, "https://example.com/welcome", openTab);
    expect(openTab).not.toHaveBeenCalled();
  });

  it("does not open the welcome URL on chrome_update", () => {
    const openTab = vi.fn();
    handleInstalled({ reason: "chrome_update" }, "https://example.com/welcome", openTab);
    expect(openTab).not.toHaveBeenCalled();
  });

  it("does nothing if WELCOME_URL is empty (unset in dev)", () => {
    const openTab = vi.fn();
    handleInstalled({ reason: "install" }, "", openTab);
    expect(openTab).not.toHaveBeenCalled();
  });
});

describe("uninstallUrl", () => {
  it("appends the version as ?v= for release-cohort bucketing", () => {
    expect(uninstallUrl("https://example.com/uninstall", "1.4.2")).toBe(
      "https://example.com/uninstall?v=1.4.2"
    );
  });

  it("returns null when no URL is configured (empty in dev)", () => {
    expect(uninstallUrl("", "1.4.2")).toBeNull();
  });

  it("returns null (never throws) on a malformed URL", () => {
    expect(uninstallUrl("not a url", "1.4.2")).toBeNull();
  });

  it("omits ?v= when the version is unknown", () => {
    expect(uninstallUrl("https://example.com/uninstall", "")).toBe(
      "https://example.com/uninstall"
    );
  });

  it("preserves an existing query string and never appends a deviceId", () => {
    const out = uninstallUrl("https://example.com/uninstall?src=ext", "2.0.0");
    expect(out).toBe("https://example.com/uninstall?src=ext&v=2.0.0");
    expect(out).not.toMatch(/device|deviceId|uid/i);
  });
});

describe("handleMessage (relay stub)", () => {
  it("returns an unhandled result for any message type", () => {
    const result = handleMessage({ type: "anything" });
    expect(result).toEqual({ handled: false });
  });
});
