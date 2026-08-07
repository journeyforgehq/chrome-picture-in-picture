# Fidelity baseline — preview gallery

Captured before the popup is deleted and the options page is rebuilt. The later
parity check compares the replacement against **this written description**, not
against pixels. If something described here is missing after the rebuild, that
is a regression unless it was explicitly signed off as a drop.

## Capture conditions

| | |
|---|---|
| Source | `extension/preview/gallery.tsx`, built with `npm run preview:build`, served by `npm run preview:serve` on `http://localhost:4173` |
| Engine | Playwright Chromium (headless), `deviceScaleFactor: 1`, `fullPage: true` |
| Desktop | viewport 1280×800 → full page **1280×2931** → `baseline-gallery-desktop.png` |
| Mobile | viewport 375×667 → full page **394×3301** → `baseline-gallery-mobile.png` |

**Read this before comparing against the PNGs.** `gallery.tsx:88` sets the
`UpgradePaywall` modal `open` by default ("OPEN by default so the modal is
visible on load"). Both committed screenshots therefore show the paywall modal
over a dimmed scrim, and the scrim occludes the top viewport-height of the page
(TierBadge, PlanBadge, PaymentNudge and part of LockedFeature on desktop;
everything above `UpgradePaywall` on mobile). Those occluded sections were
described from a supplementary capture taken with the modal dismissed via
`Escape`; they are not visible in the committed PNGs. A later screenshot taken
the same way will reproduce the same occlusion, so the two are still directly
comparable.

## Gallery section order

`ui-kit preview gallery` (H1) → TierBadge → PlanBadge → PaymentNudge — past_due
→ LockedFeature → UpgradePaywall → RestoreForm (404 / 429 / idle / success) →
PopupView — free → PopupView — pro → OptionsView — free → OptionsView — restore
404. Each section is introduced by a left-aligned `Divider` whose label sits
after a short leading rule.

## What the popup renders, control by control

Both `PopupView` instances render as a **fixed 360 px-wide** white card with a
1 px light-grey border. Top to bottom:

1. **Header row** — bold, roughly 20 px, near-black title **"Reference
   Extension"** on the left; a tier badge pinned to the right edge of the card.
2. **Divider labelled "Uppercase (free)"**.
3. **Text input**, full card width, placeholder **"Type something…"**.
4. **Button "Uppercase"** — *default* style, not primary: white fill, `#d9d9d9`
   border, near-black label. It is sized to its text and left-aligned, not
   full-width.
5. **Divider labelled "Reverse text (pro)"**.
6. **Text input**, full card width, placeholder **"Pro: type something…"**.
7. **Button "Run pro tool"** — same default style, left-aligned.

There is no footer, no settings link, no version string, and no navigation of
any kind. The popup has exactly two text inputs and two action buttons.

### The two popup states, and how they differ visually

| | **PopupView — free** | **PopupView — pro** |
|---|---|---|
| Header badge | **"Free"** — neutral tag, `#fafafa` fill, `#d9d9d9` border, near-black text | **"Pro"** — success tag, `#f6ffed` fill, `#b7eb8f` border, green `#52c41a` text |
| "Reverse text (pro)" block | Wrapped in `LockedFeature`: input and button are rendered faded/washed out and disabled (button fill `rgba(0,0,0,0.04)`, label `rgba(0,0,0,0.25)`); placeholder text is barely legible | Fully opaque and interactive; placeholder and button label at normal contrast |
| Overlay | A solid **`#1677ff` "Unlock" pill** (white padlock glyph + white "Unlock" label) floats centred over the locked block, straddling the gap between the input and the "Run pro tool" button and partially covering the bottom of the input and the top of the button | None |
| Everything above the second divider | Identical | Identical |

The free state carries **no other upgrade affordance** — no price, no "Upgrade"
button, no plan copy. The single "Unlock" overlay is the entire monetisation
surface in the popup. Card heights are within a few pixels of each other.

## What the OptionsView cards render

An outer bordered container with generous vertical padding, holding a bordered
card. Top to bottom:

1. **Heading "Reference Extension — Settings"** — bold, larger than the popup
   title, near-black.
2. **Divider "Your plan"**.
3. **Neutral tag "No plan"** (`#fafafa` fill, `#d9d9d9` border).
4. **Primary button "Upgrade"** — solid `#1677ff`, white label, no visible
   border, sized to its text.
5. **Divider "Restore purchase"**.
6. **Inline form row** — red required asterisk, label **"Email :"**, text input
   with placeholder **"you@example.com"**, and a **primary `#1677ff` "Restore
   purchase"** button to the right of the input on the same line.

**"OptionsView — restore 404"** is identical plus a yellow warning alert
**"No active purchase found for that email"** (`#fffbe6` fill, `#ffe58f`
border, no icon) sitting directly under the form row, left-aligned with the
label.

Two things worth flagging for the rebuild:

- The options card shows **no tier badge** in its header, unlike the popup —
  plan state is communicated only by the "No plan" tag under "Your plan".
- The whole `OptionsView` is constrained to roughly a **465 px-wide column** on
  a 1280 px page, leaving a large empty white area to its right. The gallery's
  own section dividers and the `RestoreForm` alerts above it span the full
  ~1090 px content width, so the narrowness is `OptionsView`'s own max-width,
  not the gallery's.

## Everything else in the gallery (context for the ui-kit)

- **TierBadge** — "Free" (neutral) and "Pro" (green).
- **PlanBadge** — three rows: "Annual" + "Active", "Lifetime" + "Active", and
  "No plan" alone. Plan name is a neutral tag; "Active" is a green success tag.
- **PaymentNudge — past_due** — full-width pale-yellow alert (`#fffbe6` fill,
  `#ffe58f` border) with an orange circular "!" icon, bold title **"Payment
  issue"**, and the description *"Your last payment didn't go through. Update
  payment method to keep Pro."* where **"Update payment method"** is an inline
  `#1677ff` link.
- **LockedFeature** — a faded, disabled native "Do the pro thing" button on the
  left with the blue "Unlock" pill overlaid; below it, the same button unlocked.
  On desktop the Unlock pill is centred across the **full container width**, so
  it floats far to the right of the small button it is supposed to be locking —
  it reads as detached. Inside the popup card the same component looks correct,
  because there the container is only 360 px wide.
- **UpgradePaywall** — trigger is an unstyled native button "Open paywall". The
  modal is titled **"Upgrade to Pro"** with an "×" close control top-right and
  two plan cards: **"Annual" / "$29/yr" / "Choose Annual"** with ticks
  *Everything in Monthly*, *2 months free vs. monthly*, *Priority support*; and
  **"Lifetime" / "$79 once" / "Choose Lifetime"** with ticks *Everything in
  Annual*, *One-time payment, no renewals*, *All future updates included*. Both
  CTAs are full-width solid `#1677ff`; the tick glyphs are `#1677ff` and the
  feature text is grey.
- **RestoreForm** — four instances labelled `404`, `429`, `idle`, `success`.
  Each is a required "Email :" field with placeholder "you@example.com" and a
  primary "Restore purchase" button. `404` → yellow *"No active purchase found
  for that email"*; `429` → yellow *"Too many attempts, try again later"*;
  `idle` → no alert; `success` → green alert (`#f6ffed` fill, `#b7eb8f` border)
  *"Purchase restored — you're Pro again."*
- The two raw-looking grey bevelled buttons ("Do the pro thing" unlocked and
  "Open paywall") are **unstyled native `<button>` elements** used as gallery
  scaffolding, not ui-kit components.

## Design tokens in play

Accent `#1677ff` = `rgb(22, 119, 255)`. Verified against computed styles, not
eyeballed.

**Where it appears** — always as a solid fill with white text and no visible
border, or as pure text/glyph colour:

- Primary buttons: "Unlock", "Restore purchase" (all four RestoreForm
  instances + the OptionsView form), "Upgrade", "Choose Annual", "Choose
  Lifetime".
- The inline text link "Update payment method" (colour *and* border-colour).
- The tick glyphs in the paywall feature lists.

**Where it does not appear** — anything expecting the accent here will be a
change, not a fix:

- **No badge or tag uses it.** Free / Annual / Lifetime / No plan are neutral
  (`#fafafa` on `#d9d9d9`); Pro / Active are **green** (`#52c41a` text,
  `#f6ffed` fill, `#b7eb8f` border). The paid tier is signalled with green, not
  the accent.
- **No alert uses it.** Warning alerts are `#fffbe6` / `#ffe58f`; success alerts
  are `#f6ffed` / `#b7eb8f`.
- **Default buttons** ("Uppercase", "Run pro tool") are white on `#d9d9d9` — the
  popup's two primary actions are *not* accented.
- Text inputs are `#d9d9d9`-bordered in their resting state (focus state is not
  exercised by this baseline). Dividers and headings are neutral.
- **There is not a single `Switch` in the gallery** (`.ant-switch` count = 0),
  so the accent's switch-on appearance is unverified by this baseline. Likewise
  there is exactly **one `<a>`** on the whole page (the payment-nudge link), so
  link styling rests on that single sample.

## Defects and degradation at 375×667

Desktop is clean: `document.documentElement.scrollWidth === 1280`, zero elements
extending past the viewport. Everything below is mobile-only.

1. **Horizontal overflow of 19 px — the page scrolls sideways.**
   `scrollWidth` is **394** against a 375 px viewport. Cause is isolated: both
   `PopupView` wrappers carry a hard-coded `width: 360px` and sit at `left: 32`
   inside the gallery's padded column, so their right edge lands at **x = 394**.
   Every descendant of the popup card (header row, dividers, inputs,
   `.ui-kit-locked-feature`, buttons) inherits the overhang and is also reported
   past the viewport edge. Nothing else on the page overflows. **This is a
   pre-existing defect of the 360 px popup surface, not of the gallery.**
2. **The modal scrim does not cover the overflow.** `.ant-modal-mask` is
   viewport-sized (375 px) while the document is 394 px wide, so the paywall
   backdrop leaves an **undimmed ~19 px white strip down the right edge** —
   clearly visible in `baseline-gallery-mobile.png` beside the grey scrim.
3. **The paywall modal is clipped at the bottom on load.** The modal box
   measures 351×663 at `top: 32`, so its bottom edge falls at **y = 695 against
   a 667 px viewport** — the bottom border of the "Lifetime" card and the
   modal's bottom padding sit below the fold. The modal wrap scrolls, so the
   content is reachable, but nothing on screen indicates there is more.
4. **Text reflow** (degrades gracefully, but changes vertical rhythm — record it
   so a later 2-line/3-line wrap is not mistaken for a new bug):
   - "Reference Extension — Settings" wraps to **2 lines** in both OptionsView
     cards.
   - The PaymentNudge description wraps to **3 lines**.
   - "No active purchase found for that email" wraps to **2 lines**.
5. **Layout changes that are correct, not defects:** the paywall's two plan
   cards stack vertically instead of sitting side by side; the RestoreForm and
   OptionsView "Restore purchase" buttons drop below the email input instead of
   sitting beside it.
6. **The popup card itself does not degrade internally.** Because its width is
   pinned at 360 px, its inner layout at 375 is pixel-identical to desktop —
   nothing inside the card wraps, clips, or reflows. The only mobile problem the
   popup causes is the document-level overflow in item 1.
