/* The bundle of state the injected function needs in order to route a click.
 *
 * Deliberately ONE serialisable object: it travels through
 * chrome.scripting.executeScript's `args`, which is structured-cloned, and
 * building it in the worker must cost no await (INVARIANT 1). It is also the
 * shape the page-side fallback reads when the worker's cache is cold.
 */
import type { EntitlementCache } from "../billing/entitlement";
import type { GeometryMap, SizePreset } from "./geometry";
import { DEFAULT_SETTINGS, type PipSettings } from "./state";
import type { Tier } from "../contract";

export interface PipPrefs {
  tier: Tier;
  enhancedWindow: boolean;
  windowSize: SizePreset;
  rememberSizePerSite: boolean;
  inWindowControls: boolean;
  subtitles: boolean;
  geometry: GeometryMap;
}

export function prefsFrom(
  settings: PipSettings,
  entitlement: EntitlementCache | null,
  geometry: GeometryMap
): PipPrefs {
  return {
    // Fail closed: unknown is free. Guessing pro would give the paid window away
    // to every install whose cache had not been written yet.
    tier: entitlement?.tier === "pro" ? "pro" : "free",
    enhancedWindow: settings.enhancedWindow,
    windowSize: settings.windowSize,
    rememberSizePerSite: settings.rememberSizePerSite,
    inWindowControls: settings.inWindowControls,
    subtitles: settings.subtitles,
    geometry,
  };
}

/** The three storage reads the injected function makes when the worker cache is
 *  cold. ONE chrome.storage.local.get — S-11 measured it at 1ms inside the
 *  injected frame, against a ~5s activation budget. */
export const PREFS_KEYS = ["settings", "entitlement_cache", "geometry"] as const;

/** Widens one raw `chrome.storage.local.get(PREFS_KEYS)` result into PipPrefs.
 *  Every field is absent on a fresh install and each one is untrusted input, so
 *  each gets its own fallback rather than assuming the record is well formed.
 *  `entitlement_cache` is written as literal `null` by Entitlement.clear(),
 *  which `?? null` folds into the same UNKNOWN-is-free branch as "missing". */
export function prefsFromStored(stored: Record<string, unknown>): PipPrefs {
  return prefsFrom(
    { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<PipSettings> | undefined) },
    (stored.entitlement_cache as EntitlementCache | undefined) ?? null,
    (stored.geometry as GeometryMap | undefined) ?? {}
  );
}

/* ============================================================================
 * createPrefsRefresher — THE SERIALISED REFRESH. Read this before simplifying it.
 * ============================================================================
 *
 * THE SAME HAZARD AS `arbitrationChain` in src/background/background.ts, and
 * deliberately the same shape of fix, so the two stay recognisably related.
 * There it is frame scores; here it is the prefs cache; in both cases a
 * read-modify-write is triggered by an event that can fire twice in quick
 * succession, and unserialised they finish in whatever order their storage
 * reads happen to resolve.
 *
 * MEASURED CONSEQUENCE, not a theoretical one. A user upgrades to Pro:
 * `entitlement_cache` and `settings` are written within a millisecond of each
 * other, storage.onChanged fires twice, two refreshes overlap, and the OLDER
 * read resolves SECOND. `cachedPrefs` is then last-resolved-wins and says
 * "free" until the next onChanged or a worker restart (~30s idle). The user's
 * next click hands a paying customer the free window.
 *
 * That it self-heals is what makes it bad rather than harmless: it gets
 * reported as "it didn't work the first time" and never reproduces for anyone
 * looking at it. Chaining makes the second read START after the first has
 * finished, so the last refresh to be REQUESTED is always the last to land.
 *
 * THE CATCH IS LOAD-BEARING TOO. It does two jobs: `void refresh()` at the call
 * sites means a rejected storage read would otherwise surface as an unhandled
 * rejection in the worker, and it keeps the chain fulfilled so ONE failed read
 * cannot poison every refresh after it. Failing to `null` is the deliberate
 * fail-safe, not an accident of the assignment never happening: `null` means
 * UNKNOWN — never "free" — and routes the click to the page-side fallback,
 * which reads storage itself inside the injected frame where an await is safe.
 * ==========================================================================*/
export function createPrefsRefresher(
  read: () => Promise<Record<string, unknown>>,
  assign: (prefs: PipPrefs | null) => void
): () => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  return function refresh(): Promise<void> {
    chain = chain
      .then(async () => {
        assign(prefsFromStored(await read()));
      })
      .catch(() => {
        assign(null);
      });
    return chain;
  };
}
