// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import React from "react";
import { ConfigProvider, App } from "antd";
import { buildTheme } from "./theme";

export function ThemeProvider({ accent, children }: { accent?: string; children: React.ReactNode }) {
  return (
    <ConfigProvider theme={buildTheme(accent)}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
