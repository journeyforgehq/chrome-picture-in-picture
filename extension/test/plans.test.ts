import { describe, it, expect } from "vitest";
import { PLANS } from "../src/billing/plans";

describe("PLANS (single source)", () => {
  it("has at least one plan, each with a label and a price", () => {
    expect(PLANS.length).toBeGreaterThan(0);
    for (const p of PLANS) {
      expect(p.label).toBeTruthy();
      expect(p.price).toBeTruthy();
    }
  });

  /* ==========================================================================
   * REPLACES the template's non-domination ladder rule.
   *
   * That rule guarded three clauses — lifetime > annual, annual < monthly × 12,
   * and "a highlighted annual must not be dominated" — and every one of them was
   * written as `if (annual && lifetime)` / `if (annual && monthly)` /
   * `highlighted?.id === "annual"`. On a single-plan array all three are
   * vacuously true, so the rule would have passed on an EMPTY ladder and
   * protected nothing here.
   *
   * This child ships lifetime-only at $9.99 (inventory row 61, signed off
   * 2026-08-07). What is worth pinning is that shape itself: a second plan
   * appearing, or the price drifting, is a pricing decision and must not slip in
   * silently. If a ladder is ever restored, restore the non-domination rule with
   * it — do not just relax this test.
   * ========================================================================*/
  it("is lifetime-only at $9.99", () => {
    expect(PLANS).toHaveLength(1);
    expect(PLANS[0].id).toBe("lifetime");
    expect(PLANS[0].price).toBe("$9.99");
    expect(PLANS[0].unit).toBe("once");
  });

  it("highlights nothing — the POPULAR ribbon is meaningless at one plan", () => {
    expect(PLANS.find((p) => p.highlight)).toBeUndefined();
  });
});
