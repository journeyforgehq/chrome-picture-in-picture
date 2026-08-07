import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, "../src/background/background.ts"), "utf8");

describe("gesture invariants", () => {
  it("1 — no await precedes executeScript inside the onClicked handler", () => {
    const start = src.indexOf("chrome.action.onClicked.addListener");
    expect(start).toBeGreaterThan(-1);
    const callAt = src.indexOf("chrome.scripting.executeScript", start);
    expect(callAt).toBeGreaterThan(-1);
    const between = src.slice(start, callAt);
    expect(between).not.toMatch(/\bawait\b/);
    // An async listener body is where an await gets added later without anyone noticing.
    expect(between).not.toMatch(/addListener\(\s*async/);
  });

  it("3 — no custom command listener exists; the key routes through onClicked", () => {
    expect(src).not.toMatch(/chrome\.commands\.onCommand/);
  });
});
