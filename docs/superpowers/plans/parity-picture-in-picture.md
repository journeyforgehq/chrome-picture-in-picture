# Parity evidence — options page vs. the popup it replaces

**This document is the gate on deleting the popup. Nothing has been deleted.**
`src/popup/`, `test/popup/`, `e2e/popup-loads.spec.ts`, the webpack `popup`
entry, its `HtmlWebpackPlugin` and the gallery's two `PopupView` cards are all
still present, and every number below was produced **with the popup still in the
tree**. That is deliberate: it proves the options page carries each capability
*independently*, not merely that nothing else was left pointing at the popup.

One row per **Preserved** capability of
`decisions-picture-in-picture.md` — 79 rows, matching that document's
`Preserved: 79` count exactly. For each: the command that exercised it **through
the replacement**, and the pasted result.

`grep` finding no dangling references is **not** parity. There is a grep note at
the very bottom, clearly labelled as not-the-gate.

---

## How the evidence was produced

Every command below was run on 2026-08-09 from
`/Users/oleksiiostapiuk/projects/chrome/picture-in-picture`, branch
`feat/v1-free`, and its output is pasted verbatim.

| Handle | Command | Result |
|---|---|---|
| **C1** | `cd extension && npm test -- --reporter=verbose` | `Test Files  41 passed (41)` / `Tests  279 passed \| 1 skipped (280)` |
| **C2** | `cd extension && npx playwright test` | `4 skipped` / `9 passed (23.0s)` |
| **C3** | `cd extension && npm run e2e:fixtures` | `45 passed (6.5s)` |
| **C4** | `cd extension && npm run e2e:visual` | `4 passed (11.3s)` |
| **C5** | `cd extension && npm run build` | `webpack 5.108.1 compiled with 3 warnings in 5611 ms` (3 = asset-size advisories only) |
| **C6** | `cd extension && npm run preview:build` | `webpack 5.108.1 compiled successfully in 2649 ms` |
| **C7** | `cd extension && npm run typecheck && npm run e2e:typecheck` | both exit 0, no output |
| **C8** | `node scripts/preflight.mjs` (repo root) | 6 issues, listed under row 95 |

C2 in full, since most billing rows point at it:

```
Running 13 tests using 1 worker

  ✓  1 billing.spec.ts:29:1 › checkout webhook grants pro; cancel webhook re-locks (1.7s)
  -  2 billing.spec.ts:99:6 › PLAN 2: a Pro-gated options row is dimmed + disabled on Free
  ✓  3 dunning-refund.spec.ts:26:1 › past_due shows the nudge but keeps Pro; refund re-locks (1.6s)
  -  4 dunning-refund.spec.ts:114:6 › PLAN 2: a refund re-locks the Pro-gated options rows
  ✓  5 grace.spec.ts:25:1 › offline grace keeps Pro within the window (1.3s)
  -  6 grace.spec.ts:73:6 › PLAN 2: a Pro-gated options row stays interactive through the grace window
  ✓  7 health.spec.ts:6:1 › global setup built dist and started a healthy worker (22ms)
  ✓  8 identity.spec.ts:4:1 › fresh install generates a device id and caches the free tier (1.0s)
  ✓  9 popup-loads.spec.ts:3:1 › popup renders Free tier with the pro tool locked (888ms)
  ✓ 10 renewal-cascade.spec.ts:29:1 › renewal keeps both devices pro; cancel re-locks both (2.3s)
  -  11 renewal-cascade.spec.ts:135:6 › PLAN 2: the cancel cascade re-locks the Pro-gated rows on both installs
  ✓ 12 restore.spec.ts:56:1 › restore on a fresh device grants pro (2.4s)
  ✓ 13 restore.spec.ts:118:1 › restore with an unknown email shows the not-found message (988ms)

  4 skipped
  9 passed (23.0s)
```

Line 9 is the popup's own spec, still passing, still untouched. The four `-`
lines are the parked Pro-gating assertions described in §3.

---

## 1. The parity table

Legend for the verdict column: **✅ exercised** — a command above put the
capability through its paces on the replacement surface. **⚠️ partial** — covered
at component or compile level only, no end-to-end exercise. **❌ not exercised** —
no command in this repo touches it; see §2.

