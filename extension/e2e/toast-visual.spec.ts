import { test, expect } from "@playwright/test";

// DOM-presence assertions are NOT acceptable evidence here: querySelector('.toast')
// passing tells you nothing about whether adoptedStyleSheets worked. These assert
// computed style INSIDE the shadow root, which is the only thing that proves it.
const CASES = [
  { code: "NO_VIDEO", border: "rgb(22, 119, 255)" },
  { code: "SITE_DISABLED", border: "rgb(212, 136, 6)" },
];

for (const vp of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 667 },
]) {
  test(`toast styles cross the shadow boundary @${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("http://localhost:4173");

    // The gallery opens the UpgradePaywall modal on load (deliberately — that
    // card's own screenshot needs it). Its mask covers the whole page, and at
    // 375px the dialog covers the toast cards outright, so the first run of
    // this spec produced a "passing" screenshot of a white modal panel. Close
    // it through its own UI before looking at anything else. This changes no
    // gallery entry — the paywall card is untouched and reopenable.
    await page.locator(".ant-modal-close").first().click();
    await expect(page.locator(".ant-modal-mask")).toBeHidden();

    for (const c of CASES) {
      const el = page.locator(`[data-testid="toast-${c.code}"] .toast`);
      await expect(el).toBeVisible();
      await expect(el).toHaveCSS("border-left-color", c.border);
      await expect(el).toHaveCSS("border-left-width", "3px");
      await expect(el).toHaveCSS("background-color", "rgb(27, 31, 39)");
    }
    await expect(page.locator('[data-testid="toast-NO_VIDEO"]')).toHaveScreenshot(
      `toast-no-video-${vp.name}.png`
    );
  });
}
