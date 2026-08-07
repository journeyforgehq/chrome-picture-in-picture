import { describe, it, expect, beforeEach } from "vitest";
import { markPresent, MARKER_ATTR } from "../src/content/content";

describe("content script no-op marker", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute(MARKER_ATTR);
  });

  it("sets the presence marker attribute on documentElement", () => {
    markPresent(document);
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBe("true");
  });

  it("uses the picture-in-picture scaffold token in the attribute name", () => {
    expect(MARKER_ATTR).toBe("data-picture-in-picture-present");
  });

  it("is idempotent when called twice", () => {
    markPresent(document);
    markPresent(document);
    expect(document.documentElement.getAttribute(MARKER_ATTR)).toBe("true");
  });
});
