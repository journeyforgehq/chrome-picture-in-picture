import { test, expect } from "@playwright/test";

/* ============================================================================
 * READ THIS BEFORE WRITING ANOTHER VISUAL SPEC ON THIS CODEBASE.
 * ============================================================================
 *
 * DOM-presence assertions are NOT acceptable evidence here. `querySelector`
 * finding the switch tells you nothing about whether the theme's accent reached
 * it, whether a focus ring survived antd's reset, or whether an overlay is
 * sitting on top of the whole card — which is the failure this file's sibling
 * (toast-visual.spec.ts) shipped one run away from. These assert computed style
 * plus a screenshot that a human looked at.
 *
 * Three traps, all three measured on this page, all three of which produce a
 * CONFIDENTLY WRONG number rather than an error:
 *
 * 1. NEVER read a style with a one-shot `evaluate()`. antd's Switch (and Button)
 *    transition `all 0.2s`, so animatable properties are still at their
 *    STARTING values the instant a class flips. Measured here: a switch that
 *    already carried `.ant-switch-checked` read back `rgba(0, 0, 0, 0.25)` —
 *    the OFF colour — and a focus outline that settles at `2px` read back
 *    `0px`, with the colour still at `currentColor`. Only `outline-style` was
 *    correct immediately, because outline-style is not animatable. Use
 *    `toHaveCSS` / `expect.poll`, which retry until the transition lands. An
 *    `evaluate()` is fine ONLY for logging a value a retrying assertion has
 *    already pinned, which is the only way it is used below.
 *
 * 2. Playwright's `click()` leaves the virtual pointer ON the control, so every
 *    style read after a click is a HOVER-state read. Measured here: a checked
 *    switch is `rgb(64, 150, 255)` (antd's derived colorPrimaryHover) while the
 *    pointer sits on it, and the actual accent `rgb(22, 119, 255)` only after
 *    `page.mouse.move(0, 0)`. Reading the hover value and concluding "the theme
 *    is broken" is the easy wrong turn. Move the mouse, then assert.
 *
 * 3. The gallery opens the UpgradePaywall on load and its mask covers the page.
 *    Computed style is unaffected by an overlay, so `toHaveCSS` stays green
 *    while the screenshot contains nothing. Close the modal and wait for the
 *    mask to be hidden before asserting anything.
 * ==========================================================================*/

/** theme.ts colorPrimary — what an unhovered, checked switch settles on. */
const ACCENT = "rgb(22, 119, 255)";
/** antd's derived colorPrimaryHover. Playwright's click leaves the pointer ON
 *  the switch, so the post-click colour is this, not the accent. Measured, not
 *  assumed — the accent itself is asserted after the pointer moves away. */
const ACCENT_HOVER = "rgb(64, 150, 255)";
/** antd's unchecked switch background. */
const SWITCH_OFF = "rgba(0, 0, 0, 0.25)";

