import { describe, it, expect, beforeEach } from "vitest";
import { showToast } from "../../src/pip/toast";

beforeEach(() => { document.body.innerHTML = ""; });

describe("toast", () => {
  it("creates an open shadow root and adopts a stylesheet into it — same call", () => {
    const host = showToast({ text: "No video found on this page.", severity: "info" });
    expect(host.shadowRoot).not.toBeNull();
    // The boundary and its styling ship together, or neither ships.
    expect(host.shadowRoot!.adoptedStyleSheets.length).toBe(1);
  });

  it("renders the message text inside the boundary, not outside it", () => {
    const host = showToast({ text: "Hello.", severity: "info" });
    expect(host.textContent).toBe("");             // nothing leaks to the light DOM
    expect(host.shadowRoot!.textContent).toContain("Hello.");
  });

  it("is announced politely and never steals focus", () => {
    const host = showToast({ text: "x", severity: "info" });
    const el = host.shadowRoot!.querySelector(".toast")!;
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(host.getAttribute("tabindex")).toBeNull();
  });

  it("colours the left border by severity", () => {
    const info = showToast({ text: "x", severity: "info" });
    const blocked = showToast({ text: "x", severity: "blocked" });
    const css = (h: HTMLElement) => h.shadowRoot!.adoptedStyleSheets[0].cssRules[0].cssText;
    expect(css(info)).toContain("#1677ff");
    expect(css(blocked)).toContain("#d48806");
  });

  it("does not append itself when mount is 'detached' — the gallery owns placement", () => {
    const host = showToast({ text: "x", severity: "info", mount: "detached" });
    expect(host.isConnected).toBe(false);
  });

  it("replaces a previous toast rather than stacking", () => {
    showToast({ text: "first", severity: "info" });
    showToast({ text: "second", severity: "info" });
    expect(document.querySelectorAll("[data-pip-toast]").length).toBe(1);
  });
});
