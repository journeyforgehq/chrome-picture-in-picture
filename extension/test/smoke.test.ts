import { describe, it, expect } from "vitest";

describe("toolchain smoke test", () => {
  it("runs TypeScript-aware vitest and resolves a trivial import", () => {
    const add = (a: number, b: number): number => a + b;
    expect(add(2, 3)).toBe(5);
  });
});
