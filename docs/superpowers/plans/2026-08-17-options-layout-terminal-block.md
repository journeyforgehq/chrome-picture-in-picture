# Options page layout — terminal dimmed block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `Your plan` and `Restore purchase` above the locked Pro block so every operable row is contiguous and the dimmed block is terminal.

**Architecture:** A pure reordering of `<Row>` elements inside `OptionsView.tsx`. **No UI is removed** and no component is replaced — the four Pro rows keep their labels, controls, `aria-label`s and `data-testid`s, and simply render after the account rows instead of before them. **No encapsulation boundary is introduced**: the CORE-vendored `LockedFeature` keeps wrapping the Pro rows in one disabled `<fieldset>` with one centred Unlock overlay, and the child stylesheet that reserves a 48px band for that overlay is untouched. The disclosure panel stays mounted beneath the Pro rows.

**Tech Stack:** React 18 · antd · Vitest + happy-dom + Testing Library · Playwright (visual + fixtures + granted + hermetic)

**Spec:** [`docs/superpowers/specs/2026-08-17-options-page-layout-design.md`](../specs/2026-08-17-options-page-layout-design.md)

---

## Why there is no inventory task

The Replacement & Removal rules require a capability inventory before altering existing code. **It already exists and is current**: `docs/superpowers/plans/inventory-pro-tier.md` enumerates every row of `OptionsView.tsx` with its `aria-label` and `data-testid`, and `decisions-pro-tier.md` records a keep/drop decision for all nine. This plan drops **nothing** — every inventoried row is Preserved, unchanged, in a different position. There is no deletion task because nothing is deleted.

The fidelity baseline also exists: `docs/superpowers/plans/baseline-pro/options-desktop.png` and `options-mobile.png`, plus the four committed Playwright snapshots. Task 2 compares against them rather than recapturing a "before" that is already on disk.

---

## File structure

| File | Change |
|---|---|
| `extension/src/options/OptionsView.tsx` | Move two `<Row>` blocks. No other edit |
| `extension/test/options/OptionsView.test.tsx` | Update the order assertion at `:49` |
| `extension/e2e/options-visual.spec.ts` | Update the order assertion at `:85` |
| `extension/e2e/options-visual.spec.ts-snapshots/*.png` | Regenerate 4 baselines |
| `picture-in-picture-design/00-summary.md` | Add amendment A-05 |

---

### Task 1: Move the rows, guards first

The two order assertions are the guards that catch this change. **Update them first and watch them fail** — that proves they are load-bearing before the source moves. Do not delete them.

**Files:**
- Modify: `extension/test/options/OptionsView.test.tsx:49-63`
- Modify: `extension/e2e/options-visual.spec.ts:85-97`
- Modify: `extension/src/options/OptionsView.tsx`

- [ ] **Step 1: Update the unit order assertion to the NEW order**

In `test/options/OptionsView.test.tsx`, replace the array inside `it("renders exactly the nine rows, in order", …)`:

```ts
    expect(rows).toEqual([
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
```

Add above the `expect`:

```ts
    /* THE DIMMED BLOCK IS LAST, DELIBERATELY. Rendered in 03-ux-ui.md §3.5's
     * order this page read enabled -> dimmed -> enabled, with Upgrade stranded
     * below the four rows it unlocks. Amendment A-05. If this array ever goes
     * back to interleaving them, that regression is what it is catching. */
```

- [ ] **Step 2: Run it and watch it FAIL**

Run: `cd extension && npx vitest run test/options/OptionsView.test.tsx`
Expected: FAIL on `renders exactly the nine rows, in order`, showing the received array still interleaved (`… "Show status messages", "Enhanced window", …`).

**If it passes, stop** — the assertion is not reading real row order and must be fixed before continuing.

- [ ] **Step 3: Update the e2e order assertion identically**

In `e2e/options-visual.spec.ts`, replace the array in the `toHaveText([...])` call and update its comment to say the four Pro rows come **last**.

- [ ] **Step 4: Move the two rows in `OptionsView.tsx`**

