/* ============================================================================
 * THE SYNCHRONICITY GUARD for src/pip/entry.ts. Read that file's header first.
 * ============================================================================
 *
 * WHAT THIS REPLACES, AND WHY. test/pip/entry.test.ts used to carry three
 * assertions — "no await before the requestPictureInPicture call", "is not an
 * async function", and "no await anywhere in its body". They were retired by
 * Task 19 of the Pro-tier plan, authorised by
 * docs/superpowers/plans/decisions-pro-tier.md (Part 2, "Intentionally
 * dropped"), on the explicit condition that THIS file landed first.
 *
 * The real invariant was never "the source text contains no `await` token". It
 * is NOTHING SUSPENDS ABOVE THE FIRST PiP CALL — transient user activation is
 * spent by the first suspension point, and PiP then fails with NotAllowedError.
 * "No await anywhere" was a cheap proxy for that, and the proxy is now wrong in
 * one direction: the Pro path deliberately suspends AFTER requestWindow()
 * resolves, which S-11 measured is safe because the PAGE's activation is
 * time-based (~5s) and survives a suspension. (The WORKER's is turn-based and
 * does not — which is why nothing was allowed to await over there, and still
 * isn't.)
 *
 * The five assertions below are strictly STRONGER than the three they replace:
 *   - the old rule measured only against `requestPictureInPicture()`; this one
 *     measures against whichever PiP call comes first in the source, so the
 *     enhanced window's `requestWindow(` is covered too;
 *   - the old rule said nothing about `.then` chains above the call;
 *   - the old rule said nothing about the dryRun return's POSITION, which is
 *     what actually keeps content.ts's localScore() from becoming a race;
 *   - the old rule never checked that a PiP call exists AT ALL, so deleting the
 *     call would have made it pass vacuously.
 *
 * THIS FILE READS THE SOURCE, NOT THE BEHAVIOUR, because the property is
 * syntactic — "above" is a fact about text. It reads src/pip/entry.ts from disk
 * rather than pipEntry.toString() so that the assertion is against the thing a
 * human edits.
 *
 * COMMENTS MUST BE STRIPPED FIRST, and that is not a detail. entry.ts's own
 * prose says the words `await` and `requestPictureInPicture()` many times, and
 * the FIRST such mention is in the header block, above everything. Measured
 * against the raw text, `firstCall` would land in a comment on line 21 and
 * every assertion below would pass no matter what the code did. The stripper
 * therefore has its own guard test — if it ever stops working, that test fails
 * loudly instead of the whole file going quietly vacuous.
 * ==========================================================================*/
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pipEntry } from "../../src/pip/entry";

const ENTRY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../src/pip/entry.ts");
const RAW = readFileSync(ENTRY_PATH, "utf8");

/** Remove line and block comments, leaving string literals intact.
 *
 *  entry.ts contains no regular-expression literals, which is the one case a
 *  scanner this size cannot disambiguate from division; the "leaves no comment
 *  syntax behind" test below is what would catch it if one ever appeared. */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        const done = src[i] === quote;
        i++;
        if (done) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const SRC = stripComments(RAW);

/** The first PiP call of EITHER implementation. `requestWindow(` is included
 *  because the enhanced window spends the same activation the native call does;
 *  measuring only against `requestPictureInPicture()` would leave the Pro path's
 *  own entry point unguarded. */
const PIP_CALLS = ["requestPictureInPicture()", "requestWindow("] as const;
const firstCall = Math.min(
  ...PIP_CALLS.map((s) => {
    const i = SRC.indexOf(s);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  })
);
const above = () => SRC.slice(0, firstCall);

describe("entry.ts — the comment stripper this file's other assertions rest on", () => {
  // If stripComments silently stopped working, every assertion below would
  // measure entry.ts's PROSE rather than its code and would pass forever. These
  // two tests are the tripwire on that.
  it("removes prose that only ever appears in a comment", () => {
    expect(RAW).toContain("READ THIS BEFORE YOU TOUCH IT");
    expect(SRC).not.toContain("READ THIS BEFORE YOU TOUCH IT");
  });

  it("leaves no comment syntax behind, and does real work on this file", () => {
    // The raw file says `await` repeatedly — in prose, explaining why there is
    // none in the code. That the stripped text does not is the proof the
    // stripper ran.
    expect(RAW).toMatch(/\bawait\b/);
    expect(SRC).not.toContain("/*");
    expect(SRC).not.toContain("//");
  });
});

