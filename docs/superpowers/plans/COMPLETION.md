# Completion — Picture in Picture, v1 free

Final gate for the 23-task plan. Every number below came from a command run on
**2026-08-09** from `/Users/oleksiiostapiuk/projects/chrome/picture-in-picture`,
branch `feat/v1-free`, and is pasted from that run's output.

---

## 1. Final counts

| Suite | Command | Result |
|---|---|---|
| Types (extension) | `npm run typecheck` | exit 0, no output |
| Types (e2e) | `npm run e2e:typecheck` | exit 0, no output |
| Unit | `npm test` | **`Test Files 42 passed (42)` · `Tests 291 passed \| 1 skipped (292)`** |
| Build | `npm run build` | `webpack 5.108.1 compiled with 3 warnings in 4959 ms` — all three are asset-size advisories on `options.js` (660 KiB), no errors |
| Package | `npm run build:zip` | `Packaged -> extension/extension.zip`, 10 entries / 706,556 bytes — see §7 item 10 |
| Fixtures | `npm run e2e:fixtures` | **`45 passed (6.1s)`** |
| Visual | `npx playwright test --config playwright.visual.config.ts` | **`8 passed (16.8s)`** |
| Hermetic e2e | `npx playwright test` | `Running 12 tests using 1 worker` → **`4 skipped` · `8 passed (18.3s)`** |
| Welcome page | `cd ../welcome-page && npm run typecheck && npm test && npm run build` | exit 0 · `# pass 3 / # fail 0` · Gatsby build completed |

The **1 skipped unit test** is deliberate and standing:
`test/options/options.test.tsx > options submission gates > ships no unresolved
__ORG__ placeholder in the built options bundle`. It is `it.skip` rather than
absent so it appears in every `npm test` run as a pending pre-submission item;
the options footer still links to `github.com/__ORG__/picture-in-picture`.

The **4 skipped e2e tests** are the `PLAN 2:` fixmes parked when the popup's
`LockedFeature` gating assertions lost their subject — one each in
`billing.spec.ts`, `dunning-refund.spec.ts`, `grace.spec.ts` and
`renewal-cascade.spec.ts`. Each names plan 2 in its title so it surfaces on
every run instead of disappearing.

Delta from the state this task inherited (39 files / 270+1 · 45 · 4 · 8+4):
**+1 unit file, +5 unit tests** — 4 from `test/injected-bundle.test.ts` and 1
from the options-page title guard added in §5.

**Amended 2026-08-09** by the pass that closed §7 items 6, 8, 9 and 10. The unit
row above previously read `40 passed` / `275 passed | 1 skipped (276)`; the
pre-change tree was re-measured at **`276 passed | 1 skipped (277)`** during that
pass (the old figure was one low), and the four closures then added **+2 unit
files and +15 unit tests** (`test/plans-render.test.tsx` 6,
`test/zip-artifact.test.ts` 7, `test/manifest.test.ts` +2) and **+4 visual
specs** (the real-`PLANS` paywall and the focus-restore check, at both
viewports). Fixtures and hermetic e2e are unchanged.

---

## 2. Baseline reconciliation

Against `docs/superpowers/plans/baseline/` (`verify-before.txt`,
`npm-scripts.json`, `test-inventory.txt`), captured from the untouched scaffold
at task 1.

**Test files present at baseline and absent now — exactly three, all recorded
deletions, none a regression:**

| File | Where it is accounted for |
|---|---|
| `e2e/popup-loads.spec.ts` | `parity-picture-in-picture.md` §3 (predicted) and §7 (performed). The popup's own spec; it died with the popup. Its Free-badge half is re-proven on `options.html` by `billing.spec.ts`; its locked-fieldset half is parked as `billing.spec.ts:99 PLAN 2:`. |
| `test/popup/PopupView.test.tsx` (6) | Same §3/§7. Covered `UppercaseTool` / `ProTool` / the popup's `LockedFeature` mount — the three surfaces §4 of that document records as **dropped, not moved**, signed off 2026-08-07. |
| `test/popup/popup.test.tsx` (4) | Same §3/§7. Every behaviour ported to `test/options/options.test.tsx` **before** the deletion: device-id/entitlement bootstrap, tier pass-through, the cached-Pro seed, and the checkout hand-off (`client_reference_id`, both the `chrome.tabs.create` and `window.open` branches). |

