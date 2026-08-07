import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ui-kit/ThemeProvider";
import { TierBadge } from "../../src/ui-kit/TierBadge";

describe("TierBadge", () => {
  it("renders 'Pro' for tier=pro", () => {
    render(
      <ThemeProvider>
        <TierBadge tier="pro" />
      </ThemeProvider>
    );
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("renders 'Free' for tier=free", () => {
    render(
      <ThemeProvider>
        <TierBadge tier="free" />
      </ThemeProvider>
    );
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("uses antd's success color preset for pro (data-visible via class)", () => {
    render(
      <ThemeProvider>
        <TierBadge tier="pro" />
      </ThemeProvider>
    );
    const tag = screen.getByText("Pro").closest(".ant-tag");
    expect(tag).not.toBeNull();
    expect(tag?.className).toMatch(/ant-tag-success/);
  });

  it("uses the default (no color) preset for free", () => {
    render(
      <ThemeProvider>
        <TierBadge tier="free" />
      </ThemeProvider>
    );
    const tag = screen.getByText("Free").closest(".ant-tag");
    expect(tag).not.toBeNull();
    expect(tag?.className).not.toMatch(/ant-tag-success/);
  });
});
