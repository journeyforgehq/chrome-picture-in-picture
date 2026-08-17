# Visual checkpoint — terminal dimmed block (L-T4)

**Date:** 2026-08-17 · **Build:** `extension/dist` (free build, no `DEV_PRO`)
**Method:** real extension loaded unpacked in Chrome, driving the real
`chrome-extension://<id>/options.html` — not the preview gallery, which renders
`OptionsView` as a card inside another page and cannot show real scroll behaviour.

Headed throughout. `HEADLESS=1` starts no MV3 service worker, so the extension id
can never be resolved — measured, and documented in `e2e/README.md`.

## What was observed, not expected

### Row order and the single transition — desktop 1280×800 and mobile 375×667

Measured identically at both viewports:

```
Keyboard shortcut · Support embedded players · Show status messages
Your plan · Restore purchase
[ Enhanced window · Window size · In-window controls · Subtitles ]   opacity 0.5
footer
```

One enabled → dimmed transition. Nothing operable renders below the dimmed block
except the footer, which stays at full contrast — confirmed by eye and by
`footerTop` sitting below `lockedBlockTop` at both sizes.

### The Unlock button clears the row text

The defect this band exists to prevent: before it, the button sat across
"Remember the size for each si|te" at 1280px and covered the size dropdown's value
at 375px.

| viewport | Unlock bottom | first locked row top | clears? |
|---|---|---|---|
| 1280×800 | 775px | 804px | **yes**, 29px of daylight |
| 375×667 | 1026px | 1055px | **yes**, 29px |

### No horizontal overflow at 375px

`document.scrollWidth` 360 against a 375 viewport. A per-element sweep of every
node inside `.pip-options` found **three** boxes crossing the container edge, all
of them `span.ant-switch-inner-checked` overflowing **left by 1px** — antd's
internal switch animation element, not layout. Zero right-edge overflow.

The size dropdown reads `Medium · 400×225` in full at both viewports; it truncated
to `Medium · 4…` before it was widened to 176px, and every unit test passed anyway
because `textContent` returns the full string whether or not it is ellipsised.

### Clicking Upgrade — the behaviour that was not designed around

Upgrade now sits *above* the Pro rows while the disclosure panel mounts *below*
them, so opening it scrolls further than it used to. Measured:

```
scrollY        0 → 982
panelInViewport true   (panelTop 276)
focusInsidePanel true  (activeElement = section.pip-options__disclosure)
dialogOpen     false
```

The scroll lands the panel in view, focus moves into it, and — importantly — the
paywall dialog does **not** open first. The T15 guarantee still holds: the only
route to checkout is the panel's own "Continue to upgrade".

Passing the four feature rows on the way to the explanation of their cost is the
intended reading, and the reason the panel was not relocated to the button.

## One thing worth recording rather than glossing

**With the panel open, the page briefly re-creates an enabled → dimmed → enabled
shape** — the disclosure renders at full contrast beneath the dimmed rows.

Judged not a defect: it is a transient, deliberately-outlined callout (blue border,
tinted background) rather than a settings row, it exists only after an explicit
action, and the **default state** — which is what every user sees — has exactly one
transition. Recorded here so that if someone later reads the A-05 amendment and
finds this shape on screen, they know it was seen and decided rather than missed.

## Still needing a human

This checkpoint covers layout and the Upgrade flow. It does **not** cover the
Pro-tier checks in `MANUAL-CHECKPOINT-PRO.md`, none of which are automatable:

- **§5** a user-*dragged* window resize — Playwright's input goes to the page, not
  the window manager
- **§6** Chrome firing `pagehide` on a closing Document PiP window — assumed
  everywhere, measured nowhere, because no automation can close a real PiP window
- **§7** `requestWindow()`'s gesture requirement — automation reports this
  **wrong**: S-12's no-gesture control succeeded in every arm

## Gate at time of capture

unit 59 files / 493 tests · fixtures 77 · visual 8 · granted 12 · hermetic 12 passed 0 skipped
