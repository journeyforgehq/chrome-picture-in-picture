/* Per-origin size memory for the enhanced window (Pro).
 *
 * S-02 killed this on native PiP — PictureInPictureWindow's width/height are
 * getter-only. S-10 brought it back on Document PiP. S-12 then measured that
 * requestWindow's `height` is NOT the content height (inner comes back 52-56px
 * short, and the deficit moves between Chrome versions), so the size stored here
 * is the CONTENT size the user chose, and entry.ts corrects the window to it
 * after opening. Never store the deficit: it is a property of the browser build.
 */
export interface Size {
  w: number;
  h: number;
}

export type GeometryMap = Record<string, Size>;
export type SizePreset = "small" | "medium" | "large";

export const SIZE_PRESETS: Record<SizePreset, Size> = {
  small: { w: 320, h: 180 },
  medium: { w: 400, h: 225 },
  large: { w: 640, h: 360 },
};

const MIN: Size = { w: 240, h: 135 };
const MAX: Size = { w: 1920, h: 1080 };

/** A stored record is untrusted input: it survives browser upgrades, screen
 *  changes and hand-editing. A 0x0 or NaN size reaches requestWindow otherwise. */
export function normalizeSize(size: Size): Size {
  const one = (v: number, lo: number, hi: number) =>
    !isFinite(v) || v < lo ? lo : v > hi ? hi : Math.round(v);
  return { w: one(size.w, MIN.w, MAX.w), h: one(size.h, MIN.h, MAX.h) };
}

export function sizeForOrigin(map: GeometryMap, origin: string, preset: SizePreset): Size {
  const remembered = map[origin];
  return normalizeSize(remembered ?? SIZE_PRESETS[preset]);
}

const GEOMETRY_KEY = "geometry";

export async function getGeometry(): Promise<GeometryMap> {
  const stored = await chrome.storage.local.get(GEOMETRY_KEY);
  return (stored[GEOMETRY_KEY] as GeometryMap | undefined) ?? {};
}

export async function rememberSize(origin: string, size: Size): Promise<void> {
  const map = await getGeometry();
  map[origin] = normalizeSize(size);
  await chrome.storage.local.set({ [GEOMETRY_KEY]: map });
}
