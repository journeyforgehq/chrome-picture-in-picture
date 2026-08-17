import { describe, it, expect } from "vitest";
import { pickWinner, recordScore, pruneFrame, dropTab } from "../../src/background/arbitrate";

/* ============================================================================
 * pickWinner — the whole arbitration decision, with chrome.* nowhere near it.
 * ==========================================================================*/

describe("pickWinner", () => {
  it("picks the highest score", () => {
    expect(pickWinner({ 0: 1200, 3: 1900, 7: 400 })).toBe(3);
  });

  it("breaks a tie toward the LOWEST frameId (frame 0 is the top frame)", () => {
    expect(pickWinner({ 5: 1500, 2: 1500, 9: 1500 })).toBe(2);
  });

  it("returns null when every frame reports null", () => {
    expect(pickWinner({ 0: null, 1: null, 2: null })).toBeNull();
  });

  it("returns null for an empty map", () => {
    expect(pickWinner({})).toBeNull();
  });

  it("ignores null frames when some frame does have a candidate", () => {
    expect(pickWinner({ 0: null, 4: 300, 6: null })).toBe(4);
  });

  it("lets a subframe beat the top frame — that is the point of the mechanism", () => {
    expect(pickWinner({ 0: 100, 2: 1800 })).toBe(2);
  });

  it("treats a zero score as a real candidate, not as absent", () => {
    expect(pickWinner({ 0: null, 1: 0 })).toBe(1);
  });

  it("ignores NaN, which no honest scorer produces but JSON round-trips can", () => {
    expect(pickWinner({ 0: NaN, 1: 50 })).toBe(1);
  });
});

describe("recordScore", () => {
  it("creates the tab bucket on first report", () => {
    expect(recordScore({}, 12, 0, 900)).toEqual({ 12: { 0: 900 } });
  });

  it("overwrites a frame's previous score rather than accumulating", () => {
    const next = recordScore({ 12: { 0: 900 } }, 12, 0, 100);
    expect(next).toEqual({ 12: { 0: 100 } });
  });

  it("keeps tabs independent", () => {
    const next = recordScore({ 12: { 0: 900 } }, 13, 0, 100);
    expect(next).toEqual({ 12: { 0: 900 }, 13: { 0: 100 } });
  });

  it("does not mutate its input", () => {
    const before = { 12: { 0: 900 } };
    recordScore(before, 12, 1, 5);
    expect(before).toEqual({ 12: { 0: 900 } });
  });
});

describe("pruneFrame", () => {
  it("removes only the dead frame", () => {
    expect(pruneFrame({ 12: { 0: 900, 4: 100 } }, 12, 4)).toEqual({ 12: { 0: 900 } });
  });

  it("drops the tab bucket entirely once its last frame is gone", () => {
    expect(pruneFrame({ 12: { 4: 100 } }, 12, 4)).toEqual({});
  });

  it("is a no-op for a frame that was never recorded", () => {
    expect(pruneFrame({ 12: { 0: 900 } }, 12, 9)).toEqual({ 12: { 0: 900 } });
  });
});

describe("dropTab", () => {
  it("forgets a closed tab so the session map cannot grow without bound", () => {
    expect(dropTab({ 12: { 0: 900 }, 13: { 0: 1 } }, 12)).toEqual({ 13: { 0: 1 } });
  });
});
