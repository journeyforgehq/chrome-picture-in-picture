/* ============================================================================
 * THE SHIPPED BUNDLE, NOT THE SOURCE. The only test that runs webpack's output.
 * ============================================================================
 *
 * `chrome.scripting.executeScript({ func })` does not ship this repo's source.
 * It ships `Function.prototype.toString()` of whatever function object survived
 * ts-loader → webpack → terser, and evaluates that TEXT inside the target
 * frame, in a scope where nothing this codebase declares exists.
 *
 * Everything else that guards this property looks at the WRONG artifact:
 *
 *   - test/pip/entry.test.ts rebuilds `pipEntry` from its own source text, but
 *     it imports the module through VITEST, which transpiles with esbuild. A
 *     hoist that only terser performs is invisible there.
 *   - test/separation.test.ts walks the module graph, which says nothing about
 *     what a function's .toString() text references.
 *   - The e2e suites never call the toolbar path (no automation can), so no
 *     browser layer executes these two functions from the real bundle either.
 *
 * So this file loads `dist/background.js` in a `node:vm` with a chrome stub,
 * captures every function actually handed to `executeScript({ func })`, and
 * rebuilds each one in a bare scope — the same `new Function("return (" + …)`
 * the page effectively performs.
 *
 * THE PRODUCTION SYMPTOM IT CATCHES: a helper gets hoisted out of a function
 * body (terser is entitled to do this the moment a helper stops being used
 * only inside), the page throws `ReferenceError: n is not defined`, PiP
 * silently never opens, no toast is shown because the worker never learns the
 * injection failed — and every other test in this repo stays green.
 *
 * Terser renames these functions on every build (`pipEntry` → `e` then `n`,
 * `showToast` → `n` then `i` across two observed builds), so NOTHING below may
 * match on a name. Identification and assertion are both by BEHAVIOUR.
 *
 * The count assertion is not decoration: if a refactor stopped passing `func`
 * at all, `captured` would be empty and every `for` loop below would pass
 * vacuously. Fewer than two distinct functions is a failure.
 * ==========================================================================*/
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createContext, runInContext } from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(__dirname, "../dist/background.js");

interface Injection {
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
  target?: unknown;
}

/**
 * Run the built service worker with a chrome stub and drive one toolbar click
 * through it, collecting every executeScript call.
 *
 * The click is answered with a THREW/SecurityError frame result on purpose:
 * that is the branch that makes `decideOutcome` ask for a toast, which is the
 * only way the handler reaches its SECOND executeScript call and hands us
 * showToast as well as pipEntry. A PIP_OK answer would capture one function
 * and the count assertion below would (correctly) fail.
 */
async function captureInjections(): Promise<Injection[]> {
  const captured: Injection[] = [];
  let onClicked: ((tab: { id: number }) => void) | null = null;

  const noop = (): void => undefined;
  const emitter = () => ({ addListener: noop });

  const chrome = {
    runtime: {
      onInstalled: { addListener: noop },
      onMessage: { addListener: noop },
      onStartup: emitter(),
      setUninstallURL: noop,
      getManifest: () => ({ version: "0.0.0" }),
    },
    tabs: { create: noop, onRemoved: emitter(), sendMessage: async () => undefined },
    storage: {
      local: { get: async () => ({}), set: async () => undefined },
      session: {
        get: async () => ({}),
        set: async () => undefined,
        remove: async () => undefined,
      },
      sync: { get: async () => ({}), set: async () => undefined },
    },
    permissions: {
      onAdded: emitter(),
      onRemoved: emitter(),
      getAll: async () => ({ origins: [] }),
    },
    scripting: {
      executeScript: async (opts: Injection) => {
        captured.push(opts);
        if (captured.length === 1) {
          return [
            {
              frameId: 0,
              result: {
                frame: "TOP",
                acted: true,
                winner: { label: "v", score: 1, width: 640, height: 360 },
                candidates: [],
                outcome: "THREW",
                errorName: "SecurityError",
              },
            },
          ];
        }
        return [{ frameId: 0, result: undefined }];
      },
    },
    action: {
      onClicked: {
        addListener: (fn: (tab: { id: number }) => void) => {
          onClicked = fn;
        },
      },
      setTitle: async () => undefined,
    },
  };

  const context = createContext({ chrome, console, setTimeout, clearTimeout, URL });
  runInContext(readFileSync(BUNDLE, "utf8"), context, { filename: BUNDLE });

  expect(onClicked, "dist/background.js registered no chrome.action.onClicked listener").not.toBeNull();
  (onClicked as unknown as (tab: { id: number }) => void)({ id: 1 });

  // The handler's diagnostics run in a detached async IIFE; let its microtasks
  // and the awaited storage reads drain before looking at what was captured.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  return captured;
}