**No other file lost a test.** Comparing baseline per-file counts in
`verify-before.txt` against `npx vitest run --reporter=verbose` today, every
surviving baseline file has the same count or more:
`chrome-storage` 7→7, `entitlement` 13→13, `harness/webhook` 10→10, `config`
6→6, `RestoreForm` 8→8, `UpgradePaywall` 7→7, `background` 10→10, `device-id`
5→5, `checkout` 4→4, `billing-integration` 1→1, `icons` 3→3, `harness/config`
5→5, `LockedFeature` 5→5, `scripts` 1→1, `TierBadge` 4→4, `PlanBadge` 4→4,
`theme` 5→5, `contract-sync` 1→1, `react-smoke` 1→1, `smoke` 1→1,
`PaymentNudge` 2→2, `ui-kit/index` 2→2, `webpack-preview-config` 1→1,
`separation` 2→2, `src/billing/entitlement` 3→3; grown: `manifest` 6→13,
`options` 4→15, `OptionsView` 7→28, `content` 3→18, `plans` 2→3,
`webpack-config` 5→6.

**Added since baseline** (14 files): `e2e/detection.spec.ts`,
`e2e/gesture.spec.ts`, `e2e/options-visual.spec.ts`, `e2e/toast-visual.spec.ts`,
`e2e/serve.ts`, `test/background/{action,arbitrate,registration}.test.ts`,
`test/pip/{entry,errors,state,toast}.test.ts`, `test/invariants.test.ts`,
`test/injected-bundle.test.ts`.

**npm scripts:** zero removed, zero changed, two added (`e2e:visual`,
`e2e:fixtures`). No baseline-green script has lost its runner.

---

## 3. What each layer proves — and what it does not

| Layer | Proves | Does **not** prove |
|---|---|---|
| **Unit (vitest, happy-dom, 42 files)** | Scoring, arbitration, error mapping, storage, entitlement, the manifest allowlist, and both PiP failure shapes. `pipEntry` and `showToast` are rebuilt from their own source text in a bare scope. | Most of it says nothing about the *shipped* artifact: vitest transpiles with **esbuild**, so a webpack/terser-only hoist is invisible except in the two files below. No pixels. No real browser. |
| **`test/zip-artifact.test.ts`** (new) | The **published archive**. Builds a production dist into a private directory, runs the real `scripts/zip-dist.mjs` over it, walks the zip's central directory, and holds every entry against an **allowlist**: `manifest.json` at the archive root, the four loadable files plus the icon triple present and non-empty, and no `popup.*`, no `.map`, no `.env`, no dotfile, nothing unlisted. | That the extension *works* once unzipped — it reads names and sizes, not contents. And nothing about the store listing around it. |
| **`test/injected-bundle.test.ts`** (new) | The functions webpack + terser actually ship survive `new Function("return (" + fn.toString() + ")")()` **and execute** in a bare scope, still adopt their stylesheet, still map severity, still contain no `await`. It is the only check covering the whole ts-loader → webpack → terser path. | That anything ever *calls* them in a browser. It runs the bundle in `node:vm` with a chrome stub, not in Chrome. |
| **Fixtures (45, `playwright.fixtures.config.ts`)** | Detection across ~40 real DOM shapes via `pipEntry({ dryRun: true })`, in a real Chromium, over two real origins. Plus `gesture.spec.ts`: a real `requestPictureInPicture()` under a real `page.click()`, its exit, and a no-gesture control that really gets `NotAllowedError`. | **The gesture that ships.** `gesture.spec.ts` clicks a button *inside the page*. The product's gesture starts on the *toolbar*, in browser chrome, and travels worker→frame. See §4. |
| **Visual (8)** | Computed style + screenshot on the preview gallery: the accent reaches a checked switch (`rgb(22, 119, 255)` with the pointer moved away), focus rings survive antd's reset, the toast's colours cross the shadow boundary, and `scrollWidth <= 375` at mobile. Plus, since 2026-08-09, the **real `$9.99` paywall** painted at both viewports and the `focusTriggerAfterClose={false}` behaviour against a live control. | That the *extension page* looks the same — the gallery mounts `ThemeProvider`/antd from a dev harness and supplies its own HTML shell. §5 is what closes that. |
| **Hermetic e2e (8 + 4 parked)** | The whole money path against a local wrangler worker with forged, signed Stripe webhooks: grant, cancel, past_due, refund, 7-day offline grace, two-device renewal cascade, restore-by-email, identity bootstrap — all on the real `options.html` in a real loaded extension. | Real Stripe. Real checkout. Any Pro-gated *interactivity* (v1 has none — that is what the four `PLAN 2:` fixmes hold). |
| **Manual sheet (`MANUAL-CHECKLIST.md`)** | Everything in browser chrome: the toolbar click, `Alt+P`, the floating window's chromelessness, the permission bubble, tooltips, `chrome://extensions`, restart survival, uninstall. | Nothing automatically. It is a human procedure and it only holds if a human runs it. |

