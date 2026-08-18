import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { UpgradePaywall } from "../../src/ui-kit/UpgradePaywall";

/**
 * The CTA disclosure is the text that backs a chargeback dispute — if a customer
 * cannot read it, it is not a disclosure. WCAG AA requires 4.5:1 for normal text.
 *
 * These assert a COMPUTED RATIO, not a colour string, so the guarantee survives
 * a palette change: swap the token and the test still tells you whether a human
 * can read it.
 */
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (fg: number[], bg: number[]) => {
  const a = lum(fg), b = lum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};
/** Parse `rgb()`, `rgba()` or `#rrggbb`, compositing any alpha over white. */
function toRgb(css: string): number[] {
  const WHITE = [255, 255, 255];
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b] = p, a = p[3] ?? 1;
    return [r, g, b].map((c, i) => Math.round(c * a + WHITE[i] * (1 - a)));
  }
  const h = css.trim().replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const AA = 4.5;
const WHITE = [255, 255, 255];
const disclosure = { text: "One-time payment. By continuing you agree to the", termsUrl: "https://x.test/terms", refundsUrl: "https://x.test/refunds" };
const plans = [{ id: "lifetime" as const, label: "Lifetime", price: "$29" }];

function renderPaywall() {
  return render(
    <UpgradePaywall open plans={plans} onCheckout={() => {}} onClose={() => {}} disclosure={disclosure} />
  );
}

describe("CTA disclosure contrast (WCAG AA)", () => {
  it("disclosure body text meets 4.5:1 against white", () => {
    renderPaywall();
    const el = screen.getByText(/One-time payment/).closest("span,div") as HTMLElement;
    const color = (el.style.color || getComputedStyle(el).color);
    expect(color, "disclosure must set an explicit colour, not inherit a 0.45-alpha token").toBeTruthy();
    const r = ratio(toRgb(color), WHITE);
    expect(r, `body text ${color} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });

  it("both policy links meet 4.5:1 against white", () => {
    renderPaywall();
    for (const name of [/^terms$/i, /^refund policy$/i]) {
      const a = screen.getByRole("link", { name }) as HTMLAnchorElement;
      const color = a.style.color || getComputedStyle(a).color;
      const r = ratio(toRgb(color), WHITE);
      expect(r, `link "${a.textContent}" ${color} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("links do not rely on colour alone to be identifiable (WCAG 1.4.1)", () => {
    renderPaywall();
    const a = screen.getByRole("link", { name: /^terms$/i }) as HTMLAnchorElement;
    expect(a.style.textDecoration).toMatch(/underline/);
  });
});
