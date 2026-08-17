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

    // All nine rows actually painted, in order — the four Pro rows included,
    // now LAST. Everything a free user can operate is contiguous at the top;
    // the locked block (dimmed on free, live on pro) is the terminal group,
    // so Upgrade — in the account rows above it — sits on the same side of
    // the boundary as the features it unlocks instead of stranded below them.
    await expect(card.locator(".pip-options__row h3")).toHaveText([
      "Keyboard shortcut",
      "Support embedded players",
      "Show status messages",
      "Your plan",
      "Restore purchase",
      "Enhanced window",
      "Window size",
      "In-window controls",
      "Subtitles",
    ]);
    await expect(card.getByTestId("tier-badge")).toHaveText("Free");

    /* ------------------------------------------------------------------
     * THE LOCK, MEASURED — not inferred from the markup being present.
     *
     * LockedFeature dims to `opacity: 0.5` and disables a <fieldset>. Both are
     * invisible to a DOM-presence assertion: `getByRole('switch')` finds the
     * enhanced-window switch identically whether the lock rendered or not, and
     * a `disabled` attribute on the fieldset says nothing about whether the
     * dimming or the overlay actually painted. So: read the opacity, and
     * require the Unlock affordance to be VISIBLE (not merely attached — an
     * overlay at zero height would still be in the DOM).
     *
     * `opacity` is not read with evaluate(): see trap 1 in the header. It is
     * not transitioned by antd here, but toHaveCSS costs nothing and the next
     * person adding a transition should not have to rediscover the trap.
     * ----------------------------------------------------------------*/
    const lock = card.locator(".ui-kit-locked-feature");
    await expect(lock).toBeVisible();
    await expect(lock.locator("fieldset")).toHaveCSS("opacity", "0.5");
    await expect(lock.locator("fieldset")).toHaveAttribute("disabled", "");
    const unlock = lock.getByRole("button", { name: /unlock/i });
    await expect(unlock).toBeVisible();
    // The overlay must actually cover the rows it is gating, or the "genuinely
    // non-interactive" claim rests on the fieldset alone.
    const overlayBox = await lock.locator(".ui-kit-locked-feature-overlay").boundingBox();
    const fieldsetBox = await lock.locator("fieldset").boundingBox();
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] locked overlay ${JSON.stringify(overlayBox)} over ${JSON.stringify(fieldsetBox)}`);
    expect(overlayBox!.height).toBeGreaterThanOrEqual(fieldsetBox!.height - 1);

    // The disabled fieldset is what makes the dimming more than cosmetic. A
    // FORCED click — actionability checks skipped, real mouse events at the
    // switch's own coordinates, which is what a user's finger does — must not
    // flip it. (It lands on the overlay, well above the centred Unlock button.)
    const enhanced = card.getByRole("switch", { name: "Enhanced window" });
    await expect(enhanced).toBeDisabled();
    await expect(enhanced).toHaveAttribute("aria-checked", "false");
    await enhanced.click({ force: true });
    await expect(enhanced).toHaveAttribute("aria-checked", "false");
    // ...and nothing opened the paywall by accident, which would scrim the shot.
    await expect(page.locator(".ant-modal-mask")).toBeHidden();
    await page.mouse.move(0, 0);

    /* ---- and the Pro card, where the same rows must be LIVE --------------
     * Asserting only the locked state would pass just as well if the rows were
     * hard-locked for everyone, which is the actual failure a paying user would
     * hit. */
    const proCard = page.locator('[data-testid="optionsview-pro"]');
    await expect(proCard.locator(".ui-kit-locked-feature")).toHaveCount(0);
    await expect(proCard.locator("fieldset")).toHaveCount(0);
    const proEnhanced = proCard.getByRole("switch", { name: "Enhanced window" });
    await expect(proEnhanced).toBeEnabled();
    const proSize = proCard.getByRole("combobox", { name: "Window size" });
    await expect(proSize).toBeVisible();
    /* toHaveText alone is exactly the DOM-presence trap this file exists to
     * refuse: `textContent` is the FULL string whether or not antd ellipsised
     * it on screen. It did — the row was drafted at `width: 132` and shipped
     * "Medium · 4…" past every unit test in the repo, because the setting's
     * current value being unreadable is invisible to the DOM. So assert the
     * text AND that it is not overflowing its box. */
    const value = proCard.locator(".ant-select-selection-item");
    await expect(value).toHaveText("Medium · 400×225");
    const fits = await value.evaluate((el) => ({ s: el.scrollWidth, c: el.clientWidth }));
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] window-size value scrollWidth=${fits.s} clientWidth=${fits.c}`);
    expect(fits.s).toBeLessThanOrEqual(fits.c);
    // The Select must not push the row past the 560px column — the reason the
    // mobile viewport is in this loop at all.
    const selectBox = await proCard.locator(".ant-select").boundingBox();
    const cardBox = await proCard.locator(".pip-options").boundingBox();
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] window-size Select ${JSON.stringify(selectBox)} inside ${JSON.stringify(cardBox)}`);
    expect(selectBox!.x + selectBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);

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

    /* ======================================================================
     * THE Pro DISCLOSURE PANEL — Unlock -> disclosure -> upgrade.
     * ======================================================================
     *
     * Deliberately AFTER the baseline screenshot above, so the default-state
     * shot stays the state a user first sees and nothing here can leak into
     * it.
     *
     * What only a browser can answer, and what this asserts:
     *
     *  - THE IMAGE ACTUALLY LOADED. `naturalWidth` is 0 for a broken <img>,
     *    and a broken <img> is invisible to every DOM assertion in the unit
     *    suite: the element is present, the alt text is present, the test is
     *    green, and the panel's entire visual argument is a missing-image
     *    icon. This is also what would catch webpack.preview.cjs losing its
     *    CopyPlugin, or the file being renamed out from under the src.
     *
     *  - IT SCALES INSTEAD OF OVERFLOWING. The comparison image is two
     *    browser windows side by side — inherently wide — and this page is a
     *    560px column that must not scroll sideways at 375px. scrollWidth is
     *    re-measured WITH the panel open, because the check at the top of
     *    this test ran with it closed and would not see this regression.
     * ====================================================================*/
    await card.getByRole("button", { name: /unlock/i }).click();
    await page.mouse.move(0, 0);

    const panel = card.getByTestId("dpip-disclosure");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS("display", "block");
    await expect(panel).toHaveCSS("border-top-color", ACCENT);
    await expect(panel).toHaveCSS("border-top-width", "1px");

    const img = panel.locator("img.pip-options__disclosure-img");
    await expect(img).toBeVisible();
    await expect(img).toHaveCSS("display", "block");

    const imgState = await img.evaluate((el: HTMLImageElement) => ({
      complete: el.complete,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      rendered: el.getBoundingClientRect().width,
    }));
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] comparison image: ${JSON.stringify(imgState)}`);
    expect(imgState.complete).toBe(true);
    expect(imgState.naturalWidth).toBeGreaterThan(0);

    // It scales DOWN into the column: rendered width never exceeds the panel's
    // content box, whatever the intrinsic width happens to be.
    const panelBox = (await panel.boundingBox())!;
    const imgBox = (await img.boundingBox())!;
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] image ${JSON.stringify(imgBox)} inside panel ${JSON.stringify(panelBox)}`);
    expect(imgBox.x).toBeGreaterThanOrEqual(panelBox.x - 1);
    expect(imgBox.x + imgBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);

    // The 375px requirement, re-measured with the wide image on screen.
    const openScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    // eslint-disable-next-line no-console
    console.log(`[${vp.name}] scrollWidth with the disclosure open: ${openScrollWidth} (viewport ${vp.width})`);
    expect(openScrollWidth).toBeLessThanOrEqual(vp.width);

    // The words carry the disclosure, not the image — so they must be VISIBLE,
    // not merely in the DOM behind a collapsed container.
    await expect(panel.getByText(/title bar/i).first()).toBeVisible();
    await expect(panel.getByText(/domain/i).first()).toBeVisible();
    await expect(panel.getByText(/standard floating window has no title bar/i)).toBeVisible();

    // Still no money question. The paywall is downstream of this panel.
    await expect(page.locator(".ant-modal-mask")).toBeHidden();

    await expect(panel).toHaveScreenshot(`dpip-disclosure-${vp.name}.png`);

    /* ---- and the CTA really does reach the paywall from here -------------
     * The unit suite proves onOpenPaywall fires. This proves the modal it
     * opens actually paints, from this button, in a browser. */
    await panel.getByTestId("dpip-disclosure-continue").click();
    await expect(page.locator(".ant-modal-mask")).toBeVisible();
    const upsell = page.getByRole("dialog", { name: /upgrade to pro/i });
    await expect(upsell).toBeVisible();
    await upsell.locator(".ant-modal-close").click();
    await expect(page.locator(".ant-modal-mask")).toBeHidden();

    // Declining costs nothing: the panel closes and the free page is as it was.
    await panel.getByTestId("dpip-disclosure-dismiss").click();
    await expect(panel).toHaveCount(0);
    await expect(card.getByRole("button", { name: /unlock/i })).toBeVisible();
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
