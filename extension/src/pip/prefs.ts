/* The bundle of state the injected function needs in order to route a click.
 *
 * Deliberately ONE serialisable object: it travels through
 * chrome.scripting.executeScript's `args`, which is structured-cloned, and
 * building it in the worker must cost no await (INVARIANT 1). It is also the
 * shape the page-side fallback reads when the worker's cache is cold.
 */
import type { EntitlementCache } from "../billing/entitlement";
import type { GeometryMap, SizePreset } from "./geometry";
import type { PipSettings } from "./state";
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
