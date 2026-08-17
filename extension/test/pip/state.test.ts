import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSettings, setSettings, getActivePip, setActivePip, clearActivePip, DEFAULT_SETTINGS,
} from "../../src/pip/state";

const local = new Map<string, unknown>();
const session = new Map<string, unknown>();
const area = (m: Map<string, unknown>) => ({
  get: vi.fn(async (k: string) => (m.has(k) ? { [k]: m.get(k) } : {})),
  set: vi.fn(async (o: Record<string, unknown>) => { for (const k in o) m.set(k, o[k]); }),
  remove: vi.fn(async (k: string) => { m.delete(k); }),
});

beforeEach(() => {
  local.clear(); session.clear();
  (globalThis as any).chrome = { storage: { local: area(local), session: area(session) } };
});

describe("pip state", () => {
  it("returns defaults before anything is written", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips settings through storage.local", async () => {
    await setSettings({ embeddedPlayers: true });
    expect((await getSettings()).embeddedPlayers).toBe(true);
    expect((await getSettings()).toastEnabled).toBe(DEFAULT_SETTINGS.toastEnabled);
  });

  it("keeps activePip in storage.session — it must NOT survive a browser restart", async () => {
    await setActivePip({ tabId: 7, frameId: 0, label: "v" });
    expect(session.has("activePip")).toBe(true);
    expect(local.has("activePip")).toBe(false);
  });

  it("clears activePip", async () => {
    await setActivePip({ tabId: 7, frameId: 0, label: "v" });
    await clearActivePip();
    expect(await getActivePip()).toBeNull();
  });

  it("returns null for activePip when nothing is stored", async () => {
    expect(await getActivePip()).toBeNull();
  });

  it("leaks no value between the two stores", async () => {
    await setSettings({ embeddedPlayers: true });
    expect(session.size).toBe(0);
  });

  it("returns the merged settings from setSettings, not just the patch", async () => {
    const next = await setSettings({ embeddedPlayers: true });
    expect(next).toEqual({ ...DEFAULT_SETTINGS, embeddedPlayers: true });
  });
});

describe("storage.session access level", () => {
  it("setAccessLevel appears nowhere in src/", () => {
    // The TRUSTED_CONTEXTS default is correct and blocks content scripts. The
    // error it produces is opaque enough that widening the level is the tempting
    // WRONG first move — and the level is per-STORE, not per-key, so widening it
    // would expose the whole session store to every content script on every page.
    // If this ever fails, the fix is to remove the call, not to relax the test.
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && readFileSync(p, "utf8").includes("setAccessLevel")) {
          offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