---

## 4. The boundary, stated plainly

**The worker→frame gesture hop is covered by no automated layer in this repo.**

The product is: user clicks the toolbar button → `chrome.action.onClicked` fires
in the MV3 service worker → the worker calls
`chrome.scripting.executeScript({ func: pipEntry })` → the injected function
calls `requestPictureInPicture()` in the page, **still inside the user's
activation**. Three separate facts make that hop untestable here:

1. Playwright drives page content, not browser chrome. There is no API to click
   an extension's toolbar button.
2. `chrome.action.onClicked.dispatch()` from the service worker fires the
   listener but carries **no user activation** — so the very property under test
   is absent by construction. Asserting on it would be theatre.
3. The failure it guards against is silent: an `await` above `executeScript`
   spends the activation, `requestPictureInPicture()` rejects with
   `NotAllowedError`, and (before the fix in an earlier task) nothing was said at
   all.

What stands in for it, and what each substitute is worth:

- **A spike measurement.** Two spike runs died on exactly this, the second one
  *inside the fix for the first*. That is where the invariant comes from — it
  was measured, not reasoned.
- **`test/invariants.test.ts`** — a *source-text* guard: no `await` between
  `chrome.action.onClicked.addListener` and `chrome.scripting.executeScript`,
  and no `async` listener body. It reads `background.ts` as a string. It cannot
  see an await introduced through a helper it calls.
- **`e2e/gesture.spec.ts`** — proves the *page-side* half is real: under a
  genuine gesture PiP opens, a second call exits and the video is still playing,
  and without a gesture the control really gets `NotAllowedError`. It says
  nothing about whether activation survives the worker→frame trip.
- **`MANUAL-CHECKLIST.md` rows 4–7** — the only thing that exercises the whole
  chain. Rows 4, 6 and 7 *are* the product.

Nothing in this repo should be read as claiming the toolbar path is
automatically tested. It is not, and the constraint is documented rather than
engineered around.

---

## 5. The visual checkpoint (task 22)

Images in `docs/superpowers/plans/final/`, all captured from the **built
extension loaded unpacked** in a persistent context, and all looked at.

- `real-options-{desktop,mobile}.png` — `chrome-extension://<id>/options.html`,
  the actual extension page, at 1280×800 and 375×667. **Content is identical to
  the gallery snapshot**; mounting outside the dev harness changes only the
  frame around it (the gallery clips a bordered card; the real page centres the
  same 560px-max column on a full-width white page). Measured, not eyeballed:
  `documentElement.scrollWidth` 1280/1280 and 375/375, zero elements past the
  viewport, unchecked switch `rgba(0, 0, 0, 0.25)`, checked switch
  `rgb(22, 119, 255)`, all five rows in order, `Free` badge present.
- `toast-*-{desktop,mobile}.png` + `-closeup.png` — the real, terser-minified
  `showToast` **taken out of `dist/background.js`** and injected into
  `e2e/fixtures/a01-plain.html` exactly as `background.ts` does. Both severities
  (`info` `#1677ff`, `blocked` `#d48806`) at both viewports, plus the two
  previously-unreachable codes. At every viewport: `position: fixed`,
  `z-index: 2147483647`, 16px from the right and 10px from the bottom, and
  `document.elementFromPoint` at the toast's centre returns the toast host —
  i.e. **nothing is covering it**, which is the exact failure this step exists
  to catch.

### One defect found by looking, and fixed

`src/options/options.html` shipped `<title>Reference Extension — Settings</title>`
while the `<h2>` six lines below rendered "Picture in Picture — Settings". The
tab title is the one part of the options page React never renders, and the
preview gallery supplies its own HTML shell — so **no gallery screenshot and no
spec asserting on rendered React could ever have seen it**. Fixed, and pinned by
`test/manifest.test.ts > manifest identity > names the options page after the
product, not the scaffold`, alongside the manifest-name guard, because it is the
same failure mode: a half-finished scaffold rename.

