import { describe, it, expect } from "vitest";
import {
  prefsFrom,
  prefsFromStored,
  createPrefsRefresher,
  type PipPrefs,
} from "../../src/pip/prefs";
import { DEFAULT_SETTINGS } from "../../src/pip/state";

describe("prefsFrom", () => {
  it("builds a prefs record from settings + entitlement cache + geometry", () => {
    const p = prefsFrom(
      { ...DEFAULT_SETTINGS, enhancedWindow: true, windowSize: "large" },
      { tier: "pro", checkedAt: 0 },
      { "https://a.example": { w: 500, h: 281 } }
    );
    expect(p).toEqual<PipPrefs>({
      tier: "pro",
      enhancedWindow: true,
      windowSize: "large",
      rememberSizePerSite: true,
      inWindowControls: true,
      subtitles: false,
      geometry: { "https://a.example": { w: 500, h: 281 } },
    });
  });

  it("treats a missing entitlement cache as free, never as pro", () => {
    // Fail closed. A null cache means "we do not know", and guessing pro would
    // hand the paid window to everyone whose cache had not been written yet.
    expect(prefsFrom(DEFAULT_SETTINGS, null, {}).tier).toBe("free");
  });
});

describe("prefsFromStored", () => {
  it("fills in every field from an empty record, the fresh-install case", () => {
    expect(prefsFromStored({})).toEqual<PipPrefs>({
      tier: "free",
      enhancedWindow: false,
      windowSize: "medium",
      rememberSizePerSite: true,
      inWindowControls: true,
      subtitles: false,
      geometry: {},
    });
  });

  it("folds the literal null that Entitlement.clear() writes into free", () => {
    expect(prefsFromStored({ entitlement_cache: null }).tier).toBe("free");
  });
});

describe("createPrefsRefresher", () => {
  const stale = { entitlement_cache: { tier: "free", checkedAt: 0 } };
  const fresh = { entitlement_cache: { tier: "pro", checkedAt: 1 } };

  /* The regression this guards is a RACE, so the reads have to be able to
   * resolve out of order. Each call gets its own delay, and the FIRST read is
   * the SLOW one — the exact ordering that makes an unserialised refresher
   * land the older snapshot last. */
  function scriptedRead(script: { value: Record<string, unknown>; delay: number }[]) {
    let call = 0;
    return () => {
      const step = script[Math.min(call++, script.length - 1)];
      return new Promise<Record<string, unknown>>((resolve) =>
        setTimeout(() => resolve(step.value), step.delay)
      );
    };
  }

  const settle = () => new Promise((r) => setTimeout(r, 80));

  it("lands the NEWER snapshot even when the older read resolves last", async () => {
    const seen: (PipPrefs | null)[] = [];
    const refresh = createPrefsRefresher(
      scriptedRead([
        { value: stale, delay: 25 }, // requested first, slowest to resolve
        { value: fresh, delay: 0 }, // requested second, would resolve first
      ]),
      (p) => void seen.push(p)
    );

    refresh();
    await refresh();
    await settle();

    // Without the chain both reads are in flight at once, `fresh` lands at 0ms
    // and `stale` overwrites it at 25ms — the upgraded user shown as free.
    expect(seen.map((p) => p?.tier)).toEqual(["free", "pro"]);
    expect(seen.at(-1)?.tier).toBe("pro");
  });

  it("parks the cache at UNKNOWN on a rejected read, without rejecting itself", async () => {
    const seen: (PipPrefs | null)[] = [];
    const refresh = createPrefsRefresher(
      () => Promise.reject(new Error("storage is gone")),
      (p) => void seen.push(p)
    );

    // Resolving rather than rejecting is the point: the call sites are
    // `void refreshPrefs()`, so a rejection here becomes an unhandled one.
    await expect(refresh()).resolves.toBeUndefined();
    expect(seen).toEqual([null]);
  });

  it("keeps working after a failed read — one bad read must not poison the chain", async () => {
    const seen: (PipPrefs | null)[] = [];
    let failNext = true;
    const refresh = createPrefsRefresher(
      () => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("transient"));
        }
        return Promise.resolve(fresh);
      },
      (p) => void seen.push(p)
    );

    await refresh();
    await refresh();
    await settle();

    expect(seen.map((p) => p?.tier ?? "UNKNOWN")).toEqual(["UNKNOWN", "pro"]);
  });
});
