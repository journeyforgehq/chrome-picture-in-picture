// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { ConfigProvider, App } from "antd";
import { buildTheme } from "./theme";

export interface ThemeProviderProps {
  accent?: string;
  children: React.ReactNode;
}

/**
 * Wraps extension-owned pages in the shared antd theme. Also wraps antd's
 * <App> so components can use the App-scoped message/modal/notification
 * hooks (useApp()) without each page wiring its own context holder.
 */
export function ThemeProvider({ accent, children }: ThemeProviderProps) {
  return (
    <ConfigProvider theme={buildTheme(accent)}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
