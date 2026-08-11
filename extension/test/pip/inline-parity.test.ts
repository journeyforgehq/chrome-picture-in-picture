/* ============================================================================
 * TWO IMPLEMENTATIONS OF ONE TRUTH, PINNED TOGETHER.
 * ============================================================================
 *
 * src/pip/entry.ts is shipped to the page as SOURCE TEXT by
 * chrome.scripting.executeScript, so its body may not reference anything
 * declared outside itself (rule 1 in that file's header). Two pieces of logic
 * therefore exist twice:
 *
 *   the routing decision — src/pip/router.ts  `decideMode`   vs. inlined `routeTo`
 *   the size resolution  — src/pip/geometry.ts `SIZE_PRESETS`/`normalizeSize`
 *                                              vs. inlined `presets`/`clamp`
 *
 * router.ts and geometry.ts are the TESTED sources of truth; the copies inside
 * entry.ts are what actually runs on a user's click. Nothing but this file
 * stops them drifting, and drift here is silent — a Pro user gets a
 * differently-sized window, or the wrong implementation entirely, and no test
 * anywhere goes red. entry.ts's own comments promise this file exists ("a later
 * task adds a test that pins the two implementations to the same truth table");
 * Task 19 is that task.
 *
 * HOW: pipEntry.toString() is the text executeScript ships, so the copies are
 * extracted from it — types erased, comments gone — and EXECUTED, not merely
 * pattern-matched. A regex over the source would pass on a preset that reads
 * `320` where the other says `320` but clamps differently; running both against
 * the same inputs cannot.
 * ==========================================================================*/
import { describe, it, expect } from "vitest";
import { pipEntry } from "../../src/pip/entry";
import { decideMode, type PipMode } from "../../src/pip/router";
import { SIZE_PRESETS, normalizeSize, type Size, type SizePreset } from "../../src/pip/geometry";
import type { PipPrefs } from "../../src/pip/prefs";
import type { Tier } from "../../src/contract";

const JS = pipEntry.toString();

/** The brace-balanced block that follows `marker`, inclusive of its braces. */
function blockAfter(marker: string): string {
  const at = JS.indexOf(marker);
  if (at === -1) throw new Error(`entry.ts no longer contains \`${marker}\``);
  const open = JS.indexOf("{", at);
  if (open === -1) throw new Error(`no block follows \`${marker}\``);
  let depth = 0;
  for (let i = open; i < JS.length; i++) {
    if (JS[i] === "{") depth++;
    else if (JS[i] === "}" && --depth === 0) return JS.slice(open, i + 1);
  }
  throw new Error(`unbalanced braces after \`${marker}\``);
}

/** Lift a `const NAME = function (…) {…}` out of the injected body and make it
 *  callable here, in the same bare scope the page would evaluate it in. */
function fnAfter(marker: string): (...args: never[]) => unknown {
  const at = JS.indexOf(marker);
  if (at === -1) throw new Error(`entry.ts no longer contains \`${marker}\``);
  const paramsOpen = JS.indexOf("(", at);
  const paramsClose = JS.indexOf(")", paramsOpen);
  const params = JS.slice(paramsOpen + 1, paramsClose);
  return new Function(`return function (${params}) ${blockAfter(marker)}`)();
}

const inlinePresets = new Function(`return ${blockAfter("const presets =")}`)() as Record<
  SizePreset,
  Size
>;
const inlineClamp = fnAfter("const clamp = function") as unknown as (
  v: number,
  lo: number,
  hi: number
) => number;
const inlineRouteTo = fnAfter("const routeTo = function") as unknown as (
  p: PipPrefs | null,
  supported: boolean
) => PipMode;

/** The bounds entry.ts hands its clamp, read off the one call site that uses
 *  them. Extracted rather than retyped: a test that restates the numbers is a
 *  third copy of the same truth, and would drift with neither of the other two. */
function boundsFor(axis: "w" | "h"): { lo: number; hi: number } {
  const m = JS.match(new RegExp(`clamp\\(\\s*raw\\.${axis}\\s*,\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)`));
  if (!m) throw new Error(`entry.ts no longer clamps raw.${axis} against two literal bounds`);
  return { lo: Number(m[1]), hi: Number(m[2]) };
}

const inlineBounds = { w: boundsFor("w"), h: boundsFor("h") };

/** geometry.ts keeps MIN/MAX private, so read them the way a caller can: an
 *  out-of-range size normalises exactly onto the bound it violated. */