for (const vp of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 375, height: 667 },
]) {
  test(`options page renders and themes its controls @${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("http://localhost:4173");

    // Trap 3. The gallery opens the UpgradePaywall modal on load (deliberately
    // — that card's own screenshot needs it). Close it through its own UI
    // first. No gallery entry changes — the paywall card is untouched and
    // reopenable.
    await page.locator(".ant-modal-close").first().click();
    await expect(page.locator(".ant-modal-mask")).toBeHidden();

    /* ------------------------------------------------------------------
     * The one place in this plan where the fidelity baseline predicted an
     * IMPROVEMENT, so it is measured rather than assumed.
     *
     * docs/superpowers/plans/baseline/README.md, defect 1: at 375×667 the
     * gallery's `scrollWidth` was 394 against a 375 viewport — a 19px sideways
     * scroll — traced to the two `PopupView` wrappers, each hard-coded to
     * `width: 360px` and sitting at `left: 32` inside the padded column. It was
     * the popup surface's defect, not the gallery's, so removing the popup
     * should remove it. If this ever fails again, something else is over-wide
     * and the number below tells you by how much.
     * ----------------------------------------------------------------*/
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] documentElement.scrollWidth: ${scrollWidth} (viewport ${vp.width})`);
    expect(scrollWidth).toBeLessThanOrEqual(vp.width);

    const card = page.locator('[data-testid="optionsview-free"]');
    await expect(card).toBeVisible();

    // All five rows actually painted, in order — and none of the four Pro rows.
    await expect(card.locator(".pip-options__row h3")).toHaveText([
      "Keyboard shortcut",
      "Support embedded players",
      "Show status messages",
      "Your plan",
      "Restore purchase",
    ]);
    await expect(card.getByTestId("tier-badge")).toHaveText("Free");

    const embedded = card.getByRole("switch", { name: "Support embedded players" });
    await expect(embedded).toBeVisible();

    // ---- the shortcut control --------------------------------------------
    // It is a <button>, NOT an <a href="chrome://...">: Chrome blocks
    // renderer-initiated navigation to chrome:// URLs and extension pages are
    // not exempt, so that anchor would be an inert control that looks live.
    const shortcuts = card.getByRole("button", { name: "Change shortcut" });
    await expect(shortcuts).toBeVisible();
    await expect(card.locator('a[href^="chrome://"]')).toHaveCount(0);

    // ---- focus rings ------------------------------------------------------
    // antd zeroes the outline and leans on a box-shadow. A visible ring must
    // come back, and :focus (not :focus-visible) is what makes it measurable at
    // all — Chrome will not match :focus-visible on a programmatic focus().
    // Re-checked on the shortcut control because it changed element type from
    // <a> to antd's Button (a <button>), which the `a:focus` rule no longer
    // covers.
    await shortcuts.focus();
    await expect(shortcuts).not.toHaveCSS("outline-style", "none");
    await expect(shortcuts).toHaveCSS("outline-style", "solid");
    await expect(shortcuts).toHaveCSS("outline-width", "2px");
    await expect(shortcuts).toHaveCSS("outline-color", ACCENT);

    await embedded.focus();
    await expect(embedded).not.toHaveCSS("outline-style", "none");
    await expect(embedded).toHaveCSS("outline-style", "solid");
    await expect(embedded).toHaveCSS("outline-width", "2px");
    await expect(embedded).toHaveCSS("outline-color", ACCENT);

    // ---- checked colour ---------------------------------------------------
    // The scaffold's gallery contained no Switch at all until this task, so
    // antd's checked background was unverified here. Read the real value —
    // traps 1 and 2 both bite in these six lines.
    await embedded.click();
    await expect(embedded).toHaveAttribute("aria-checked", "true");
    await expect(embedded).toHaveCSS("background-color", ACCENT_HOVER);
    // eslint-disable-next-line no-console
    console.log(
      `[${vp.name}] checked switch background-color, pointer still on it:`,
      await embedded.evaluate((el) => getComputedStyle(el).backgroundColor)
    );

    await page.mouse.move(0, 0);
    await expect(embedded).toHaveCSS("background-color", ACCENT);
    // eslint-disable-next-line no-console
    console.log(
      `[${vp.name}] checked switch background-color, pointer away:`,
      await embedded.evaluate((el) => getComputedStyle(el).backgroundColor)
    );

    // The pre-checked gallery card is never hovered, so it is the cleanest
    // reading of the theme reaching a checked switch.
    await expect(
      page
        .locator('[data-testid="optionsview-embedded-on"]')
        .getByRole("switch", { name: "Support embedded players" })
    ).toHaveCSS("background-color", ACCENT);

    // ---- screenshot -------------------------------------------------------
    // Put the card back to its default state and let every transition settle,
    // so the baseline is the state a user first sees.
    await embedded.click();
    await expect(embedded).toHaveAttribute("aria-checked", "false");
    await embedded.blur();
    await page.mouse.move(0, 0);
    await expect(embedded).toHaveCSS("background-color", SWITCH_OFF);
    await expect(embedded).toHaveCSS("outline-width", "0px");

    await expect(card).toHaveScreenshot(`options-free-${vp.name}.png`);
  });

  /* ==========================================================================
   * THE REAL $9.99 CARD, IN A REAL BROWSER.
   *
   * Every other paywall rendering in this repo — the gallery card above, both
   * ui-kit unit files, OptionsView's own tests — passes a two-plan FIXTURE.
   * test/plans.test.ts asserts `PLANS` as data and never renders it. So the
   * price string a buyer reads, and the one-plan layout branch that only the
   * shipped array reaches, had never been on screen anywhere.
   *
   * test/plans-render.test.tsx asserts the DOM side of this in happy-dom. This
   * asserts what happy-dom cannot: that it is painted, at a real width, and
   * produces a picture someone looked at.
   * ========================================================================*/
  test(`the real $9.99 paywall renders @${vp.name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("http://localhost:4173");

    // Trap 3, again: the fixture paywall opens on load and its mask covers the
    // page. Close it first — otherwise the click below never lands and, worse,
    // a screenshot taken through the mask can be entirely empty.
    await page.locator(".ant-modal-close").first().click();
    await expect(page.locator(".ant-modal-mask")).toBeHidden();

    const trigger = page.getByTestId("open-real-paywall");
    await trigger.click();

    // Scoped by the price, because the fixture paywall's markup uses the same
    // classes and the same `plan-lifetime` testid.
    const dialog = page.getByRole("dialog").filter({ hasText: "$9.99" });
    await expect(dialog).toBeVisible();

    // ---- the money string, visible (not merely present) --------------------
    await expect(dialog.getByText("$9.99")).toBeVisible();
    await expect(dialog.getByText("once", { exact: true })).toBeVisible();
    await expect(dialog.getByText("One-time payment")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /choose lifetime/i })).toBeVisible();

    // ---- exactly one card, in the one-plan layout branch -------------------
    await expect(dialog.locator('[data-testid^="plan-"]')).toHaveCount(1);
    // `width` is retried through toHaveCSS, never read with evaluate(): the
    // modal animates in (transform/opacity) and a one-shot read races it.
    // 380 is the one-plan width; 560 would mean two plans, 780 three. At 375px
    // the modal's own `maxWidth: calc(100vw - 24px)` clamps it to 351.
    const expectedWidth = vp.width >= 1280 ? "380px" : "351px";
    await expect(dialog.locator(".ant-modal-content")).toHaveCSS("width", expectedWidth);
    // The POPULAR ribbon has no reachable path in v1 (no plan sets `highlight`).
    await expect(dialog.getByText("POPULAR")).toHaveCount(0);

    // Trap 1's cousin. antd zooms the dialog in (`ant-zoom-appear-active`), and
    // a screenshot taken mid-transform differs from the settled one by a ring of
    // antialiased pixels — measured at 29 differing pixels on the first mobile
    // run. Playwright's own animation freezing does not help: it freezes what is
    // running when the shot is taken. Wait for the class to clear instead.
    await expect(dialog).not.toHaveClass(/ant-zoom-appear-active/);

    await expect(dialog).toHaveScreenshot(`paywall-real-${vp.name}.png`);
  });

  /* ==========================================================================
   * focusTriggerAfterClose={false} — the anti-dark-pattern choice.
   *
   * UpgradePaywall (a CORE file, not editable here) hands antd's Modal
   * `focusTriggerAfterClose={false}`. antd's DEFAULT is to focus the trigger
   * again when the modal closes; the prop's own comment says why that is wrong
   * for a paywall — a focus-to-upsell gate would re-open it instantly and trap
   * the user. Nothing pinned it until now.
   *
   * It is asserted here rather than in a unit test because the restore antd
   * SKIPS runs from rc-dialog's leave-motion completion, and happy-dom fires no
   * transitionend — so under vitest the "focus did not return" assertion is true
   * whether or not the prop exists. Measured: a control modal with the default
   * left focus on the close button even after a 3s waitFor. Hence the control
   * below, in a browser that really runs the motion.
   * ========================================================================*/
  test(`closing the paywall does not bounce focus back to the trigger @${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(vp);
    await page.goto("http://localhost:4173");
    await page.locator(".ant-modal-close").first().click();
    await expect(page.locator(".ant-modal-mask")).toBeHidden();

    // ---- CONTROL: antd's default DOES restore focus in this browser --------
    // Without this, the assertion below could pass because the mechanism is
    // dead rather than because the prop is set.
    const controlTrigger = page.getByTestId("open-control-modal");
    await controlTrigger.focus();
    await expect(controlTrigger).toBeFocused();
    await controlTrigger.click();
    const control = page.getByRole("dialog").filter({ hasText: "Focus-restore control" });
    await expect(control).toBeVisible();
    await control.locator(".ant-modal-close").click();
    await expect(control).toBeHidden();
    await expect(controlTrigger).toBeFocused();

    // ---- the paywall: same sequence, opposite outcome ----------------------
    const trigger = page.getByTestId("open-real-paywall");
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await trigger.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "$9.99" });
    await expect(dialog).toBeVisible();
    await dialog.locator(".ant-modal-close").click();
    // Wait for the leave lifecycle to finish — the same callback that would
    // have restored focus. Asserting before it runs would be meaningless.
    await expect(dialog).toBeHidden();
    await expect(trigger).not.toBeFocused();

    // eslint-disable-next-line no-console
    console.log(
      `[${vp.name}] activeElement after closing the paywall:`,
      await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? "none")
    );
  });
}