Cut the `<Row label="Your plan" …>` block and the `<Row label="Restore purchase" …>` block, and paste them **immediately above** the `<LockedFeature …>` opening tag. Leave the three free-settings rows, the `<LockedFeature>` wrapper, its four child rows, `<DpipDisclosure>` and the `<footer>` exactly as they are.

Add above `<LockedFeature>`:

```tsx
      {/* THE LOCKED BLOCK IS LAST. Everything a user can operate comes first,
        * so the page has ONE enabled->dimmed transition instead of a dimmed
        * hole punched through the middle of the settings, and Upgrade (in the
        * account rows above) sits on the same side of the boundary as the
        * features it unlocks. Inverts 03-ux-ui.md §3.5; amendment A-05. */}
```

- [ ] **Step 5: Run both suites**

Run: `cd extension && npx vitest run test/options/`
Expected: PASS, all files.

Run: `cd extension && npm run build && npx playwright test --config playwright.visual.config.ts`
Expected: the order assertion passes; the four snapshot comparisons **FAIL** because the page moved. That is correct — Task 2 regenerates them. Do not regenerate here.

- [ ] **Step 6: Commit**

```bash
cd extension
git add src/options/OptionsView.tsx test/options/OptionsView.test.tsx e2e/options-visual.spec.ts
git commit -m "refactor(options): put the locked Pro block last, guards updated first"
```

---

### Task 2: Regenerate the baselines and LOOK at them

**Files:**
- Modify: `extension/e2e/options-visual.spec.ts-snapshots/options-free-desktop-darwin.png`
- Modify: `extension/e2e/options-visual.spec.ts-snapshots/options-free-mobile-darwin.png`
- Modify: `extension/e2e/options-visual.spec.ts-snapshots/dpip-disclosure-desktop-darwin.png`
- Modify: `extension/e2e/options-visual.spec.ts-snapshots/dpip-disclosure-mobile-darwin.png`

- [ ] **Step 1: Regenerate**

```bash
cd extension && npm run build && npx playwright test --config playwright.visual.config.ts --update-snapshots
```
Expected: 8 passed.

- [ ] **Step 2: Read all four PNGs and confirm, in writing, what you saw**

Use the Read tool on each file — it renders images. Per `superpowers:verifying-visual-output`, a passing snapshot proves only that the page matches a picture you just took of it; it proves nothing about whether the picture is right.

Confirm on **desktop (1280×800)**:
1. Row order is Keyboard shortcut → Support embedded players → Show status messages → Your plan → Restore purchase → the four dimmed Pro rows.
2. There is exactly **one** enabled→dimmed transition, and nothing enabled below the dimmed block except the footer.
3. The Unlock button sits in its blank reserved band **above** "Enhanced window", not across any row's text.
4. The footer (privacy note + "Read the source") is still last.

Confirm on **mobile (375×667)**:
5. All of the above.
6. No horizontal scrollbar; the size dropdown still reads `Medium · 400×225` in full.
7. "Remember the size for each site" still sits **below** the dropdown, not above it.

- [ ] **Step 3: Verify the disclosure panel still reachable from the moved Upgrade button**

The Upgrade button is now above the Pro rows while the panel mounts below them, so opening it scrolls the page. Confirm the existing spec still covers this:

Run: `cd extension && npx playwright test --config playwright.visual.config.ts --grep disclosure`
Expected: PASS.

If it fails on visibility rather than pixels, the `scrollIntoView` added in T15 is not reaching the new position — fix that, do not relax the assertion.

- [ ] **Step 4: Commit**

```bash
cd extension
git add e2e/options-visual.spec.ts-snapshots/
git commit -m "test(options): regenerate baselines for the terminal locked block"
```

---

### Task 3: Record amendment A-05

**Files:**
- Modify: `picture-in-picture-design/00-summary.md`

- [ ] **Step 1: Append A-05 to the Amendments section**

Add after A-04, keeping the existing entries untouched — amendments in this document are additive, and the record of what was previously believed is the point:

