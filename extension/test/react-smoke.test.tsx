import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

function Hello({ name }: { name: string }) {
  return <div data-testid="hello">Hello, {name}!</div>;
}

describe("React + testing-library toolchain smoke test", () => {
  it("renders a trivial component under happy-dom and finds it via RTL", () => {
    render(<Hello name="ui-kit" />);
    expect(screen.getByTestId("hello")).toBeInTheDocument();
    expect(screen.getByTestId("hello")).toHaveTextContent("Hello, ui-kit!");
  });
});
