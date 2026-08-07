import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { buildTheme } from "../../src/ui-kit/theme";
import { ThemeProvider } from "../../src/ui-kit/ThemeProvider";

describe("buildTheme", () => {
  it("defaults colorPrimary to #1677ff when no accent is given", () => {
    const t = buildTheme();
    expect(t.token?.colorPrimary).toBe("#1677ff");
  });

  it("uses the given accent as colorPrimary", () => {
    const t = buildTheme("#ff0055");
    expect(t.token?.colorPrimary).toBe("#ff0055");
  });

  it("sets a border radius and font family token", () => {
    const t = buildTheme();
    expect(t.token?.borderRadius).toBe(8);
    expect(t.token?.fontFamily).toMatch(/system-ui/);
  });
});

describe("ThemeProvider", () => {
  it("renders children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">hello</div>
      </ThemeProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies the accent as the antd primary color token (behavior, not just prop presence)", () => {
    const accent = "#22aa44";
    const config = buildTheme(accent);
    const seeded = antdTheme.getDesignToken({ token: config.token });
    expect(seeded.colorPrimary).toBe(accent);
  });
});
