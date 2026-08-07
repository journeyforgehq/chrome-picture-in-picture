import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "../../src/ui-kit/ThemeProvider";
import { PlanBadge } from "../../src/ui-kit/PlanBadge";

describe("PlanBadge", () => {
  it("shows 'Annual' + 'Active' for plan=annual, status=active", () => {
    render(
      <ThemeProvider>
        <PlanBadge plan="annual" status="active" />
      </ThemeProvider>
    );
    expect(screen.getByText("Annual")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'Lifetime' for plan=lifetime", () => {
    render(
      <ThemeProvider>
        <PlanBadge plan="lifetime" status="active" />
      </ThemeProvider>
    );
    expect(screen.getByText("Lifetime")).toBeInTheDocument();
  });

  it("shows 'Canceled' status styling distinctly from 'Active'", () => {
    render(
      <ThemeProvider>
        <PlanBadge plan="annual" status="canceled" />
      </ThemeProvider>
    );
    const statusTag = screen.getByText("Canceled").closest(".ant-tag");
    expect(statusTag?.className).toMatch(/ant-tag-(warning|error|default)/);
  });

  it("renders 'No plan' gracefully when plan is undefined", () => {
    render(
      <ThemeProvider>
        <PlanBadge plan={undefined} status={undefined} />
      </ThemeProvider>
    );
    expect(screen.getByText("No plan")).toBeInTheDocument();
  });
});
