import { describe, it, expect } from "vitest";
import type { PaywallPlan } from "../src/ui-kit";
import { PLANS } from "../src/billing/plans";

// Numeric price from a display string like "$3.99" or "$29".
const num = (p: PaywallPlan) => parseFloat(String(p.price).replace(/[^0-9.]/g, ""));

describe("PLANS (single source)", () => {
  it("has at least one plan, each with a label and a price", () => {
    // Intentionally NOT asserting a fixed set of ids — a child may ship a single
    // lifetime plan, a two-tier ladder, or the full three. The invariants below
    // are what actually matter, and they hold for any subset.
    expect(PLANS.length).toBeGreaterThan(0);
    for (const p of PLANS) {
      expect(p.label).toBeTruthy();
      expect(p.price).toBeTruthy();
    }
  });

  it("has a coherent, non-dominated price ladder", () => {
    const byId = Object.fromEntries(PLANS.map((p) => [p.id, p])) as Record<string, PaywallPlan | undefined>;
    const { monthly, annual, lifetime } = byId;

    // A one-time lifetime plan must cost MORE than a year of the annual plan.
    // If lifetime <= annual/yr, nobody rational renews annually — the annual
    // plan is strictly dominated. This is exactly the trap a child falls into
    // by lowering `lifetime` below `annual` without re-pricing annual
    // (e.g. Annual $29/yr next to Lifetime $29 once).
    if (annual && lifetime) {
      expect(num(lifetime)).toBeGreaterThan(num(annual));
    }
    // A year of annual must cost LESS than twelve months of monthly, or the
    // annual plan offers no reason to exist.
    if (annual && monthly) {
      expect(num(annual)).toBeLessThan(num(monthly) * 12);
    }
    // The highlighted ("POPULAR") plan must never be a dominated option — the
    // UI is actively steering users to it.
    const highlighted = PLANS.find((p) => p.highlight);
    if (highlighted?.id === "annual" && annual && lifetime) {
      expect(num(lifetime)).toBeGreaterThan(num(annual));
    }
  });
});