/** The page's effective operation: evaluate the function's TEXT in a bare scope. */
function rebuild(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
  return new Function(`return (${fn.toString()})`)() as (...args: unknown[]) => unknown;
}

let injections: Injection[] = [];

beforeAll(async () => {
  // A stale or absent dist/ would make this whole file assert nothing useful.
  expect(
    existsSync(BUNDLE),
    "dist/background.js is missing — run `npm run build` before this test"
  ).toBe(true);
  injections = await captureInjections();
}, 20_000);

beforeEach(() => {
  document.body.innerHTML = "";
  Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true });
});

describe("the built bundle's injected functions", () => {
  it("hands at least two DISTINCT functions to executeScript({ func })", () => {
    // Without this the file is vacuously green the day someone stops passing
    // `func` — which is exactly the refactor that would break the page.
    const distinct = new Set(injections.map((i) => i.func));
    expect(injections.length).toBeGreaterThanOrEqual(2);
    expect(distinct.size).toBeGreaterThanOrEqual(2);
    for (const i of injections) expect(typeof i.func).toBe("function");
  });

  it("every one of them survives being rebuilt from its source text in a bare scope", () => {
    // ReferenceError here == ReferenceError in the user's page. The rebuild
    // itself is the assertion: a hoisted helper is unresolvable in this scope.
    for (const i of injections) {
      expect(() => rebuild(i.func)).not.toThrow();
    }
  });

  it("rebuilt, they still EXECUTE — a name that only resolves on call still fails here", () => {
    // Rebuilding proves the text parses. Only calling proves the identifiers
    // resolve, because a free variable is not looked up until the line runs.
    // Identified by behaviour, never by name: terser renames both every build.
    let ran = 0;

    for (const i of injections) {
      const fn = rebuild(i.func);
      const args = (i.args ?? []) as unknown[];
      const out = fn(...args);
      ran++;

      if (out && typeof out === "object" && "frame" in (out as object)) {
        // pipEntry: an empty document has no candidate, and it must say so
        // rather than throw.
        const r = out as { frame: string; acted: boolean; winner: unknown; reason?: string };
        expect(r.frame).toBe("TOP");
        expect(r.acted).toBe(false);
        expect(r.winner).toBeNull();
        expect(r.reason).toBe("none-found");
      } else {
        // showToast: returns the shadow host, with the stylesheet adopted into
        // the SAME call — the property that makes the toast visible at all.
        const host = out as HTMLElement;
        expect(host.shadowRoot).not.toBeNull();
        expect(host.shadowRoot!.adoptedStyleSheets.length).toBe(1);
        expect(host.shadowRoot!.textContent).toContain("picture-in-picture");
        // The severity mapping crossed the bundle boundary intact: the args
        // captured above carry severity "blocked", so the accent must be amber.
        expect(host.shadowRoot!.adoptedStyleSheets[0].cssRules[0].cssText).toContain("#d48806");
      }
    }

    expect(ran).toBeGreaterThanOrEqual(2);
  });

  it("ships no `await` in the minified text of either function", () => {
    // Rule 2 of entry.ts's header, checked against the SHIPPED text rather
    // than the source: an await anywhere spends the transient user activation
    // and PiP dies with NotAllowedError.
    for (const i of injections) {
      expect(i.func.toString()).not.toMatch(/\bawait\b/);
      expect(i.func.constructor.name).toBe("Function"); // not AsyncFunction
    }
  });
});
