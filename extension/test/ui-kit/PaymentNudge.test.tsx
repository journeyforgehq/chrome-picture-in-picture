import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PaymentNudge } from "../../src/ui-kit/PaymentNudge";

describe("PaymentNudge", () => {
  it("renders a past-due warning with a manage-billing action when status is past_due", () => {
    render(<PaymentNudge status="past_due" manageHref="https://billing.example" />);
    expect(screen.getByRole("link", { name: /update payment/i })).toHaveAttribute("href", "https://billing.example");
  });
  it("renders nothing when status is active", () => {
    const { container } = render(<PaymentNudge status="active" manageHref="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
