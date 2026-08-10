# Fidelity baseline — before the Pro tier

Captured before Plan 2 adds the four new Pro rows (enhanced window, window
size, in-window controls, subtitles) to `OptionsView.tsx`, and before it
branches `extension/src/pip/entry.ts`. Task 14's later screenshots compare
against **this written description**, and Task 19's parity gate compares its
test count against **the number recorded here**. If something described below
is missing after the rebuild, that is a regression unless it was explicitly
signed off as a drop.

This baseline is downstream of `docs/superpowers/plans/baseline/` (plan 1),
which already removed the popup and rebuilt the options page as the
extension's only page. Everything described there — the popup, `PopupView`,
the two-popup-state comparison — no longer exists in this codebase and is not
repeated here.

## Capture conditions

| | |
|---|---|
| Commit | `0f3b7f5f040b610eaddbe5d5762eafc5194a831b` on `feat/v2-pro` ("docs: capability inventory of the surfaces the Pro tier modifies") |
| Source | `extension/preview/gallery.tsx`, built with `npm run preview:build`, served by `npm run preview:serve` on `http://localhost:4173` |
| Engine | Playwright Chromium (headless), default `deviceScaleFactor`, `fullPage: true` |
| Desktop | viewport 1280×800 → full page **1288×5786** → `options-desktop.png` |
| Mobile | viewport 375×667 → full page **383×7036** → `options-mobile.png` |

### Deviation from the plan's literal Step-1 script, and why

The plan's capture script navigates to `http://localhost:4173/options.html`.
That path does not exist: `npm run preview:build` (via
`webpack/webpack.preview.cjs`) emits only `dist-preview/index.html` (the
`ui-kit preview gallery`, entry `preview/gallery.tsx`) and `gallery.js`.
Confirmed directly — `curl -o /dev/null -w '%{http_code}' .../options.html`
returns **404**; the root `/` returns **200**. There is no separate
"the options page" route to screenshot in isolation; `OptionsView` only
exists mounted as four cards inside the shared gallery, same as every other
ui-kit component. This matches `docs/superpowers/plans/baseline/README.md`,
which screenshotted the same gallery root for the same reason. Both PNGs in
this directory are therefore full captures of `http://localhost:4173/`
(the gallery), not of an isolated options page.

### Reading the PNGs: the paywall modal is open by default

Exactly as in the plan-1 baseline, `gallery.tsx` opens the `UpgradePaywall`
modal on load. Both committed screenshots show it over a dimmed scrim, and the
scrim occludes the top of the page: the `ui-kit preview gallery` heading,
`TierBadge`, most of `PlanBadge`, and the top of `PaymentNudge`. Everything
below that (starting around `LockedFeature`) is unoccluded. The sections
describing occluded content below were taken from a supplementary capture with
the modal dismissed (`.ant-modal-close` click, wait for `.ant-modal-mask`
hidden) — same technique as the plan-1 baseline — not from the committed PNGs.

### The 8px scrollWidth overflow is the open modal, not a layout bug

`documentElement.scrollWidth` in the committed captures is **1288** at a 1280
viewport (desktop) and **383** at a 375 viewport (mobile) — 8px over in both.
Measured directly: closing the modal (`.ant-modal-close`) and re-reading
`scrollWidth` gives exactly **1280** and **375** — no overflow. The 8px is
antd's `Modal` scroll-lock body-padding compensation (it pads `<body>` to
offset the scrollbar it hides while open) in this headless Chromium instance,
present only while the modal is open. `e2e/options-visual.spec.ts` already
knows this and explicitly closes the modal before asserting `scrollWidth`
(see its "Trap 3" comment) — its assertion passed at exactly 1280/375. Do not
read the 8px in these PNGs as a regression signal.

## Gallery section order

`ui-kit preview gallery` (H1) → TierBadge → PlanBadge → PaymentNudge —
past_due → LockedFeature → UpgradePaywall → RestoreForm (404 / 429 / idle /
success) → Toast — all seven states → **OptionsView — free** → **OptionsView
— pro** → **OptionsView — embedded players on** → **OptionsView — restore
404** → UpgradePaywall — real PLANS → Focus-restore control. Each section is
introduced by a left-aligned `Divider`. The four `OptionsView` cards and the
two trailing scaffolding sections (native, unstyled `<button>` triggers:
"Open real paywall", "Open control modal") are the true bottom of the page —
confirmed by cropping the last 600px of the desktop PNG.

## What each OptionsView card renders, control by control

All four cards are the same component (`extension/src/options/OptionsView.tsx`)
in different prop states. Structure, top to bottom, verified on the "free"
card and cross-checked pixel-for-pixel identical (barring the state-dependent
parts noted in the table) on the other three:

1. **Heading "Picture in Picture — Settings"** — bold, ~20px, near-black.
2. **Row "Keyboard shortcut"** — left: bold label, then two lines of help text
   with an inline `Alt+P` code chip, "browser window has focus" in bold; right:
   blue text-link button **"Change shortcut"** (no border, no fill).