```markdown
### A-05 · 2026-08-17 — the upgrade block moves ABOVE the Pro rows

**§3.5's row order does not survive contact with `LockedFeature`.** The spec lists
"… enhanced window (Pro) · window size (Pro) · in-window controls (Pro) · subtitles (Pro) ·
the upgrade block · the source-repo link", putting the upgrade block after the gated rows.
Built that way, the page reads **enabled → dimmed → enabled**: four rows the user cannot
operate sit in the middle of their settings, and the Upgrade button that unlocks them
renders below them.

**Amended:** `Your plan` and `Restore purchase` move above the locked block, which becomes
terminal — last before the footer. One transition instead of two, and Upgrade sits on the
same side of the boundary as the features it grants.

**What is unchanged:** the paywall still has exactly one entry point, on demonstrated
intent; the title-bar trade is still disclosed before checkout; and Pro is no more
prominent than §3.5 intended. A section header naming the tier was considered and
**rejected** — §Output 4 commits to "deliberately no nag", so this reorders without
promoting. The amendment is about sequence, not emphasis.

**Why the spec could not have got this right:** it was written before `LockedFeature`'s
single-overlay behaviour was known and before there were four consecutive gated rows to
dim. Found by looking at the rendered page — every row is individually correct and only
their sequence is wrong, which no DOM or computed-style assertion can see.
```

- [ ] **Step 2: Commit**

```bash
cd ../picture-in-picture-design
git add 00-summary.md
git commit -m "A-05: the upgrade block moves above the Pro rows"
```

---

### Task 4: Manual visual checkpoint

The last task, no exceptions. Automated layers compare the page to a picture taken moments earlier; they cannot tell you the page now reads better than it did.

**Files:**
- Create: `picture-in-picture/docs/superpowers/plans/final-pro/layout-after-desktop.png`
- Create: `picture-in-picture/docs/superpowers/plans/final-pro/layout-after-mobile.png`

- [ ] **Step 1: Build and load the real extension**

```bash
cd extension && npm run build
```
Then `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`.

- [ ] **Step 2: Open the options page and scroll it top to bottom**

Confirm the reading experience, not just the order: you meet three working settings, your plan and restore, and only then the block you have not paid for. Nothing you can operate appears after something you cannot.

- [ ] **Step 3: Click Upgrade and follow what happens**

The disclosure panel is below the Pro rows. Confirm the page scrolls to it, that focus lands inside it, and that you pass the four feature rows on the way — that is the intended reading, and the reason the panel was not moved to the button.

- [ ] **Step 4: Capture both viewports and look at them**

Resize the window to ≥1280px wide, screenshot to `layout-after-desktop.png`. Narrow to 375px, screenshot to `layout-after-mobile.png`. **Open both files and read them.**

- [ ] **Step 5: Compare against the before**

Open `docs/superpowers/plans/baseline-pro/options-desktop.png` and `options-mobile.png` beside the new captures. Confirm the only difference is row order — same rows, same labels, same controls, same footer, same dimming.

- [ ] **Step 6: Record what you saw**

Append to `docs/superpowers/plans/final-pro/NOTES.md`: one line per check above, describing what you observed rather than what you expected.

- [ ] **Step 7: Full green gate**

```bash
cd extension
npm test                                                      # 59 files / 493 tests
npx playwright test --config playwright.fixtures.config.ts    # 77
npx playwright test --config playwright.visual.config.ts      # 8
npx playwright test --config playwright.granted.config.ts     # 12
npm run e2e                                                   # 12 passed, 0 skipped
```

None may drop. If `npm run e2e` reports fewer, check for a foreign listener on port 8788 before assuming your change caused it — a sibling project on this machine has held it three times.

- [ ] **Step 8: Commit**

```bash
cd /Users/oleksiiostapiuk/projects/chrome/picture-in-picture
git add docs/superpowers/plans/final-pro/
git commit -m "docs: visual checkpoint for the terminal locked block"
```