const GEOMETRY_FLOOR = normalizeSize({ w: -1, h: -1 });
const GEOMETRY_CEILING = normalizeSize({ w: 1e9, h: 1e9 });

function prefs(over: Partial<PipPrefs>): PipPrefs {
  return {
    tier: "free",
    enhancedWindow: false,
    windowSize: "medium",
    rememberSizePerSite: true,
    inWindowControls: true,
    subtitles: false,
    geometry: {},
    ...over,
  };
}

describe("entry.ts's inlined presets vs. geometry.ts's SIZE_PRESETS", () => {
  it("agrees on all three presets, key for key", () => {
    expect(inlinePresets).toEqual(SIZE_PRESETS);
  });

  it("still has the three the options dropdown offers", () => {
    // toEqual above would also pass if BOTH sides lost a preset. This pins the
    // set itself, and the values the plan specified.
    expect(Object.keys(inlinePresets).sort()).toEqual(["large", "medium", "small"]);
    expect(inlinePresets.small).toEqual({ w: 320, h: 180 });
    expect(inlinePresets.medium).toEqual({ w: 400, h: 225 });
    expect(inlinePresets.large).toEqual({ w: 640, h: 360 });
  });
});

describe("entry.ts's inlined clamp vs. geometry.ts's normalizeSize", () => {
  it("uses the same floor and ceiling on both axes", () => {
    expect(inlineBounds.w.lo).toBe(GEOMETRY_FLOOR.w);
    expect(inlineBounds.h.lo).toBe(GEOMETRY_FLOOR.h);
    expect(inlineBounds.w.hi).toBe(GEOMETRY_CEILING.w);
    expect(inlineBounds.h.hi).toBe(GEOMETRY_CEILING.h);
    // Stated once, so a reader does not have to run the test to learn them.
    expect(inlineBounds).toEqual({ w: { lo: 240, hi: 1920 }, h: { lo: 135, hi: 1080 } });
  });

  it("produces the same size as normalizeSize for every stored-record shape", () => {
    // A stored size is untrusted input — it survives browser upgrades, screen
    // changes and hand-editing — so the interesting cases are the malformed
    // ones, not the well-behaved ones.
    const cases: Size[] = [
      { w: 0, h: 0 },
      { w: -5, h: -5 },
      { w: NaN, h: NaN },
      { w: Infinity, h: Infinity },
      { w: -Infinity, h: -Infinity },
      { w: 239.9, h: 134.9 },
      { w: 240, h: 135 },
      { w: 320.4, h: 180.6 },
      { w: 1920, h: 1080 },
      { w: 1921, h: 1081 },
      { w: 5000, h: 5000 },
      { w: 640, h: 360 },
    ];
    for (const size of cases) {
      const inline = {
        w: inlineClamp(size.w, inlineBounds.w.lo, inlineBounds.w.hi),
        h: inlineClamp(size.h, inlineBounds.h.lo, inlineBounds.h.hi),
      };
      expect(inline).toEqual(normalizeSize(size));
    }
  });
});

describe("entry.ts's inlined routeTo vs. router.ts's decideMode", () => {
  it("agrees on the WHOLE truth table — all 8 combinations", () => {
    const seen: string[] = [];
    for (const tier of ["free", "pro"] as Tier[]) {
      for (const enhancedWindow of [false, true]) {
        for (const documentPipSupported of [false, true]) {
          const inline = inlineRouteTo(prefs({ tier, enhancedWindow }), documentPipSupported);
          expect(inline, `tier=${tier} enhanced=${enhancedWindow} dpip=${documentPipSupported}`).toBe(
            decideMode({ tier, enhancedWindow, documentPipSupported })
          );
          seen.push(`${tier}/${enhancedWindow}/${documentPipSupported}=${inline}`);
        }
      }
    }
    // Proof the loop ran the table it claims to, not a subset.
    expect(seen).toHaveLength(8);
    expect(seen.filter((s) => s.endsWith("=document"))).toEqual(["pro/true/true=document"]);
  });

  it("routes a null prefs bundle to native — the case decideMode cannot express", () => {
    // decideMode takes a RouteInput, which is never null; entry.ts's copy takes
    // the whole prefs bundle and must survive the cold path handing it nothing.
    // Recorded here so the extra branch is deliberate rather than unaudited
    // divergence.
    expect(inlineRouteTo(null, true)).toBe("native");
  });
});
