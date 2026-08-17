# Options page layout — make the dimmed block terminal

**Status:** approved 2026-08-17. Supersedes the row order in `03-ux-ui.md` §3.5; see A-05 below.

## The problem

The options page currently reads **enabled → dimmed → enabled**:

```
Keyboard shortcut · Support embedded players · Show status messages    enabled
[ Enhanced window · Window size · In-window controls · Subtitles ]     dimmed
Your plan (Free / No plan / Upgrade)                                   enabled
Restore purchase                                                       enabled
footer
```

Two things are wrong with it, and only one is cosmetic.

1. **The locked block is a hole punched in the middle of the settings.** A user scrolling their own preferences hits four rows they cannot operate, then more rows they can. The dimming reads as a rendering fault rather than a deliberate state.
2. **The Upgrade button sits below the rows it unlocks.** The affordance that grants the four features is separated from them by the block itself, so the causal link is not visible in one glance.

Found by looking at the rendered page, not by any assertion — every row is individually correct and only their *sequence* is wrong, which is not a property `querySelector` or `toHaveCSS` can see.

## The goal, stated narrowly

**Visual coherence only.** Pro must not become more prominent than it is today. `06-monetization.md` commits to "deliberately no nag": no upgrade toast, no badge on the toolbar icon, one paywall entry point on demonstrated intent. A section header advertising the tier was considered and rejected for that reason — this change reorders, it does not promote.

## The design

### New row order

```
Keyboard shortcut                                                      enabled
Support embedded players                                               enabled
Show status messages                                                   enabled
Your plan (Free / No plan / Upgrade)                                   enabled
Restore purchase                                                       enabled
─────────────────────────────────────────────────────────────
[ Enhanced window · Window size · In-window controls · Subtitles ]     dimmed
footer
```

One transition instead of two. Everything operable is contiguous; the locked block is terminal, immediately before the footer. Upgrade now sits in the account group one scroll above what it unlocks, and the page reads "here is what this extension does" before "here is what you do not have yet".

Implementation: in `extension/src/options/OptionsView.tsx`, move the `Your plan` and `Restore purchase` `<Row>`s above the `<LockedFeature>` block. No other row changes position.

### The disclosure panel stays attached to the Pro rows

`DpipDisclosure` renders directly beneath the locked block and **stays there**. It explains those four rows; that is its natural home.

Consequence: with Upgrade moved up, clicking it scrolls *down* past the Pro rows to reach the panel. This is accepted rather than worked around — the user passes the four features on the way to the explanation of what they cost. T15 already wired `scrollIntoView` and a focus move into the panel's open path, so the jump is handled and announced to assistive tech.

**Rejected alternative:** render the panel adjacent to whichever control opened it. That gives one panel two mount points, doubling the surface that has to be tested and kept in sync, for no user-visible gain.

### What must not change

- **`LockedFeature` is CORE-vendored** (`extension/src/ui-kit/`). It is not edited. It keeps wrapping the four Pro rows in one disabled `<fieldset>` with a single centred Unlock overlay.
- **The 48px reserved band stays.** `.pip-options .ui-kit-locked-feature > fieldset { padding-top: 48px !important; }` plus `align-items: flex-start !important` on the overlay is what keeps Unlock off the row text. It was added because the button sat across "Remember the size for each si|te" at 1280px and covered the Select's value at 375px. Do not remove it as part of "tidying" the reorder.
- **`.pip-options > .pip-options__row:first-of-type`** still resolves to Keyboard shortcut, so the child-combinator divider rule is unaffected. (The combinator itself is load-bearing: unscoped, it makes "Enhanced window" first-of-type *inside* the fieldset and strips its divider on free but not on pro.)
- Every existing `aria-label` and `data-testid` keeps its current value.

## Testing

**Two order assertions update deliberately** — they are the guards that catch this change, so they are edited, never deleted:

| Location | Assertion |
|---|---|
| `test/options/OptionsView.test.tsx:49` | "renders exactly the nine rows, in order" |
| `e2e/options-visual.spec.ts:85` | "All nine rows actually painted, in order" |

**Four visual baselines regenerate:** `options-free-desktop`, `options-free-mobile`, `dpip-disclosure-desktop`, `dpip-disclosure-mobile`.

**Expected to be unaffected**, because they query by label or testid rather than position: the four un-parked Pro-gating tests in the hermetic billing loop, `options-pro.test.tsx`, `dpip-disclosure.test.tsx`, `setting-change-types.test.ts`.

**Verification gate:** unit 59 files / 493 tests, fixtures 77, visual 8, granted 12, hermetic 12 passed 0 skipped — none may drop. Plus eyes on both regenerated baselines: the point of this change is a visual property, so a green suite is not evidence that it worked.

## A-05 — amendment to the locked spec

`03-ux-ui.md` §3.5 mandates the order "… enhanced window (Pro) · window size (Pro) · in-window controls (Pro) · subtitles (Pro) · the upgrade block · the source-repo link", placing the upgrade block **after** the Pro rows. This design inverts that.

**Reason:** implemented as written, the order produces an enabled → dimmed → enabled sandwich and strands the upgrade affordance below the features it unlocks. The spec was written before `LockedFeature`'s single-overlay behaviour was known, and before there were four consecutive gated rows to dim.

**What is unchanged:** the paywall still has exactly one entry point on demonstrated intent, the trade is still disclosed before checkout, and Pro is no more prominent than §3.5 intended. The amendment is about sequence, not emphasis.

## Out of scope

- The `LockedFeature` component itself.
- Copy on any row.
- The disclosure panel's content, which T15 settled.
- Anything about the free/native path.
