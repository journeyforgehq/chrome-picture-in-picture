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
| Unit | `npm test` | **`Test Files 40 passed (40)` · `Tests 275 passed \| 1 skipped (276)`** |
| Build | `npm run build` | `webpack 5.108.1 compiled with 3 warnings in 4924 ms` — all three are asset-size advisories on `options.js` (660 KiB), no errors |
| Fixtures | `npm run e2e:fixtures` | **`45 passed (6.2s)`** |
| Visual | `npx playwright test --config playwright.visual.config.ts` | **`4 passed (11.3s)`** |
| Hermetic e2e | `npx playwright test` | `Running 12 tests using 1 worker` → **`4 skipped` · `8 passed (17.9s)`** |
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
| **Unit (vitest, happy-dom, 40 files)** | Scoring, arbitration, error mapping, storage, entitlement, the manifest allowlist, and both PiP failure shapes. `pipEntry` and `showToast` are rebuilt from their own source text in a bare scope. | Anything about the *shipped* artifact: vitest transpiles with **esbuild**, so a webpack/terser-only hoist is invisible here. No pixels. No real browser. |
| **`test/injected-bundle.test.ts`** (new) | The functions webpack + terser actually ship survive `new Function("return (" + fn.toString() + ")")()` **and execute** in a bare scope, still adopt their stylesheet, still map severity, still contain no `await`. It is the only check covering the whole ts-loader → webpack → terser path. | That anything ever *calls* them in a browser. It runs the bundle in `node:vm` with a chrome stub, not in Chrome. |
| **Fixtures (45, `playwright.fixtures.config.ts`)** | Detection across ~40 real DOM shapes via `pipEntry({ dryRun: true })`, in a real Chromium, over two real origins. Plus `gesture.spec.ts`: a real `requestPictureInPicture()` under a real `page.click()`, its exit, and a no-gesture control that really gets `NotAllowedError`. | **The gesture that ships.** `gesture.spec.ts` clicks a button *inside the page*. The product's gesture starts on the *toolbar*, in browser chrome, and travels worker→frame. See §4. |
| **Visual (4)** | Computed style + screenshot on the preview gallery: the accent reaches a checked switch (`rgb(22, 119, 255)` with the pointer moved away), focus rings survive antd's reset, the toast's colours cross the shadow boundary, and `scrollWidth <= 375` at mobile. | That the *extension page* looks the same — the gallery mounts `ThemeProvider`/antd from a dev harness and supplies its own HTML shell. §5 is what closes that. |
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

1. **The icon is placeholder art** — a flat `#1677ff` square at all three sizes.
   Manual checklist rows 2–3 will fail on legibility-of-meaning until real
   artwork lands.
2. **`__ORG__` placeholder** in the options footer's "Read the source" link.
   `test/options/options.test.tsx > options submission gates` is skipped and
   waiting; un-skip it once the real repo exists.
3. **`__EXT_ID__` placeholder** in `welcome-page/src/content.ts:155`
   (`pro.restoreHref: "chrome-extension://__EXT_ID__/options.html"`). It must be
   substituted with the real extension id once the store listing exists.
   *Note:* this token is **no longer caught by preflight** — that guard matched
   the old `REPLACE_WITH_EXTENSION_ID` spelling, and the welcome-page rewrite
   changed the spelling. Nothing red-flags it today.
4. ~~The welcome page still describes the template product~~ — **CLOSED.**
   Parity row 94 / finding 4 is stale: commit `9a43d02` rewrote the copy.
   Verified in this pass — `appName: "Picture in Picture"`, and the
   `permissions` list now carries a `scripting` entry.
5. **Preflight is red on 5 items**, verified by running `node
   scripts/preflight.mjs` in this pass:
   `backend/wrangler.toml` × 3 unfilled KV ids
   (`REPLACE_WITH_KV_ID` / `_STAGING_` / `_PROD_`), `extension/.env`
   `BACKEND_BASE_URL` empty (paywall + `/me` target localhost), and
   `extension/.env` `no STRIPE_ANNUAL_URL or STRIPE_LIFETIME_URL (checkout has
   no link)`. The lifetime rule fires as written and passes once the link is
   filled.
6. **Nothing renders the real `$9.99` single-plan card** (parity row 65 /
   finding 3). `PLANS` is asserted as data; `UpgradePaywall` is rendered with
   fixture arrays; the one-plan layout branch (`span 24`, `width 380`) and the
   actual price string on screen are unverified.
7. **`LockedFeature` has no production mount** (parity row 9 / finding 5) — the
   intended, signed-off shape of v1 free. The preview gallery is its only
   rendering; the four `PLAN 2:` fixmes hold its e2e assertions.
8. **`focusTriggerAfterClose={false}`** — the deliberate anti-dark-pattern
   choice — has no assertion; the POPULAR ribbon is unreachable (no plan sets
   `highlight`).
9. **`background` / `action` `toEqual` shapes stay off** (parity rows 40, 43), a
   recorded conscious trade. `default_icon` could disappear without a test
   failing.
10. **`npm run build:zip` has still never been run** (parity row 93).
11. **Restart survival of the dynamic content-script registration is
    UNVERIFIED** — see manual checklist row 19. Chrome treated every relaunch of
    an unpacked extension as a fresh install and `onStartup` never fired, so the
    spike could not settle it. `background.ts`'s re-assert is correct either way.
12. **The whole manual sheet is unrun.** `MANUAL-CHECKLIST.md` was written in
    this task; no row on it has been executed.
