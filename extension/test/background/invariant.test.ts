import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* INVARIANT 1 is the single most load-bearing rule in this codebase and it is
 * invisible at runtime: breaking it produces a NotAllowedError in the user's
 * browser and nothing anywhere else. S-11 measured that even
 * `await Promise.resolve()` breaks it, so "it looked cheap" is not a defence.
 *
 * This reads the SOURCE, because the property is syntactic: no suspension point
 * may appear between the listener's opening brace and the executeScript call. */
const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, "../../src/background/background.ts"), "utf8");

function listenerStart(): number {
  const start = SRC.indexOf("chrome.action.onClicked.addListener");
  expect(start).toBeGreaterThan(-1);
  return start;
}

function executeScriptAt(): number {
  const call = SRC.indexOf("chrome.scripting.executeScript", listenerStart());
  expect(call).toBeGreaterThan(listenerStart());
  return call;
}

/** Everything the listener runs BEFORE executeScript. Must contain no suspension. */
function clickHandlerPrelude(): string {
  return SRC.slice(listenerStart(), executeScriptAt());
}

/** The prelude PLUS the executeScript call itself. `cachedPrefs` is read in that
 *  call's `args`, i.e. just past the prelude boundary, so the "reads the cache
 *  synchronously" assertion needs this slightly wider window. Everything in it
 *  still runs inside the gesture turn, so it is the correct scope for asking
 *  whether anything here could suspend. */
function clickHandlerInjection(): string {
  const end = SRC.indexOf("});", executeScriptAt());
  expect(end).toBeGreaterThan(executeScriptAt());
  return SRC.slice(listenerStart(), end + 3);
}

describe("INVARIANT 1 — nothing suspends before executeScript", () => {
  it("has no `await` between the click listener and executeScript", () => {
    expect(clickHandlerPrelude()).not.toMatch(/\bawait\b/);
  });

  it("does not make the click listener an async function", () => {
    expect(clickHandlerPrelude()).not.toMatch(/addListener\(\s*async/);
  });

  it("has no .then() chain before executeScript either", () => {
    // A .then callback is a suspension point wearing a different hat.
    expect(clickHandlerPrelude()).not.toMatch(/\.then\s*\(/);
  });

  it("reads the prefs cache synchronously, not through a function call that could await", () => {
    expect(clickHandlerInjection()).toMatch(/args:\s*\[\{\s*prefs:\s*cachedPrefs\s*\}\]/);
    expect(clickHandlerInjection()).not.toMatch(/refreshPrefs\s*\(/);
  });
});
