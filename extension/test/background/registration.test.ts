import { describe, it, expect, beforeEach, vi } from "vitest";
import { SCRIPT_ID, ensureRegistered, ensureUnregistered } from "../../src/background/registration";

/* ============================================================================
 * In-memory chrome.scripting stub that reproduces the REAL rejection
 * behaviour a spike measured against actual Chrome:
 *   - registerContentScripts REJECTS on a duplicate id with
 *     `Error: Duplicate script ID 'x'`. It does not resolve as a no-op.
 *   - unregisterContentScripts REJECTS on an id that is not registered with
 *     `Error: Nonexistent script ID 'x'`.
 * A stub that resolved silently in either case would make the guard tests
 * below vacuous — they would pass whether or not registration.ts's guards
 * existed.
 * ==========================================================================*/
let registered: chrome.scripting.RegisteredContentScript[];

function makeScriptingStub() {
  registered = [];
  return {
    getRegisteredContentScripts: vi.fn(
      async (filter?: { ids?: string[] }): Promise<chrome.scripting.RegisteredContentScript[]> => {
        if (!filter?.ids) return registered.slice();
        return registered.filter((r) => filter.ids!.includes(r.id));
      }
    ),
    registerContentScripts: vi.fn(
      async (scripts: chrome.scripting.RegisteredContentScript[]): Promise<void> => {
        for (const s of scripts) {
          if (registered.some((r) => r.id === s.id)) {
            throw new Error(`Duplicate script ID '${s.id}'`);
          }
        }
        registered.push(...scripts);
      }
    ),
    unregisterContentScripts: vi.fn(async (filter?: { ids?: string[] }): Promise<void> => {
      const ids = filter?.ids ?? [];
      for (const id of ids) {
        if (!registered.some((r) => r.id === id)) {
          throw new Error(`Nonexistent script ID '${id}'`);
        }
      }
      registered = registered.filter((r) => !ids.includes(r.id));
    }),
  };
}

beforeEach(() => {
  (globalThis as any).chrome = { scripting: makeScriptingStub() };
});

describe("ensureRegistered", () => {
  it("registering once produces exactly one registration", async () => {
    await ensureRegistered();
    expect(registered).toHaveLength(1);
  });

  it("calling it twice does not throw and leaves one registration", async () => {
    await ensureRegistered();
    await expect(ensureRegistered()).resolves.not.toThrow();
    expect(registered).toHaveLength(1);
  });

  it("registers with exactly the required options", async () => {
    await ensureRegistered();
    expect(registered).toEqual([
      {
        id: SCRIPT_ID,
        matches: ["<all_urls>"],
        allFrames: true,
        runAt: "document_idle",
        js: ["content.js"],
        persistAcrossSessions: true,
      },
    ]);
  });
});

describe("ensureUnregistered", () => {
  it("removes an existing registration", async () => {
    await ensureRegistered();
    await ensureUnregistered();
    expect(registered).toHaveLength(0);
  });

  // This is the case that hits every user who never enabled embedded players.
  it("does not throw when called on nothing", async () => {
    await expect(ensureUnregistered()).resolves.not.toThrow();
    expect(registered).toHaveLength(0);
  });

  it("unregistering twice does not throw", async () => {
    await ensureRegistered();
    await ensureUnregistered();
    await expect(ensureUnregistered()).resolves.not.toThrow();
    expect(registered).toHaveLength(0);
  });
});