### One defect found by looking, and NOT fixed

**The toolbar icon is a flat blue square.** `scripts/gen-icons.mjs` writes a
solid `#1677ff` fill at 16/48/128 with no glyph. `test/icons.test.ts` asserts
only that the PNGs are valid — exactly the limitation the decisions log flagged
("this passes with *any* art"). Real artwork is outstanding and is item 1 of §7.

---

## 6. The four guards protecting the product's public claims

Run as `npx vitest run test/manifest.test.ts test/invariants.test.ts
test/pip/state.test.ts test/pip/entry.test.ts --reporter=verbose` →
`Test Files 4 passed (4)` · `Tests 46 passed (46)`.

**1 — the R-04 permission allowlist.** This is what makes *"Built to touch
nothing else in your browser"* literally true.

```
✓ test/manifest.test.ts > manifest permission allowlist (R-04) > declares exactly these three permissions and nothing else
✓ test/manifest.test.ts > manifest permission allowlist (R-04) > declares no static host permissions
✓ test/manifest.test.ts > manifest permission allowlist (R-04) > requests <all_urls> only as an optional host permission
✓ test/manifest.test.ts > manifest permission allowlist (R-04) > has no static content_scripts block
✓ test/manifest.test.ts > manifest permission allowlist (R-04) > exposes no web-accessible resources
```

`permissions` is `toEqual(["storage","activeTab","scripting"])` and
`host_permissions` is `toEqual([])`. An **allowlist**, not a denylist: adding
*any* permission fails until someone consciously edits that line.

**2 — both gesture invariants.**

```
✓ test/invariants.test.ts > gesture invariants > 1 — no await precedes executeScript inside the onClicked handler
✓ test/invariants.test.ts > gesture invariants > 3 — no custom command listener exists; the key routes through onClicked
```

Invariant 3 is why `Alt+P` and the click are the same code path: the manifest
binds `_execute_action`, never a custom command
(`✓ … binds the shortcut to _execute_action, never a custom command`).

**3 — the `setAccessLevel`-absent guard.**

```
✓ test/pip/state.test.ts > storage.session access level > setAccessLevel appears nowhere in src/
```

Widening `storage.session` is per-**store**, not per-key, so one tempting call
would expose the whole session store to every content script on every page.

**4 — `pipEntry`'s self-containment and synchronicity guards.**

```
✓ test/pip/entry.test.ts > pipEntry — serialization safety > references no identifier outside its own body
✓ test/pip/entry.test.ts > pipEntry — serialization safety > contains no await before the requestPictureInPicture call
✓ test/pip/entry.test.ts > pipEntry — synchronicity … > is not an async function
✓ test/pip/entry.test.ts > pipEntry — synchronicity … > contains no await anywhere in its body, not merely before the PiP call
✓ test/pip/entry.test.ts > pipEntry — synchronicity … > returns a plain object rather than a thenable
```

These run against **esbuild's** output. `test/injected-bundle.test.ts` now runs
the same property against **webpack + terser's**, which is what actually ships.
Its bite was verified by mutation, not assumed: hoisting one constant out of
`showToast`'s body and rebuilding produced

```
FAIL test/injected-bundle.test.ts > … > rebuilt, they still EXECUTE — a name that only resolves on call still fails here
ReferenceError: i is not defined
```

— the production symptom exactly (terser named it `i` that build), with all four
guards above still green. The mutation was reverted and the suite is green.

---

## 7. Still open

Nothing below blocks the branch; all of it blocks a Chrome Web Store submission.

1. ~~**The icon is placeholder art**~~ — **CLOSED 2026-08-09.** The real
   artwork from the design package (`05-graphics/icons`) now ships at 16/48/128.
   The root cause is worth keeping: `test/icons.test.ts` ran `gen-icons.mjs` in
   `beforeAll`, so every `npm test` silently overwrote the shipped icons with
   the factory placeholder — and the test asserted only "a valid PNG of the
   right size", which a flat square satisfies perfectly. The test now asserts
   structure **and** that the file is too large to be a flat square.
2. **`__ORG__` placeholder** in the options footer's "Read the source" link.
   `test/options/options.test.tsx > options submission gates` is skipped and
   waiting; un-skip it once the real repo exists.
