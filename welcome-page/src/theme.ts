// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { ThemeConfig } from "antd";

export const DEFAULT_ACCENT = "#1677ff";

/** Build the shared antd theme from a per-app accent (kept in sync with the extension ui-kit). */
export function buildTheme(accent: string = DEFAULT_ACCENT): ThemeConfig {
  return {
    token: { colorPrimary: accent, borderRadius: 8, fontSize: 15 },
  };
}