3. **Divider rule**, then **Row "Support embedded players"** — label + 3-line
   help text on the left ("...access to **all sites**. Videos on the page
   itself keep working without it."); an antd `Switch` on the right, **off**
   (grey) on every card in this baseline.
4. **Divider rule**, then **Row "Show status messages"** — label + 2-line help
   text; a `Switch` on the right, **on** (blue, `#1677ff`) on every card in
   this baseline.
5. **Divider rule**, then **Row "Your plan"** (a "wide" row — its control
   stacks below the label instead of beside it): neutral tag for tier ("Free"
   or "Pro"), then a plan/status tag row ("No plan" alone, or e.g. "Lifetime" +
   green "Active"), then — **only when tier is free** — a solid `#1677ff`
   primary **"Upgrade"** button.
6. **Divider rule**, then **Row "Restore purchase"** (also "wide") — label +
   1-line help text, then on its own line: red required asterisk, **"Email :"**
   label, a placeholder-"you@example.com" text input, and a solid `#1677ff`
   primary **"Restore purchase"** button beside it on the same row. When a
   `restoreResult` is present (the "restore 404" card only, in this baseline),
   a pale-yellow alert **"No active purchase found for that email"** sits
   directly under the form row.
7. **Footer** — a top border rule, then two-line grey secondary text ("This
   extension never collects, stores, or transmits your browsing history, and
   it never sees what you watch."), then a blue text link **"Read the
   source"** on its own line immediately below. No version string, no other
   footer content.

There is **no tier badge in the card header** — plan/tier state is
communicated only inside the "Your plan" row, same as the plan-1 baseline
noted for the pre-rebuild `OptionsView`.

### The four card states, and how they differ

| Card | Embedded players switch | Status messages switch | Tier tag | Plan/status tags | Upgrade button | Restore alert |
|---|---|---|---|---|---|---|
| **free** | off | on | "Free" (neutral) | "No plan" (neutral) | shown | none |
| **pro** | off | on | "Pro" (green) | "Lifetime" (neutral) + "Active" (green) | hidden (tier is pro) | none |
| **embedded players on** | **on** | on | "Free" | "No plan" | shown | none |
| **restore 404** | off | on | "Free" | "No plan" | shown | yellow "No active purchase found for that email" |

No card in this baseline shows the `site-access-denied` info alert (the
`Support embedded players` row's third possible child) — the gallery never
sets `siteAccessDenied`, so that state is unverified by this baseline, same
caveat style as the plan-1 baseline calling out untested states.

## Layout / sizing

- The `.pip-options` container inside each `OptionsView` card is capped at
  **`max-width: 560px`**, centered (`margin: 0 auto`), `24px 16px 40px`
  padding — measured via computed style (`getComputedStyle(...).maxWidth ===
  "560px"`), not eyeballed. This is the width the four new Pro rows must fit.
- Accent color, measured off the "Upgrade" button's computed
  `background-color`: **`rgb(22, 119, 255)`** = `#1677ff`. Used as a solid
  fill with white text on both primary buttons ("Upgrade", "Restore
  purchase") and as the text-link color ("Change shortcut", "Read the
  source"). Tags/badges are **not** accent-colored — "Pro"/"Active" are green
  (`#52c41a` text / `#f6ffed` fill / `#b7eb8f` border per the plan-1 baseline's
  token audit, which this baseline did not need to re-verify since `TierBadge`
  and `PlanBadge` are unchanged); "Free"/"No plan"/plan-name tags are neutral
  grey.

## Mobile reflow at 375×667

Confirmed via the mobile PNG (cropped to an `OptionsView — pro` card) and via
the CSS at `extension/src/options/OptionsView.tsx` (`@media (max-width:
480px)`):

- Each row's control (`Switch`, badge stack, form) drops **below** its label
  and help text instead of sitting beside it — e.g. "Change shortcut" moves
  from the row's top-right to its own line below the help text.
- The "Restore purchase" email input and button stack vertically instead of
  sharing a row.
- With the modal **closed**, there is no horizontal overflow: `scrollWidth ===
  375`. (See the scrollWidth note above for why the raw PNG shows 383.)

## Free-path behavioral baseline — test counts

```
$ npm test
 Test Files  43 passed (43)
      Tests  314 passed (314)
   Start at  13:49:22
   Duration  30.97s
```

**Actual measured counts: 43 files / 314 tests — matches the plan's expected
43/314 exactly.** Full `vitest run` output is saved at `verify-test.txt`; the
file list backing that count (everything under `extension/e2e/` and
`extension/test/`, both `.ts` and `.tsx`) is saved at `test-inventory.txt`
(69 files — includes Playwright `.spec.ts`/harness files that vitest does not
collect, in addition to the 43 vitest suites). `npm-scripts.json` is a copy of
`extension/package.json`'s `scripts` block at this commit, for reference if a
later task needs to know exactly which command produced which number.

The visual regression suite (`npx playwright test --config
playwright.visual.config.ts --update-snapshots`) also ran clean: **8/8
passed**, and `git status` showed no snapshot file changes — the committed
snapshots were already pixel-identical to this run, so no snapshot PNGs are
included in this commit.

## Files in this directory

- `options-desktop.png` — full-page capture, 1280×800 viewport, modal open.
- `options-mobile.png` — full-page capture, 375×667 viewport, modal open.
- `verify-test.txt` — full `npm test` (vitest) output at this commit.
- `test-inventory.txt` — sorted file list of `extension/e2e/` +
  `extension/test/` at this commit.
- `npm-scripts.json` — `extension/package.json`'s `scripts` block at this
  commit.
