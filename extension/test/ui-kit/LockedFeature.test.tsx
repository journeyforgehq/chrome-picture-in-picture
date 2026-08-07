import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../../src/ui-kit/ThemeProvider";
import { LockedFeature } from "../../src/ui-kit/LockedFeature";

describe("LockedFeature", () => {
  it("renders children even when locked", () => {
    render(
      <ThemeProvider>
        <LockedFeature locked onUnlock={() => {}}>
          <button>Do the pro thing</button>
        </LockedFeature>
      </ThemeProvider>
    );
    expect(screen.getByText("Do the pro thing")).toBeInTheDocument();
  });

  it("shows an unlock affordance with a lock icon when locked", () => {
    render(
      <ThemeProvider>
        <LockedFeature locked onUnlock={() => {}}>
          <button>Do the pro thing</button>
        </LockedFeature>
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: /unlock/i })).toBeInTheDocument();
  });

  it("calls onUnlock when the unlock affordance is clicked", async () => {
    const onUnlock = vi.fn();
    render(
      <ThemeProvider>
        <LockedFeature locked onUnlock={onUnlock}>
          <button>Do the pro thing</button>
        </LockedFeature>
      </ThemeProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: /unlock/i }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("disables the wrapped interactive child when locked", () => {
    render(
      <ThemeProvider>
        <LockedFeature locked onUnlock={() => {}}>
          <button>Do the pro thing</button>
        </LockedFeature>
      </ThemeProvider>
    );
    expect(screen.getByText("Do the pro thing").closest("fieldset")).toHaveAttribute("disabled");
  });

  it("renders children normally, with no unlock affordance, when unlocked", () => {
    render(
      <ThemeProvider>
        <LockedFeature locked={false} onUnlock={() => {}}>
          <button>Do the pro thing</button>
        </LockedFeature>
      </ThemeProvider>
    );
    expect(screen.getByText("Do the pro thing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unlock/i })).not.toBeInTheDocument();
    expect(screen.getByText("Do the pro thing").closest("fieldset")).toBeNull();
  });
});