describe("pipEntry — nothing suspends above the first PiP call", () => {
  it("still contains a PiP call to measure against", () => {
    // Assertion 1. Without it the whole file passes vacuously the day somebody
    // renames or removes the call: `firstCall` becomes MAX_SAFE_INTEGER, and
    // "no await above position 9007199254740991" is trivially true.
    expect(firstCall).toBeLessThan(SRC.length);
    expect(firstCall).toBeGreaterThan(0);
  });

  it("contains no await above the first PiP call", () => {
    // Assertion 2 — THE ONE THE RETIRED TRIO EXISTED FOR, stated precisely.
    expect(above()).not.toMatch(/\bawait\b/);
  });

  it("contains no await anywhere either, because source order is not execution order", () => {
    // Assertion 2b, AND THE REASON IT IS NOT REDUNDANT. `actNow` and `native`
    // are function EXPRESSIONS: they sit in the middle of the file and are
    // called from the bottom of it. So `const supported = ...`, the last
    // statement before the call, is BELOW `requestPictureInPicture()` in text
    // while running strictly BEFORE it. A purely positional rule has a hole
    // exactly the size of that inversion, and an `await` dropped into it would
    // spend the activation with every assertion above still green.
    //
    // Closing it costs nothing today: the Pro path suspends via `.then`, never
    // via `await`. What the retired trio got wrong was equating "no await" with
    // "nothing suspends" — not the "no await" part, which entry.ts still obeys.
    expect(SRC).not.toMatch(/\bawait\b/);
  });

  it("contains no .then chain above the first PiP call", () => {
    // Assertion 6, the one the retired trio had no equivalent for. A `.then`
    // above the call means the path to that call runs in a microtask rather
    // than in the click's own turn — a suspension wearing a different hat.
    //
    // `.catch(` is deliberately NOT forbidden here: the PIP_EXITED branch near
    // the top of pipEntry uses a fire-and-forget `.catch` on
    // exitPictureInPicture() and RETURNS before any PiP call is reached, so it
    // is above `firstCall` in text while being unreachable from it in control
    // flow. Forbidding `.then` and not `.catch` is a judgement about which
    // shape signals "the call now depends on a promise", not a claim that a
    // `.catch` can never suspend.
    expect(above()).not.toContain(".then(");
  });

  it("declares pipEntry — and every helper in the file — without `async`", () => {
    // Assertion 3. Two measurements of one property: the compiled function
    // object, and the source a human edits. An `async` helper declared INSIDE
    // the body would be a suspension source that the position-based assertions
    // above cannot see, so the source check is file-wide rather than scoped to
    // pipEntry's own declaration. entry.ts's header rule 2 states this rule
    // outright: ".then, never async/await".
    expect(pipEntry.constructor.name).toBe("Function");
    expect(Object.prototype.toString.call(pipEntry)).toBe("[object Function]");
    expect(SRC).not.toMatch(/\basync\b/);
  });

  it("returns from the dryRun branch above the first PiP call", () => {
    // Assertion 4. content.ts's localScore() lifts window.__pipCoord around a
    // dryRun call and depends on nothing being able to observe the window in
    // between. That holds only while the dryRun path returns BEFORE reaching
    // anything thenable — a positional fact, which is why it is asserted here
    // and not only by the `dryRun: true` overload in the type system.
    const dryRunAt = SRC.indexOf("if (dryRun)");
    expect(dryRunAt).toBeGreaterThan(-1);
    const returnAt = SRC.indexOf("return", dryRunAt);
    expect(returnAt).toBeGreaterThan(-1);
    expect(returnAt).toBeLessThan(firstCall);
  });

  it("references none of the outside helpers it deliberately inlines", () => {
    // Assertion 5 — rule 1 (no outside identifiers), aimed at the four names
    // most likely to be "tidied up" into an import by someone who has not read
    // the header. entry.test.ts's "references no identifier outside its own
    // body" catches the RUNTIME failure; this catches the specific temptation,
    // and names the file that pins the inlined copies instead
    // (test/pip/inline-parity.test.ts).
    for (const forbidden of ["decideMode(", "sizeForOrigin(", "normalizeSize(", "SIZE_PRESETS"]) {
      expect(SRC).not.toContain(forbidden);
    }
  });
});