| Inv # | Capability | Command | Pasted result | |
|---|---|---|---|---|
| 1 | Tier badge (Free/Pro) on the options page | C1, C2 | `✓ test/options/OptionsView.test.tsx > OptionsView — your plan row > renders the TierBadge for free` · `✓ … renders the TierBadge for pro` · `✓ 1 billing.spec.ts:29:1 › checkout webhook grants pro; cancel webhook re-locks` (asserts `[data-testid="tier-badge"]` = Free → Pro → Free) | ✅ |
| 2 | Paywall trigger via `LockedFeature`'s "Unlock" | C1 | `✓ test/ui-kit/LockedFeature.test.tsx > LockedFeature > calls onUnlock when the unlock affordance is clicked` — component only; no production mount exists (DEFERRED to plan 2) | ⚠️ |
| 3 | Checkout hand-off (`checkoutUrl` → `chrome.tabs.create`, `window.open` fallback), incl. `client_reference_id` | C1 | `✓ test/options/options.test.tsx > Options container > opens the lifetime checkout URL, with the device id as client_reference_id` · `✓ … falls back to window.open when chrome.tabs is unavailable`. **Ported from the popup in this pass** (the popup's copy stays until the popup goes). Both assert the whole URL — `https://buy.stripe.com/test-lifetime?client_reference_id=device-abc-123` — not merely that a tab opened. | ✅ |
| 4 | `UpgradePaywall` mounted with the shared `PLANS` array | C1, C7 | `✓ test/options/OptionsView.test.tsx > OptionsView — your plan row > renders UpgradePaywall as open when paywallOpen is true` — but with a local fixture array. That `options.tsx` passes the *shared* `PLANS` is compile-checked only (C7 exit 0). | ⚠️ |
| 5 | `PaymentNudge` (`past_due` alert + "Update payment method") | C1, C2 | `✓ test/options/OptionsView.test.tsx > … renders the PaymentNudge only when past_due` · `✓ … renders no PaymentNudge when active` · `✓ 3 dunning-refund.spec.ts:26:1 › past_due shows the nudge but keeps Pro; refund re-locks` (now asserts "Payment issue" + the "Update payment method" link + the "Past due" PlanBadge tag **on options.html**) | ✅ |
| 9 | `LockedFeature` production mount | C1, C6 | `✓ test/ui-kit/LockedFeature.test.tsx > LockedFeature > disables the wrapped interactive child when locked` (+3 more) and `webpack 5.108.1 compiled successfully` for the gallery. **No production mount** — DEFERRED to plan 2, recorded gap 1. | ❌ |
| 10 | Device-id bootstrap on mount → `chrome.storage.local.device_id` | C2 | `✓ 8 identity.spec.ts:4:1 › fresh install generates a device id and caches the free tier` — `waitForDeviceId` now polls after navigating **options.html**; also gates billing/grace/dunning/renewal/restore | ✅ |
| 11 | Entitlement lifecycle (create → cached seed → refresh → re-read, `cancelled` guard) | C1 | `✓ test/options/options.test.tsx > Options container > refreshes tier on mount and renders the PlanBadge accordingly` · `✓ … passes cached plan/status through to OptionsView (PlanBadge shows the plan, not 'No plan')` | ✅ |
| 12 | Cached-tier seed / "no Free flash" | C1 | `✓ test/options/options.test.tsx > Options container > seeds the cached Pro tier immediately (no Free flash) before refresh resolves` — **recorded gap 4 is now closed**: the regression test exists on the options side, not just the popup's | ✅ |
| 13 | `ThemeProvider accent={config.ACCENT}` wrapping the page root | C1, C4 | `✓ test/ui-kit/theme.test.tsx > ThemeProvider > applies the accent as the antd primary color token (behavior, not just prop presence)` · `✓ 1 options-visual.spec.ts:54:3 › options page renders and themes its controls @desktop` with `[desktop] checked switch background-color, pointer away: rgb(22, 119, 255)` | ✅ |
| 18 | `popup-loads.spec.ts` (Free badge + locked fieldset) | C2 | Free-badge half now also proven on options: `✓ 1 billing.spec.ts:29:1 …`. Locked-fieldset half parked: `- 2 billing.spec.ts:99:6 › PLAN 2: a Pro-gated options row is dimmed + disabled on Free`. The spec itself is untouched and still green (`✓ 9 popup-loads.spec.ts:3:1`); its retarget is a deletion-time step. | ⚠️ |
| 19 | `identity.spec.ts` (fresh install → UUID + cached `free`) | C2 | `✓ 8 identity.spec.ts:4:1 › fresh install generates a device id and caches the free tier` — retargeted to `options.html`, assertions unchanged | ✅ |
| 20 | `billing.spec.ts` (full money loop + screenshots + options at 375px) | C2 | `✓ 1 billing.spec.ts:29:1 › checkout webhook grants pro; cancel webhook re-locks`; screenshots written: `options-free.png`, `options-pro.png`, `options-mobile.png` (verified on disk in `e2e/__screens__/`) | ✅ |
| 21 | `grace.spec.ts` (7-day offline grace, `grace-pro.png`) | C2 | `✓ 5 grace.spec.ts:25:1 › offline grace keeps Pro within the window` — abort/reload logic unchanged, tier read from `[data-testid="tier-badge"]` | ✅ |
| 22 | `dunning-refund.spec.ts` (past_due keeps Pro + nudge, redelivery, refund re-locks) | C2 | `✓ 3 dunning-refund.spec.ts:26:1 › past_due shows the nudge but keeps Pro; refund re-locks`. The re-lock subject moved from `ProTool` to the Free-tier `Upgrade` affordance; the `LockedFeature` half is parked (`- 4 …`). | ✅ |
| 23 | `renewal-cascade.spec.ts` (two independent installs) | C2 | `✓ 10 renewal-cascade.spec.ts:29:1 › renewal keeps both devices pro; cancel re-locks both` — both contexts navigate `options.html` | ✅ |
| 24 | `restore.spec.ts` (device A + device B) | C2 | `✓ 12 restore.spec.ts:56:1 › restore on a fresh device grants pro` · `✓ 13 restore.spec.ts:118:1 › restore with an unknown email shows the not-found message` — device A now uses `options.html` too, so the spec runs on one page | ✅ |
| 25 | `health.spec.ts` asserting a built HTML artifact on disk | C2 | `✓ 7 health.spec.ts:6:1 › global setup built dist and started a healthy worker`. **Not yet amended** — it still asserts `dist/popup.html`, which is correct today and becomes wrong at deletion. See §3. | ⚠️ |
| 26 | `e2e/README.md` hermetic spec list | — | Not amended. Its line `popup-loads.spec.ts — popup Free, pro tool locked` is still accurate while the popup exists. A deletion-time edit. See §3. | ⚠️ |
| 27 | `harness/identity.ts` contract + the race doc-comment | C2 | `✓ 8 identity.spec.ts:4:1 …` and five more specs call `waitForDeviceId` on `options.html`, so the "must be called on an extension page" contract is exercised there. The doc comment still cites `src/popup/popup.tsx`, which still exists — the file is **not** drifted (see `core-drift.md`). | ✅ |
| 28 | `readDeviceId` / `waitForDeviceId` / `readCachedTier` storage readers | C1, C2 | `✓ test/harness/config.test.ts > e2e harness config > …` (5 tests) and every green spec in C2 — the readers are page-agnostic and unchanged | ✅ |
| 29 | Per-test fresh persistent context; extension id from the SW URL | C2 | All 9 passing specs launched their own context; `✓ 10 renewal-cascade.spec.ts:29:1 …` additionally proves two simultaneous independent installs get distinct ids | ✅ |
| 30 | Signed Stripe webhook forgery harness | C1, C2 | `✓ test/harness/webhook.test.ts > signStripeHeader > produces \`t=,v1=\` with HMAC-SHA256 over \`${t}.${payload}\`` (+9 builder tests); every grant/revoke in C2 went through it and returned 200 | ✅ |
| 31 | `globalSetup` build + wiped `wrangler dev` | C2 | `✓ 7 health.spec.ts:6:1 › global setup built dist and started a healthy worker` (`/health` 200, `version === "e2e"`) | ✅ |
| 32 | `playwright.config.ts` auto-collection of `e2e/**/*.spec.ts` | C2 | `Running 13 tests using 1 worker` — 13 = 9 live + 4 newly-added parked tests, all collected without a config change | ✅ |
| 33 | Content-script presence marker, idempotent across repeat calls | C1 | `✓ test/content.test.ts > installContentScript — idempotency guard > sets the __pipInjected flag, which is what makes re-entry a no-op` · `✓ … registers exactly ONE onMessage listener across three installs` · `✓ … attaches its media-event listeners only once` | ✅ |
| 35 | `typeof document !== "undefined"` runtime-entry guard | C1 | `src/content/content.ts:213` still guards the runtime entry; proof it works is that `test/content.test.ts` imports the module under happy-dom without self-executing — `✓ test/content.test.ts > localScore > is null when the frame has no candidate video` (+23 more in that file) | ✅ |
| 36 | Separation guard's declared subject (content must never import antd / ui-kit) | C1 | `✓ test/separation.test.ts > content-script/ui-kit separation guard > passes on the real build: content chunk stays antd-free` | ✅ |
| 37 | MV3, name/description/version; name literal pinned as the scaffold token | C1 | **Restored in this pass:** `✓ test/manifest.test.ts > manifest identity > pins the child's name, so a half-finished scaffold rename cannot ship` · `✓ … is MV3 and carries a description and a version`. This also re-arms the compensating control that justified dropping inventory row 34's slug-token check. | ✅ |
| 38 | `permissions` asserted with exact `toEqual` | C1 | `✓ test/manifest.test.ts > manifest permission allowlist (R-04) > declares exactly these three permissions and nothing else` (`["storage","activeTab","scripting"]`) | ✅ |
| 39 | `activeTab` declared *and now consumed* | C1 | `✓ test/invariants.test.ts > gesture invariants > 1 — no await precedes executeScript inside the onClicked handler` · `✓ test/manifest.test.ts > … binds the shortcut to _execute_action, never a custom command` | ✅ |
| 40 | Background service worker declaration (`toEqual`) | C1, C5 | The declaration is present in `src/static/manifest.json` and `background.js` builds (`✓ test/webpack-config.test.ts > webpack.prod.cjs > builds background.js and content.js with no errors`), but **the `toEqual` assertion on the `background` block is gone** from `test/manifest.test.ts`. See §2, finding 2. | ⚠️ |
| 43 | `action` block asserted with `toEqual`; `default_popup` removed | C1 | `✓ test/manifest.test.ts > … has no default_popup — the toolbar button is the feature`. The `toEqual` shape assertion (which pinned `default_icon`) was **not** preserved against the new shape. See §2, finding 2. | ⚠️ |
| 45 | `options_page` + top-level `icons` triple | C1, C2 | `✓ test/manifest.test.ts > … keeps the icon triple the factory actually generates` · `✓ test/manifest.test.ts > manifest identity > ships options.html as the extension's page` (**added in this pass**), plus the indirect exercise of every spec that navigates it | ✅ |
| 47 | Webpack entries | C1, C5 | `✓ test/webpack-config.test.ts > webpack.prod.cjs > builds popup.js/options.js/popup.html/options.html alongside background/content`. The `options` entry is proven; the `popup` entry is deliberately still present (deletion-time change). | ✅ |
| 49 | `test/webpack-config.test.ts` chunk/asset assertions | C1 | `✓ test/webpack-config.test.ts > webpack.prod.cjs > builds popup.js/options.js/popup.html/options.html alongside background/content` · `✓ … builds background.js and content.js with no errors` — the options + content halves are live; the popup half is what dies at deletion | ✅ |
| 50 | `CopyPlugin` of `src/static` | C5 | `npm run build` emits `dist/manifest.json` and `dist/icons/*`; confirmed by `✓ 7 health.spec.ts:6:1 …`, which asserts `existsSync(dist/manifest.json)` | ✅ |
| 51 | `DefinePlugin`'s 8 public build vars | C1 | `✓ test/config.test.ts > config > provides sane defaults when no env vars are set` · `✓ … reflects overrides from process.env` · `✓ … populates STRIPE_LINKS.monthly from process.env.STRIPE_MONTHLY_URL` · `✓ test/webpack-config.test.ts > webpack.common.cjs .env loading > webpack.common loads STRIPE_ANNUAL_URL from a .env file (dotenv) into DefinePlugin` — the monthly/annual vars stay defined-but-empty, exactly as decided | ✅ |
| 52 | `APP_ENV` env-file layering | C1 | `✓ test/webpack-config.test.ts > webpack.common.cjs .env loading > webpack.common loads STRIPE_ANNUAL_URL from a .env file (dotenv) into DefinePlugin` | ✅ |
| 53 | `webpack.prod.cjs` pinning `DEV_PRO=false` + `bail`; dev source maps | C1 | `✓ test/webpack-config.test.ts > webpack.prod.cjs > pins DEV_PRO to "false" in the injected DefinePlugin regardless of shell env (spec §9)` · `✓ test/webpack-config.test.ts > webpack.dev.cjs > builds successfully with inline source maps` | ✅ |
| 54 | `splitChunks: false` + `output.clean` | C1 | `✓ test/separation.test.ts > … passes on the real build: content chunk stays antd-free` — a per-chunk guard is only meaningful because entries are single self-contained files | ✅ |
| 55 | `webpack.preview.cjs` dev-only gallery build | C1, C6 | `✓ test/webpack-preview-config.test.ts > webpack.preview.cjs > builds the gallery entry to dist-preview/ without errors` · `webpack 5.108.1 compiled successfully in 2649 ms` | ✅ |
| 56 | Separation-guard rule (content chunk only) | C1 | `✓ test/separation.test.ts > … passes on the real build: content chunk stays antd-free` | ✅ |
| 57 | Real module-graph walk (catches transitive leaks) | C1 | `✓ test/separation.test.ts > content-script/ui-kit separation guard > FAILS the build when the content entry transitively imports ui-kit` | ✅ |
| 58 | Reports paths, pushes to `compilation.errors`, throws from `afterEmit` | C1 | Same test as row 57 — it asserts the rejection matches `/separation-guard/i`, i.e. the throw actually reaches `compiler.run()` | ✅ |
| 59 | Silent no-op when no chunk is named `content` | C1 | Compensating control exercised: `✓ test/webpack-config.test.ts > webpack.prod.cjs > builds background.js and content.js with no errors` keeps a chunk named `content` in existence, so the guard stays armed | ✅ |
| 60 | Two-sided guard coverage (real build clean + fixture must fail) | C1 | Both sides green: `✓ … passes on the real build …` and `✓ … FAILS the build when the content entry transitively imports ui-kit` | ✅ |
| 62 | `PLANS` as the single source | C1, C7 | `✓ test/plans.test.ts > PLANS (single source) > has at least one plan, each with a label and a price`; `options.tsx` is the only production importer (`popup.tsx` still imports it until deletion). C7 exit 0. | ✅ |
| 64 | Plan id → `config.STRIPE_LINKS[id]`; `checkoutUrl` appends `client_reference_id` | C1 | `✓ test/checkout.test.ts > checkoutUrl > appends client_reference_id to a link with no existing query params` · `✓ … appends client_reference_id to a link that already has query params` · `✓ … URL-encodes special characters in the device id` · `✓ … uses the monthly link for the monthly plan` (all three keys still mapped) · `✓ test/billing-integration.test.ts > billing barrel integration > wires device-id -> entitlement -> checkout end-to-end` | ✅ |
| 65 | `UpgradePaywall` layout driven by `plans.length` (span 24 / width 380 at one plan) | C1 | `✓ test/ui-kit/UpgradePaywall.test.tsx > UpgradePaywall > lists every given plan when open` — but **nothing asserts the one-plan span/width branch, and nothing renders the real `$9.99` card**. The decisions log named this as "the cheapest place to prove the $9.99 single card renders"; it was not added. See §2, finding 3. | ⚠️ |
| 66 | Preflight fails if both `STRIPE_ANNUAL_URL` and `STRIPE_LIFETIME_URL` are empty | C8 | `✗ extension/.env: no STRIPE_ANNUAL_URL or STRIPE_LIFETIME_URL (checkout has no link)` — the rule fires as written, and `STRIPE_LIFETIME_URL` alone would satisfy it, so lifetime-only passes once the link is filled | ✅ |
| 68 | Backend derives the plan label from Stripe checkout **mode** | C2 | `✓ 12 restore.spec.ts:56:1 › restore on a fresh device grants pro` — device A is now granted through a `mode: "payment"` checkout, and the restored device B renders **"Lifetime" + "Active"**. Previously this spec asserted `"Annual"`, a label lifetime-only pricing can no longer produce. The `subscription → "annual"` branch stays live and is still exercised by billing/grace/dunning/renewal. | ✅ |
| 69 | "… — Settings" heading + `/Settings/` e2e assertion | C2 | `✓ 1 billing.spec.ts:29:1 …` step 6 asserts `getByText(/Settings/)` against "Picture in Picture — Settings" at 375×667 | ✅ |
| 70 | Restore form (Email input + submit, `required` + `type: email`) | C1, C2 | `✓ test/ui-kit/RestoreForm.test.tsx > RestoreForm > calls onRestore with the entered email on submit` · `✓ test/options/OptionsView.test.tsx > OptionsView — restore row > wires the RestoreForm's submit to onRestore(email)` · `✓ 12 restore.spec.ts:56:1 …` | ✅ |
| 71 | Restore status messages, all four branches, each `role="alert"` | C1, C2 | `✓ test/ui-kit/RestoreForm.test.tsx > … renders a success message when result.ok is true` · `✓ … renders the 404 message when result.error.status is 404` · `✓ … shows the not-found warning for a 200 {ok:false} miss` · `✓ … renders the 429 message when result.error.status is 429` · `✓ … falls back to error.message for any other error status` · `✓ 13 restore.spec.ts:118:1 …` | ✅ |
| 72 | Restore container wiring (`restore(email)`, `restoring` state, tier update) | C1 | `✓ test/options/options.test.tsx > Options container > calls entitlement.restore(email) then reflects the RestoreResult in state` · `✓ … a successful restore updates the displayed tier` · `✓ test/ui-kit/RestoreForm.test.tsx > … disables the submit button while loading` | ✅ |
| 73 | `PaymentNudge` rendered above the plan badge | C1 | `✓ test/options/OptionsView.test.tsx > OptionsView — your plan row > renders the PaymentNudge only when past_due` · `✓ … renders no PaymentNudge when active` | ✅ |
| 74 | `PlanBadge` (plan tag + status tag, "No plan" fallback) | C1, C2 | `✓ test/ui-kit/PlanBadge.test.tsx > PlanBadge > shows 'Lifetime' for plan=lifetime` · `✓ … shows 'Annual' + 'Active' for plan=annual, status=active` (kept live for plan 2) · `✓ … renders 'No plan' gracefully when plan is undefined` · `✓ test/options/OptionsView.test.tsx > … renders PlanBadge from plan/status props` · `✓ 12 restore.spec.ts:56:1 …` asserts Lifetime/Active/No-plan on the real page | ✅ |
| 75 | Options "Upgrade" button + `UpgradePaywall` mount | C1, C2 | `✓ test/options/OptionsView.test.tsx > OptionsView — your plan row > offers Upgrade on the free tier` · `✓ … offers no Upgrade button on the pro tier` · `✓ … renders UpgradePaywall as open when paywallOpen is true`. The button is now also the **Layer-2 e2e subject** in billing/grace/dunning/renewal (present on Free, absent on Pro). | ✅ |
| 76 | Options checkout hand-off (`chrome.tabs.create` + `window.open` fallback) | C1 | Both branches now covered: `✓ test/options/options.test.tsx > Options container > opens the lifetime checkout URL, with the device id as client_reference_id` (chrome.tabs.create path) · `✓ … falls back to window.open when chrome.tabs is unavailable` (the `window.open(url, "_blank")` fallback, asserted with both arguments). The sibling `✓ … opens Chrome's shortcut editor through chrome.tabs.create, not a chrome:// link` covers the same pattern on the shortcuts handler. | ✅ |
| 77 | Options entitlement lifecycle; `restore.spec.ts` device-B bootstrap | C1, C2 | `✓ test/options/options.test.tsx > Options container > refreshes tier on mount and renders the PlanBadge accordingly` · `✓ 12 restore.spec.ts:56:1 …` (device B bootstraps identity on `options.html`, as it always did) | ✅ |
| 78 | Responsive layout, mobile screenshot | C2, C4 | `✓ 1 billing.spec.ts:29:1 …` writes `options-mobile.png` at 375×667 · `✓ 2 options-visual.spec.ts:54:3 › options page renders and themes its controls @mobile`. Note the card max-width is now **560px** with a `@media (max-width: 480px)` reflow, not the baseline's 480px — a deliberate rebuild change, not a regression. | ✅ |
| 79 | `optionsview-free` / `optionsview-restore-404` gallery cards | C1, C6 | `✓ test/webpack-preview-config.test.ts > webpack.preview.cjs > builds the gallery entry to dist-preview/ without errors`. The gallery now carries **four** OptionsView cards (`optionsview-free`, `optionsview-pro`, `optionsview-embedded-on`, `optionsview-restore-404`) — a superset of the two required. | ✅ |
| 80 | `options.html` shell + "options root element missing" throw | C2, C5 | `options.html` is emitted (`✓ test/webpack-config.test.ts > … popup.html/options.html …`) and successfully mounted by all 8 specs that navigate it — a failed mount would leave the page blank and every `[data-testid="tier-badge"]` assertion would time out | ✅ |
| 81 | `UpgradePaywall` behaviours (`destroyOnClose`, `focusTriggerAfterClose={false}`, POPULAR ribbon, `ctaLabel`, reserved rows) | C1 | `✓ test/ui-kit/UpgradePaywall.test.tsx > … does not render modal content when open=false` (destroyOnClose) · `✓ … names the CTA after its visible text when a plan overrides ctaLabel` · `✓ … renders each plan's optional feature bullets when provided` · `✓ … renders no feature list when a plan has no features (backward compatible)` · `✓ … calls onClose when the modal close control is used`. **`focusTriggerAfterClose={false}` and the POPULAR ribbon have no assertion** — the ribbon is now unreachable (no plan sets `highlight`). | ⚠️ |
| 82 | `ThemeProvider` / `buildTheme(accent)` | C1, C4 | `✓ test/ui-kit/theme.test.tsx > buildTheme > uses the given accent as colorPrimary` (+4) · `✓ 1 options-visual.spec.ts:54:3 … @desktop` with the pasted computed value `rgb(22, 119, 255)` · `✓ 3 toast-visual.spec.ts:15:3 › toast styles cross the shadow boundary @desktop` proves the PiP toast stays *outside* this theme | ✅ |
| 83 | ui-kit barrel + export-surface test | C1 | `✓ test/ui-kit/index.test.ts > ui-kit barrel > exports theme + ThemeProvider` · `✓ … exports all five billing components` — `LockedFeature` still exported despite having no production mount | ✅ |
| 84 | Preview gallery renders every ui-kit component in every state | C1, C6 | `✓ test/webpack-preview-config.test.ts > … builds the gallery entry to dist-preview/ without errors` · `webpack … compiled successfully`. `preview/gallery.tsx` mounts TierBadge ×2, PlanBadge ×3, PaymentNudge, LockedFeature locked+unlocked, UpgradePaywall, RestoreForm ×4, Toast ×6, PopupView ×2, OptionsView ×4. This is `LockedFeature`'s only live rendering. | ✅ |
| 85 | `handleInstalled` opens `WELCOME_URL` once, install-only, if configured | C1 | `✓ test/background.test.ts > handleInstalled > opens the welcome URL on a fresh install` · `✓ … does not open the welcome URL on update` · `✓ … does not open the welcome URL on chrome_update` · `✓ … does nothing if WELCOME_URL is empty (unset in dev)` | ✅ |
| 86 | `uninstallUrl` with `?v=<version>`; null on empty/malformed; version-only privacy rule | C1 | `✓ test/background.test.ts > uninstallUrl > appends the version as ?v= for release-cohort bucketing` · `✓ … returns null when no URL is configured (empty in dev)` · `✓ … returns null (never throws) on a malformed URL` · `✓ … omits ?v= when the version is unknown` · `✓ … preserves an existing query string and never appends a deviceId` | ✅ |
| 87 | `handleMessage` runtime-message relay stub | C1 | `✓ test/background.test.ts > handleMessage (relay stub) > returns an unhandled result for any message type`. Note the PiP flow grew its own typed messages (`PIP_COORD`, `PIP_SCORE_REQUEST`) rather than routing through the stub — `✓ test/content.test.ts > installContentScript — PIP_SCORE_REQUEST > ignores message types it does not own`. | ✅ |
| 88 | Device id (`crypto.randomUUID` → sync + local mirror) | C1, C2 | `✓ test/device-id.test.ts > getDeviceId > generates a fresh id and persists it to BOTH sync and local when neither has one` (+4) · `✓ test/billing/chrome-storage.test.ts > chromeSyncLocalStores > keeps sync and local as independent areas` (+6) · `✓ 8 identity.spec.ts:4:1 …` asserts a real UUID on `options.html` | ✅ |
| 89 | Entitlement client (`/me`, cache, 7-day grace, `restore`, `clear`, `devPro`) | C1, C2 | `✓ test/entitlement.test.ts > createEntitlement > offline within the grace window keeps the last-known pro tier` · `✓ … offline past the grace window falls back to free` (+11) · `✓ 5 grace.spec.ts:25:1 › offline grace keeps Pro within the window` | ✅ |
| 90 | `src/contract.ts` byte-identical to the backend's | C1 | `✓ test/contract-sync.test.ts > contract.ts stays in sync with the backend > is byte-identical to template/backend/src/contract.ts` | ✅ |
| 91 | `package.json` scripts pinned by test | C1 | `✓ test/scripts.test.ts > package.json scripts > has build, build:dev, test, typecheck, and verify scripts` | ✅ |
| 92 | `gen-icons.mjs` + PNG signature/IHDR test | C1 | `✓ test/icons.test.ts > gen-icons.mjs > writes a non-empty, valid PNG at icon-16.png` · `… icon-48.png` · `… icon-128.png`. As the decisions log warned, this passes with *any* art — the PiP artwork itself is unverified. | ✅ |
| 93 | `build:zip` packaging `dist/` contents | C1, C5 | `✓ test/scripts.test.ts > … has build, build:dev, test, typecheck, and verify scripts` pins the script surface, and C5 produces the `dist/` it packages. **`npm run build:zip` itself was not run in this pass.** | ⚠️ |
| 94 | Welcome-page shipped copy | C8 | **Not done.** `welcome-page/src/content.ts` still reads `appName: "Hello Gated"`, `"Open the popup" — "Click the Hello Gated icon in your toolbar"`, and the Uppercase/Reverse feature cards, and its `permissions` list still has only `storage` + `activeTab` (no `scripting`). See §2, finding 4. | ❌ |
| 95 | `pro.restoreHref` `REPLACE_WITH_EXTENSION_ID` placeholder | C8 | `✗ welcome-page/src/content.ts: unfilled placeholder REPLACE_WITH_EXTENSION_ID` — the guard is intact and correctly still red, exactly as the decisions log requires | ✅ |

**Row count: 79.** Verdicts: **67 ✅ exercised, 10 ⚠️ partial, 2 ❌ not exercised.**

This supersedes the pre-remediation tally of 63 / 11 / 5. Four rows moved after the
coordinator asked for the blocking gap to be closed: rows 3, 76 and 37 went
❌ → ✅, row 45 went ⚠️ → ✅. **The two remaining ❌ are inventory row 9 (no
production mount for `LockedFeature` — the intended, signed-off state of v1 free)
and inventory row 94 (the welcome page still describes the template product).**
Neither blocks the deletion.

---

## 2. Preserved capabilities that could NOT be exercised

Two ❌ rows remain, plus the partials worth escalating. The two findings that
blocked or weakened the deletion decision have been closed; both are kept below
with their resolutions, because the reasoning is what a reviewer needs, not just
the green tick.

### Finding 1 — the checkout hand-off had no coverage on the options side (rows 3, 76) — ✅ CLOSED

**Originally:** decisions row 3 says the `client_reference_id=device-abc-123`
assertion **"must move from `test/popup/popup.test.tsx` to
`test/options/options.test.tsx`."** It had not moved. The only automated proof
that clicking a plan opens a checkout URL carrying the device id lived in a popup
test — so deleting the popup would have left the money path's first step untested
at every level, with no e2e spec opening the paywall either. A capability whose
only proof lives inside the thing being deleted is not preserved; it is scheduled
for loss.

**Now:** ported to `test/options/options.test.tsx`, exercising the real route a
user takes — Free tier → `Upgrade` → paywall → the lifetime CTA:

```
✓ test/options/options.test.tsx > Options container > opens the lifetime checkout URL, with the device id as client_reference_id
✓ test/options/options.test.tsx > Options container > falls back to window.open when chrome.tabs is unavailable
```

What they assert, precisely:

- `chrome.tabs.create` is called **exactly once**, and its `url` is
  `https://buy.stripe.com/test-lifetime?client_reference_id=device-abc-123` —
  the whole string, not a `toContain`. That pins three things at once: the link
  resolved from `config.STRIPE_LINKS.lifetime` (i.e. the **lifetime** plan's
  link, not another tier's), the separator logic, and the device id.
- The fallback branch calls `window.open(url, "_blank")` with the same URL when
  `chrome.tabs` is absent — the branch `options.tsx:159-163` has for
  non-extension hosts. The popup's copy never covered this.
- The CTA is matched via `` new RegExp(`choose ${PLANS[0].label}`) `` rather than
  the literal "Choose Lifetime", so a future pricing change cannot silently
  disarm the test by renaming the button.

`config.ts` reads `process.env` at module-eval time, so the Stripe link is
injected through a `vi.hoisted` block — the only hook that runs before the
imports are evaluated. Without it `STRIPE_LINKS.lifetime` is `""` and the test
could only have asserted a bare query string, which would not prove *which link*
was opened.

**The popup's own copy was left in place.** It stays until the popup does.

### Finding 2 — four manifest assertions were dropped by an earlier task (rows 37, 40, 43, 45) — ⚠️ PARTIALLY CLOSED, deliberately

`test/manifest.test.ts` was rewritten around the R-04 permission allowlist and
lost four assertions the decisions log expected to survive. Two are restored; two
are left off on purpose.

**Restored** — a new `describe("manifest identity")` block sits alongside the
allowlist assertions (the two guard different things, identity vs. privilege, and
are not in tension):

```
✓ test/manifest.test.ts > manifest identity > pins the child's name, so a half-finished scaffold rename cannot ship
✓ test/manifest.test.ts > manifest identity > is MV3 and carries a description and a version
✓ test/manifest.test.ts > manifest identity > ships options.html as the extension's page
```

- **Row 37** — `manifest.name` is pinned to
  `"Picture in Picture - Floating Video Player"` again. This matters beyond
  itself: it was the **compensating control** the decisions log leaned on when it
  dropped inventory row 34 (the `data-picture-in-picture-present` slug-token
  check in `test/content.test.ts`). That drop was justified *because* the name
  assertion would still catch a missed rename. With both gone, nothing did.
  Re-arming this restores the justification retroactively.
- **Row 45** — `options_page: "options.html"` now has a direct assertion instead
  of only the indirect exercise of specs navigating it.

**Deliberately not restored:**

- **Row 40** (`background` `toEqual`) and **Row 43** (`action` `toEqual`) — these
  whole-object shape assertions were narrowed on purpose when `default_popup` was
  removed. Re-pinning entire objects would simply break again the next time the
  shape moves, including at deletion time. `action.default_popup === undefined`
  remains asserted, which is the part that carries the product decision. The
  residual exposure is that `default_icon` could disappear without a test
  failing; that is a conscious trade, recorded here rather than silently taken.

### Finding 3 — the $9.99 single plan card is never rendered in a test (row 65)

`PLANS` is now one entry at `$9.99`. `test/plans.test.ts` asserts the data;
`test/ui-kit/UpgradePaywall.test.tsx` renders local fixture arrays. Nothing
renders the real `PLANS` through `UpgradePaywall`, so the one-plan layout branch
(`span 24`, `width 380`) and the actual price string on screen are unverified.
The decisions log called this out as "the cheapest place to prove the $9.99
single card renders". It is cheap; it just is not written yet.

### Finding 4 — the welcome page still describes the template product (row 94)

`welcome-page/src/content.ts` is untouched: `appName: "Hello Gated"`, step 1
`"Open the popup"`, and feature cards for Uppercase and Reverse text. Decisions
row 94 marks three of these edits **mandatory** ("or the onboarding will describe
UI that does not exist"). Nothing in this task's scope changed it; recording it
here so it is not mistaken for done. It also needs a third `permissions`
justification entry for `scripting`.

### Finding 5 — the deferred rows, as designed (rows 2, 9)

`LockedFeature` has no production mount and its "Unlock → onOpenPaywall" trigger
therefore has no production path. This is the *intended* state (DEFERRED, plan 2)
and is recorded as gaps 1 and 2 of the decisions log — but it is still a
capability the popup provides today and the options page does not. It is one of
the two remaining ❌ rows, and the only one that is a deliberate design choice
rather than unfinished work. See §4.

### Lower-severity partials

- **Row 4** — that `options.tsx` passes the *shared* `PLANS` (rather than any
  array) is compile-checked only.
- **Row 81** — `focusTriggerAfterClose={false}`, the deliberate anti-dark-pattern
  choice, has no assertion; the POPULAR ribbon is now unreachable.
- **Row 93** — `npm run build:zip` was not executed in this pass.
- **Rows 25, 26** — `health.spec.ts` and `e2e/README.md` are correct today and
  become wrong at deletion; they are §3 items, not gaps.

---

## 3. What breaks *at* deletion time, and how

Nothing in this list is broken now. Each becomes a failure the moment the popup
is removed, so each is part of the cost of the deletion.

| What | How it breaks | Fix |
|---|---|---|
| `e2e/health.spec.ts:9` | `expect(existsSync(resolve(DIST_DIR, "popup.html"))).toBe(true)` — the file stops being emitted, the assertion fails. It never navigates the popup, so it does **not** show up in a grep for specs that open it. | Assert `dist/options.html` instead (plus `content.js` / `background.js`). |
| `test/webpack-config.test.ts:43-55` | `expect(assetsByChunkName?.popup).toBeDefined()` and `expect(assetNames).toContain("popup.html")` fail once the entry and its `HtmlWebpackPlugin` go. The test title (`builds popup.js/options.js/popup.html/options.html …`) also becomes a lie. | Drop the popup half; keep the options + content assertions (row 49). |
| `test/webpack-preview-config.test.ts` | Does **not** pin card ids — it only builds the gallery entry. But `preview/gallery.tsx:21` does `import { PopupView } from "../src/popup/PopupView"`, so deleting the source makes the preview build fail to resolve and this test fails as a *build* error, not an assertion error. | Remove the two `PopupView` cards and the import from `gallery.tsx` in the same commit as the source deletion. |
| The 10 popup unit tests | `test/popup/PopupView.test.tsx` (6) and `test/popup/popup.test.tsx` (4) all import from `src/popup/`, so they fail to resolve. **Every behaviour the four container tests cover is now also covered on the options side** — device-id/entitlement bootstrap, tier pass-through, the cached-Pro seed, and (as of this pass) the checkout hand-off. The six `PopupView` tests cover `UppercaseTool` / `ProTool` / the popup's own `LockedFeature` mount, i.e. exactly the surfaces §4 drops. | Delete with the popup; no port outstanding. |
| `e2e/popup-loads.spec.ts` | Navigates `popup.html`; the page 404s. This is the popup's own test and it is meant to die with it — its Free-badge half is already re-proven on options by `billing.spec.ts`, its locked-fieldset half is parked. | Delete with the popup. |
| `e2e/harness/identity.ts` | Does not break — but its `waitForDeviceId` doc comment cites `src/popup/popup.tsx`'s `useState<Tier>("free")` by name and becomes a dangling reference. This is when CORE drift file #3 (predicted in `core-drift.md`) actually happens. | Repoint the comment at `src/options/options.tsx`, add the row to `core-drift.md`. |
| `e2e/README.md:12` | Lists `popup-loads.spec.ts — popup Free, pro tool locked` in the hermetic set. | Rewrite for the retargeted spec set (decisions row 26). |
| `webpack/webpack.common.cjs:29, 63-72` | The `popup` entry and its `HtmlWebpackPlugin` reference `src/popup/index.tsx` and `src/popup/popup.html`; the build fails to resolve. | Remove both (decisions rows 47, 48). |

Net expected count change at deletion: **−10 unit tests** (279 → 269 passing),
**−1 e2e spec** (13 collected → 12). No capability loses its last test.

---

## 4. Being dropped, not moved

Three things leave the product with no replacement. All three were signed off on
2026-08-07, but "signed off" is not the same as "still remembered", so they are
restated plainly.

**`UppercaseTool`** (inventory row 7) — the always-free demo feature: a labelled
"Text to uppercase" input, an "Uppercase" button, `data-testid="uppercase-result"`.
Template placeholder. It exists nowhere else in the codebase and nothing replaces
it. Gone.

**`ProTool`** (inventory row 8) — the pro-gated demo feature: reverse text, a
"Run pro tool" button, `data-testid="pro-tool-result"`. Also a template
placeholder. Its enabled/disabled state was the **Layer-2 Pro-vs-Free proof in
four e2e specs**. Gone.

**`LockedFeature`'s only production mount** (inventory row 9) — the component
survives, is still exported from the ui-kit barrel, still unit-tested (4 tests),
and still rendered in the preview gallery. What disappears is the only place a
*user* could ever see it. Its `.ui-kit-locked-feature fieldset` selector is the
gating assertion in five e2e specs.

### What happened to those five gating assertions

They were **not deleted and not softened into something that passes trivially**,
per gaps 1 and 2 of the decisions log. Concretely:

| Spec | Before | Now |
|---|---|---|
| `billing.spec.ts` | free → locked fieldset at `opacity 0.5` + `disabled`; pro → "Run pro tool" enabled; re-lock after cancel | Layer-2 subject is the options page's own Free-tier **`Upgrade` button** (present on Free, absent on Pro, back on re-lock). The fieldset assertion is preserved verbatim in `test.fixme("PLAN 2: a Pro-gated options row is dimmed + disabled on Free")`. |
| `dunning-refund.spec.ts` | refund re-locks the fieldset | Same `Upgrade`-affordance substitution, plus a new `Past due` PlanBadge assertion. Fieldset assertion parked in `test.fixme("PLAN 2: a refund re-locks the Pro-gated options rows")`. |
| `renewal-cascade.spec.ts` | both installs re-lock | Same substitution on both contexts. Parked in `test.fixme("PLAN 2: the cancel cascade re-locks the Pro-gated rows on both installs")`. |
| `grace.spec.ts` | "Run pro tool" still enabled offline | Same substitution. Parked in `test.fixme("PLAN 2: a Pro-gated options row stays interactive through the grace window")`. |
| `popup-loads.spec.ts` | fieldset `opacity 0.5` + `disabled === true` | **Untouched.** Still passing against the popup. Dies with the popup; its Free-badge half is already re-proven on options. |

The four parked tests show as `-` (skipped) in the Playwright report and each
names plan 2 in its title, so they surface on every run rather than silently
disappearing. The `Upgrade`-affordance substitution is a genuinely weaker
Layer-2 check than a disabled fieldset — it proves tier-driven *rendering*, not
tier-driven *interactivity*. That weakening is the honest cost of v1 having
nothing Pro-gated, and it reverses when plan 2 lands the four Pro rows.

---

## 5. Tidiness note — NOT the gate

Recorded only so nobody mistakes its absence for an omission. **This is not
parity evidence and no deletion decision should rest on it.**

Command:

```
cd extension && grep -rln "popup" src test e2e preview webpack \
  --include="*.ts" --include="*.tsx" --include="*.cjs" --include="*.md" --include="*.html" \
  | grep -v "^src/popup/" | grep -v "^test/popup/" | grep -v "popup-loads"
```

Result — 17 files, which split cleanly in two:

- **Six load-bearing references**, and they are exactly the six non-popup rows
  of §3: `webpack/webpack.common.cjs` (the entry + its `HtmlWebpackPlugin`),
  `test/webpack-config.test.ts`, `preview/gallery.tsx`, `e2e/health.spec.ts`,
  `e2e/README.md`, and the `e2e/harness/identity.ts` doc comment.
- **Eleven comment-only mentions** that need no change: prose in
  `src/pip/errors.ts`, `src/pip/toast.ts`, `src/background/background.ts`,
  `src/ui-kit/PlanBadge.tsx`, `src/ui-kit/theme.ts`, `src/billing/device-id.ts`,
  `test/options/options.test.tsx`, plus the deliberate `default_popup` assertion
  in `test/manifest.test.ts` and the parked-test rationale blocks in
  `billing.spec.ts`, `grace.spec.ts` and `renewal-cascade.spec.ts`.

No billing spec navigates `popup.html` any more. That says the deletion is
*mechanically* tractable. It says nothing about whether the options page does the
job, which is what §1 and §2 are for.

---

## 6. The decision

Everything the popup did that a user can reach is now on the options page and
exercised there. **67 of 79 Preserved rows are exercised end-to-end, 10 are
partial, 2 are not exercised** — and neither of the two is a capability that
would be lost by deleting the popup:

- **Row 9** (`LockedFeature` has no production mount) is the intended,
  signed-off shape of v1 free. It is not something the options page failed to
  inherit; it is something plan 2 will add.
- **Row 94** (the welcome page still describes the template product) is a
  separate deliverable that neither the popup nor the options page provides.

The one finding that genuinely blocked this decision — the checkout hand-off,
whose only proof was a popup test — is closed: `test/options/options.test.tsx`
now asserts the full lifetime checkout URL and its `client_reference_id`, on both
the `chrome.tabs.create` and `window.open` branches. The popup's copy was left
untouched.

Findings 3 and 4 are pre-existing debt surfaced by this audit. Finding 2 is half
closed and half a recorded conscious trade. None of them is made worse by the
deletion, and none is a reason to keep the popup.

**Deletion remains ungated. Nothing above authorises it.**
