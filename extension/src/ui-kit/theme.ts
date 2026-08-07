// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import type { ThemeConfig } from "antd";

export const DEFAULT_ACCENT = "#1677ff";

/**
 * Shared antd theme for every extension-owned page (popup/options/editors)
 * and the welcome page. Each extension overrides `accent` (the ACCENT config
 * token from src/billing/config.ts) to stay visually distinct on one base
 * theme (spec §11A).
 */
export function buildTheme(accent: string = DEFAULT_ACCENT): ThemeConfig {
  return {
    token: {
      colorPrimary: accent,
      borderRadius: 8,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, sans-serif',
    },
  };
}