3. **`__EXT_ID__` placeholder** in `welcome-page/src/content.ts:155`
   (`pro.restoreHref: "chrome-extension://__EXT_ID__/options.html"`). It must be
   substituted with the real extension id once the store listing exists.
   *Note:* this token was **not caught by preflight** — that guard matched only
   `REPLACE_WITH_*`, and the welcome-page rewrite introduced the
   `__DOUBLE_UNDERSCORE__` spelling. **Fixed 2026-08-09:** the pattern now
   matches both, and `__ORG__`, `__EXT_ID__` and `__DOMAIN__` are all caught.
   A guard that silently stops matching is worse than no guard — the green run
   reads as "no placeholders shipped" rather than "not looking".
4. ~~The welcome page still describes the template product~~ — **CLOSED.**
   Parity row 94 / finding 4 is stale: commit `9a43d02` rewrote the copy.
   Verified in this pass — `appName: "Picture in Picture"`, and the
   `permissions` list now carries a `scripting` entry.
5. **Preflight is red on 8 items** — re-run `node scripts/preflight.mjs`
   2026-08-09:
   `backend/wrangler.toml` × 3 unfilled KV ids
   (`REPLACE_WITH_KV_ID` / `_STAGING_` / `_PROD_`), `welcome-page/src/content.ts`
   × 3 (`__ORG__`, `__EXT_ID__`, `__DOMAIN__`), `extension/.env`
   `BACKEND_BASE_URL` empty (paywall + `/me` target localhost), and
   `extension/.env` `no STRIPE_ANNUAL_URL or STRIPE_LIFETIME_URL (checkout has
   no link)`. The lifetime rule fires as written and passes once the link is
   filled.

   **This entry said 5 until 2026-08-09, and the rise to 8 is the guard
   working, not a regression.** Nothing new broke: the three added lines are the
   `welcome-page` `__DOUBLE_UNDERSCORE__` placeholders described in item 3, which
   the old pattern (`REPLACE_WITH_*` only) could not see. They were already
   unfilled when this document reported 5; the number was wrong, not the tree.
   Widening the pattern made three pre-existing, genuinely-unshippable
   placeholders visible.
6. ~~**Nothing renders the real `$9.99` single-plan card**~~ (parity row 65 /
   finding 3) — **CLOSED 2026-08-09.** Closed at two levels, both against the
   **real imported `PLANS`** rather than a fixture:
   - **Unit** — `test/plans-render.test.tsx` (6 tests) renders `UpgradePaywall`
     *and* `OptionsView`'s own paywall with the shipped array: `$9.99` / `once` /
     `One-time payment` / the three feature bullets on screen, exactly one
     `[data-testid^="plan-"]` card, one CTA, and the **one-plan layout branch**
     pinned by what only that branch produces — `ant-col-sm-24` (not `-12`, not
     `-8`) and a modal `width: 380px`.
   - **Visual** — a new gallery entry (`open-real-paywall`) mounts the real
     `PLANS` **alongside** the two-plan fixture card, which stays: it is the only
     rendering of the multi-plan layout and of the POPULAR ribbon, both of which
     the paid-tier plan needs. `e2e/options-visual.spec.ts` asserts the price is
     *visible* and the content width at 1280×800 (`380px`) and 375×667 (`351px`,
     clamped by the component's `maxWidth: calc(100vw - 24px)`), then
     `toHaveScreenshot` — `paywall-real-{desktop,mobile}.png`, looked at.
   Two notes from looking at it. The single card does **not** read as stranded:
   the modal narrows to 380px with the branch, so the card fills it and the
   dialog reads as one focused offer rather than a gap in a grid. But `$9.99`
   and its `once` unit render with **no space between them** (`$9.99once`) —
   `UpgradePaywall` emits `{price}{unit}` adjacently, and it is a CORE file, so
   this is recorded here rather than patched. A `unit: " once"` in `plans.ts`
   would work around it; changing the spacing properly belongs upstream in the
   factory.
7. **`LockedFeature` has no production mount** (parity row 9 / finding 5) — the
   intended, signed-off shape of v1 free. The preview gallery is its only
   rendering; the four `PLAN 2:` fixmes hold its e2e assertions.
8. ~~**`focusTriggerAfterClose={false}` has no assertion**~~ — **CLOSED
   2026-08-09.** `UpgradePaywall` hands antd's Modal
   `focusTriggerAfterClose={false}`; antd's default is to focus the trigger
   again on close, and the prop's comment explains why that is hostile here (a
   focus-to-upsell gate would re-open the paywall the instant it was closed).
   Asserted as **behaviour**, from outside the CORE file:
   `e2e/options-visual.spec.ts > closing the paywall does not bounce focus back
   to the trigger`, at both viewports — focus the Upgrade trigger, open, close
   through the modal's own control, wait for the leave lifecycle, then
   `expect(trigger).not.toBeFocused()` (measured landing: `<body>`).

   **It is a browser spec because the unit version is vacuous, and that was
   measured, not guessed.** antd restores focus from rc-dialog's leave-motion
   completion callback; happy-dom fires no `transitionend`, so that callback
   never runs. A CONTROL — a plain antd Modal with the DEFAULT, same harness —
   left focus on the modal's close button even after a 3s `waitFor`. The
   "focus did not return" assertion would therefore have passed with the prop
   deleted. The same control now lives in the preview gallery
   (`open-control-modal`) and the spec asserts it **does** restore, so the
   paywall's non-restore means something. `test/plans-render.test.tsx` carries
   the finding instead of a fake test.

   **POPULAR ribbon — decision: assert its absence.** No plan sets `highlight`,
   so with one plan the ribbon is unreachable. Adding a `highlight` flag to make
   it reachable would be inventing pricing behaviour to satisfy a test, so what
   is pinned is that it does **not** appear: `test/plans.test.ts` (no plan
   highlights) plus, now, the rendered checks in `test/plans-render.test.tsx`
   and the visual spec. It is intentionally dead until a second plan exists —
   and its rendering path stays exercised by the gallery's two-plan fixture,
   which is part of why that fixture was kept.
