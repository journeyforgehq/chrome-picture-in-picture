import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../src/ui-kit/ThemeProvider";
import { RestoreForm } from "../../src/ui-kit/RestoreForm";
import type { RestoreResult } from "../../src/billing/entitlement";

describe("RestoreForm", () => {
  it("calls onRestore with the entered email on submit", async () => {
    const onRestore = vi.fn();
    render(
      <ThemeProvider>
        <RestoreForm onRestore={onRestore} result={undefined} />
      </ThemeProvider>
    );
    await userEvent.type(screen.getByRole("textbox", { name: /email/i }), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledWith("a@b.com");
  });

  it("renders no status message in the idle state (result=undefined)", () => {
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={undefined} />
      </ThemeProvider>
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a success message when result.ok is true", () => {
    const result: RestoreResult = { ok: true, tier: "pro" };
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={result} />
      </ThemeProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/restored/i);
  });

  it("renders the 404 message when result.error.status is 404", () => {
    const result: RestoreResult = {
      ok: false,
      tier: "free",
      error: { status: 404, name: "unavailable", message: "not found" },
    };
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={result} />
      </ThemeProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No active purchase found for that email"
    );
  });

  it("shows the not-found warning for a 200 {ok:false} miss (status 200, not 404)", () => {
    const result: RestoreResult = {
      ok: false,
      tier: "free",
      error: { status: 200, name: "upgrade_required", message: "" },
    };
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={result} />
      </ThemeProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/no active purchase found/i);
  });

  it("renders the 429 message when result.error.status is 429", () => {
    const result: RestoreResult = {
      ok: false,
      tier: "free",
      error: { status: 429, name: "rate_limited", message: "Too many requests. Please slow down and try again." },
    };
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={result} />
      </ThemeProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts, try again later");
  });

  it("falls back to error.message for any other error status", () => {
    const result: RestoreResult = {
      ok: false,
      tier: "free",
      error: { status: 500, name: "unavailable", message: "The service is temporarily unavailable. Please try again." },
    };
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={result} />
      </ThemeProvider>
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The service is temporarily unavailable. Please try again."
    );
  });

  it("disables the submit button while loading", () => {
    render(
      <ThemeProvider>
        <RestoreForm onRestore={() => {}} result={undefined} loading />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: /restore/i })).toBeDisabled();
  });
});
