import { test, expect } from "./fixtures";

test("popup renders Free tier with the pro tool locked", async ({ ext }) => {
  const page = await ext.context.newPage();
  await page.goto(`chrome-extension://${ext.extensionId}/popup.html`);

  // Layer 1: the Free badge is visible once the popup finishes its async init.
  await expect(page.getByText("Free", { exact: true })).toBeVisible();

  // Layer 2: the pro feature is genuinely dimmed AND non-interactive.
  const fieldset = page.locator(".ui-kit-locked-feature fieldset");
  await expect(fieldset).toHaveCSS("opacity", "0.5");
  expect(await fieldset.evaluate((el: HTMLFieldSetElement) => el.disabled)).toBe(true);

  await page.close();
});