9. ~~**`default_icon` could disappear without a test failing**~~ — **CLOSED
   2026-08-09.** The `background` / `action` `toEqual` shapes stay off (parity
   rows 40, 43); that recorded trade is unchanged and was **not** reverted —
   re-pinning whole objects would just break at the next shape change. Instead
   `test/manifest.test.ts` gained two narrow assertions: `action.default_icon`
   carries the 16/48/128 triple, and each declared path **resolves to a file on
   disk**. The disk check is the one with teeth — `manifest.icons` is the store
   icon, but `default_icon` is the toolbar button, i.e. the entire UI of this
   product, and a placeholder icon already shipped undetected here once (§5).
10. ~~**`npm run build:zip` has never been run**~~ (parity row 93) — **CLOSED
    2026-08-09.** Run; it works (`zip` CLI present, `manifest.json` at the
    archive root). The artifact is now asserted rather than merely produced:
    `test/zip-artifact.test.ts` builds a production dist into a private
    directory (the shared `dist/` is rebuilt concurrently by three other test
    files — same flake `test/injected-bundle.test.ts` documents), runs the real
    `scripts/zip-dist.mjs` over it through that script's `ZIP_DIST_DIR` /
    `ZIP_OUT` test seam, and walks the zip's central directory.

    **All ten entries, and the allowlist they are held against:**
    `manifest.json` (2,085 B), `background.js` (8,889), `content.js` (3,575),
    `options.html` (220), `options.js` (675,938), `options.js.LICENSE.txt`
    (13,514), `icons/` (directory record), `icons/icon-16.png` (322),
    `icons/icon-48.png` (564), `icons/icon-128.png` (1,449). Total 706,556 B.
    Explicitly asserted absent: `popup.html` / `popup.js` / anything matching
    `popup`, any `.map`, any `.env`, any dotfile (`.DS_Store`, `.git*`), and
    anything not on the allowlist — an allowlist for the same reason the
    manifest permission guard is one (§6): a denylist only catches the files
    somebody already thought of.

    **One entry was not obviously expected and is NOT a defect:**
    `options.js.LICENSE.txt`, 13.5 KiB, is terser's extracted third-party
    licence block (webpack's default `extractComments`) — the MIT/BSD notices
    for React, antd and rc-*, referenced by a banner at the top of `options.js`.
    Dropping it would ship those libraries without the attribution their
    licences require, so it is allowlisted deliberately rather than suppressed.
    No source map and no `.env` reach the archive.
11. **Restart survival of the dynamic content-script registration is
    UNVERIFIED** — see manual checklist row 19. Chrome treated every relaunch of
    an unpacked extension as a fresh install and `onStartup` never fired, so the
    spike could not settle it. `background.ts`'s re-assert is correct either way.
12. **The whole manual sheet is unrun.** `MANUAL-CHECKLIST.md` was written in
    this task; no row on it has been executed.
