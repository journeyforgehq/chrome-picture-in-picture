# Keep/drop decisions — scaffolded child → Picture in Picture v1

Every row of `inventory-picture-in-picture.md` appears here exactly once.

**Coverage:** 95 of 95 inventory rows decided. Preserved: 79 (of which **6 are
marked DEFERRED** to the paid-tier plan). Dropped: 14. Undecided: 2.
`79 + 14 + 2 = 95` — no inventory row is missing, and none appears twice.

The spec asked for two tables. There are three: rows 46 and 67 could not be
honestly forced into either, so they sit in a third **Undecided** table rather
than being guessed at. The "appears exactly once" invariant still holds across
the document. Deferred is a *subset* of Preserved, not a fourth bucket — those
rows keep their code, they just do not get new work in this plan.

Notation:
- **untouched** — the code does not change at all.
- **amended** — the capability survives, but a literal (path, string, array) changes.
- **DEFERRED** — preserved in the tree, no new work here, scoped to the paid-tier plan.
- **⬜ REQUIRED** — a human must sign off before this drop is executed.

---

## Preserved (moved, not lost)

| Inv # | Capability | Where it lives now |
|---|---|---|
| 1 | Tier badge (Free/Pro `TierBadge`) | Options page, "Your plan" row. **NEW WORK:** `OptionsView.tsx` mounts `PlanBadge` but **not** `TierBadge` today — preserving this means *adding* it, not retargeting it. Every e2e Free/Pro badge assertion (7 specs) depends on that mount existing. |
| 2 | Paywall trigger (locked feature's "Unlock" → `onOpenPaywall`) | **DEFERRED.** The surviving trigger is the options "Upgrade" button (row 75). The LockedFeature-Unlock variant returns when the paid tier adds Pro rows. |
| 3 | Checkout hand-off (`checkoutUrl` → `chrome.tabs.create`, `window.open` fallback) | `src/options/options.tsx:73-80` — already byte-equivalent, incl. the fallback. The `client_reference_id=device-abc-123` assertion must move from `test/popup/popup.test.tsx` to `test/options/options.test.tsx`. |
| 4 | `UpgradePaywall` mounted with the shared `PLANS` array | **DEFERRED.** The options mount (row 75) becomes the sole production mount; the redundant popup mount goes. Component untouched. |
| 5 | `PaymentNudge` (`past_due` alert + "Update payment method") | `src/options/OptionsView.tsx:63` — already there. **COVERAGE RISK:** `e2e/dunning-refund.spec.ts:60-61` asserts it *on the popup page*; that assertion must retarget to `options.html` or `PaymentNudge` loses its only e2e coverage. |
| 9 | `LockedFeature` production mount | **DEFERRED with a recorded gap** — see "Recorded gaps" below. Component, tests and preview-gallery states (row 84) all stay; only the production mount waits for the paid tier. |
| 10 | Device-id bootstrap on mount (`getDeviceId` → `chrome.storage.local.device_id`) | `src/options/options.tsx:21-23`, identical code. `waitForDeviceId` must be called after navigating `options.html` in the 6 specs that use it. |
| 11 | Entitlement lifecycle (create → cached seed → refresh → re-read, `cancelled` guard) | `src/options/options.tsx:21-59`, identical code. |
| 12 | Cached-tier seed / "no Free flash" | `src/options/options.tsx:38-45` is already byte-equivalent. **The regression test must move too** — today only `test/popup/popup.test.tsx` covers it; options has the code and no test. |
| 13 | `ThemeProvider accent={config.ACCENT}` wrapping the page root | `src/options/options.tsx` already wraps `OptionsView`. |
| 18 | `e2e/popup-loads.spec.ts` (Free badge + locked fieldset) | Retargeted to `options.html`. The Free-badge half survives (needs row 1's new mount); the locked-fieldset half is part of the gating gap. |
| 19 | `e2e/identity.spec.ts` (fresh install → UUID + cached `free`) | Retargeted to `options.html`; assertions unchanged. |
| 20 | `e2e/billing.spec.ts` (full money loop, `popup-free/pro.png`, options at 375px) | Retargeted to `options.html`. Screenshot names should follow. **CORE-vendored — see row 67.** |
| 21 | `e2e/grace.spec.ts` (7-day offline grace, `grace-pro.png`) | Retargeted to `options.html`; abort/reload logic unchanged. |
| 22 | `e2e/dunning-refund.spec.ts` (past_due keeps Pro + nudge, redelivery, refund re-locks) | Retargeted to `options.html`. Carries row 5's nudge assertion; its ProTool re-lock assertion needs row 8's replacement subject. |
| 23 | `e2e/renewal-cascade.spec.ts` (two independent installs) | Retargeted to `options.html` on both contexts. |
| 24 | `e2e/restore.spec.ts` (device A + device B) | Device B already uses `options.html`; device A retargets to it, which actually *simplifies* the spec to one page. |
| 25 | `e2e/health.spec.ts` asserting a built HTML artifact on disk | Amended: assert `dist/options.html` (plus `content.js` / `background.js`) instead of `dist/popup.html`, which is no longer emitted. |
| 26 | `e2e/README.md` hermetic spec list | Amended: the "popup Free, pro tool locked" line is rewritten for the retargeted spec set. |
| 27 | `harness/identity.ts` contract ("must be called on an extension page") + the race doc-comment citing `src/popup/popup.tsx` | Contract untouched (options.html always satisfied it); the doc comment is amended to cite `src/options/options.tsx`'s `useState<Tier>("free")`. **CORE-vendored — see row 67.** |
| 28 | `readDeviceId` / `waitForDeviceId` / `readCachedTier` storage readers | Untouched — they read `chrome.storage.local`, which is page-agnostic. |
| 29 | Per-test fresh persistent context, extension id from the SW URL | Untouched. |
| 30 | Signed Stripe webhook forgery harness | Untouched. |
| 31 | `globalSetup` build + wiped `wrangler dev` / staging probe | Untouched. |
| 32 | `playwright.config.ts` auto-collection of `e2e/**/*.spec.ts` | Untouched — new PiP specs are picked up for free. |
| 33 | Content-script presence marker, idempotent across repeat calls | **Preserved in spirit** → a `window.__pipInjected` idempotency guard in the injected PiP script. Same job (don't double-apply), correct scope (the injection is now real, so idempotency is load-bearing rather than decorative). |
| 35 | `typeof document !== "undefined"` runtime-entry guard | Preserved verbatim in the injected script so it stays importable under vitest/happy-dom. |
| 36 | Separation guard's declared subject (content must NEVER import antd / `@ant-design/*` / `ui-kit/`) | Preserved **and now load-bearing**: the PiP entry code and its "no video found" toast run in the page and must stay antd-free. The header comment moves with the code. |
| 37 | MV3, name/description/version; name literal pinned as the scaffold token | Untouched. `description` may be rewritten for the CWS listing; the `name` literal assertion in `test/manifest.test.ts:41-43` stays as-is. |
| 38 | `permissions` asserted with exact `toEqual` | Amended to `["storage","activeTab","scripting"]` — `chrome.scripting` is required for click-time injection under either mechanism. The **exact-match style is preserved**: the test still fails on any un-decided permission. Note `scripting` adds no user-facing install warning. |
| 39 | `activeTab` declared with no consumer | Preserved **and finally consumed**: the toolbar-click path grants host access at click time and injects via `chrome.scripting`. The dead-declaration oddity ends. |
| 40 | Background service worker declaration (`toEqual`) | Untouched. |
| 43 | `action` block asserted with `toEqual` | Amended: `default_icon` survives, `default_popup` is removed (its removal is what makes `onClicked` fire). The `toEqual` assertion is preserved against the new shape. The user-visible half of this is covered by the row 15 sign-off. |
| 45 | `options_page` + top-level `icons` triple | Untouched — `options.html` becomes the extension's only page. |
| 47 | Webpack entries | Amended: `background`, `content`, `options`. The `popup` entry is removed. |
| 49 | `test/webpack-config.test.ts` chunk/asset assertions | Amended: asserts the `options` chunk + `options.html`, plus the `content` chunk (which the separation guard needs to exist — see row 59). Popup assertions removed. |
| 50 | `CopyPlugin` of `src/static` | Untouched. |
| 51 | `DefinePlugin`'s 8 public build vars | Untouched. `STRIPE_MONTHLY_URL` / `STRIPE_ANNUAL_URL` stay *defined but empty* rather than being deleted — that keeps `test/config.test.ts` and `test/webpack-config.test.ts:70-98` green and lets the paid-tier plan re-add plans without a build-config change. |
| 52 | `APP_ENV` env-file layering | Untouched. |
| 53 | `webpack.prod.cjs` pinning `DEV_PRO=false` + `bail`; dev source maps | Untouched. |
| 54 | `splitChunks: false` + `output.clean` | Untouched — and now more load-bearing, since it is what makes the per-chunk guard on the real PiP content code meaningful. |
| 55 | `webpack.preview.cjs` dev-only gallery build | Untouched — it stays the antd-safe home for ui-kit visual verification. |
| 56 | Separation-guard rule (content chunk only; antd / `@ant-design` / `ui-kit`) | Untouched **and now load-bearing** (see row 36). |
| 57 | Real module-graph walk (catches transitive leaks) | Untouched. |
| 58 | Reports paths, pushes to `compilation.errors`, throws from `afterEmit` | Untouched. |
| 59 | Silent no-op when no chunk is named `content` | Preserved unchanged — the `content` entry survives, so the guard stays armed. Recorded as a known silent-failure mode that is now higher-stakes; row 49's chunk assertion is the compensating control. |
| 60 | Two-sided guard coverage (real build clean + fixture must fail) | Untouched. |
| 62 | `PLANS` as the single source | Amended: still the single source, now with a single importer (`src/options/options.tsx`). |
| 64 | Plan id → `config.STRIPE_LINKS[id]`, `checkoutUrl` appends `client_reference_id` | Untouched. Only the `lifetime` key is exercised; the map keeps all three. |
| 65 | `UpgradePaywall` layout driven by `plans.length` (span 24 / width 380 at one plan) | **DEFERRED.** Untouched code; the one-plan branch becomes the only reachable branch. Its unit test is the cheapest place to prove the $9.99 single card renders. |
| 66 | Preflight fails if both `STRIPE_ANNUAL_URL` and `STRIPE_LIFETIME_URL` are empty | Untouched — verified against `scripts/preflight.mjs:18-20`: `STRIPE_LIFETIME_URL` alone satisfies it, so lifetime-only passes the rule as written. |
| 68 | Backend derives the plan label from Stripe checkout **mode** | Untouched. A lifetime payment-link runs in `payment` mode → `"lifetime"` with `periodEnd: null`, which is exactly right. The `subscription → "annual"` branch goes dormant but stays, so the paid tier can re-add a subscription without a backend change. |
| 69 | "… — Settings" heading + `/Settings/` e2e assertion | Amended to "Picture in Picture — Settings". The `/Settings/` regex in `e2e/billing.spec.ts:72-76` still matches, so that assertion survives untouched. |
| 70 | Restore form (Email input + submit, `required` + `type: email`) | Untouched — already on options. |
| 71 | Restore status messages, all four branches, each `role="alert"` | Untouched. |
| 72 | Restore container wiring (`restore(email)`, `restoring` state, tier update) | Untouched. |
| 73 | `PaymentNudge` rendered above the plan badge | Untouched — this is the landing site for row 5. |
| 74 | `PlanBadge` (plan tag + status tag, "No plan" fallback) | Untouched. With lifetime-only, the "Monthly"/"Annual" label branches go dormant; `test/ui-kit/PlanBadge.test.tsx` keeps covering them for the paid tier. |
| 75 | Options "Upgrade" button + `UpgradePaywall` mount | **DEFERRED.** Code stays exactly as-is — deleting it would strand row 3's preserved checkout hand-off with no way to reach it. What is deferred is the *purchase experience*: $9.99 pricing copy, the Pro rows it gates, and its e2e money-loop coverage. |
| 76 | Options checkout hand-off (`chrome.tabs.create` + `window.open` fallback) | Untouched — this is the landing site for row 3. |
| 77 | Options entitlement lifecycle; `restore.spec.ts` device-B bootstrap | Untouched, and now the *only* entitlement lifecycle in the extension. |
| 78 | 480px bordered card, centred, responsive at 375px (`options-mobile.png`) | Untouched — the mobile screenshot check stays valid. |
| 79 | `optionsview-free` / `optionsview-restore-404` gallery cards | Untouched. |
| 80 | `options.html` shell + "options root element missing" throw | Amended: `<title>` becomes "Picture in Picture — Settings". The throw is untouched. |
| 81 | `UpgradePaywall` behaviours (`destroyOnClose`, `focusTriggerAfterClose={false}`, POPULAR ribbon, `ctaLabel`, reserved description/priceNote rows) | **DEFERRED**, untouched. `focusTriggerAfterClose={false}` stays a deliberate anti-dark-pattern choice. The POPULAR ribbon goes dormant (no plan sets `highlight` at one plan). |
| 82 | `ThemeProvider` / `buildTheme(accent)` | Untouched — for extension **pages** only. The PiP toast must not use it (row 36). |
| 83 | ui-kit barrel + export-surface test | Untouched. All seven components stay exported, including `LockedFeature`, whose production mount is deferred. |
| 84 | Preview gallery renders every ui-kit component in every state | Untouched — and now the *only* place `LockedFeature` renders. This is what keeps the deferred component from rotting. |
| 85 | `handleInstalled` opens `WELCOME_URL` once, install-only, if configured | Untouched. |
| 86 | `uninstallUrl` with `?v=<version>`; null on empty/malformed; re-set each SW startup; version-only privacy rule | Untouched. The privacy rule (never the deviceId) is explicitly reaffirmed. |
| 87 | `handleMessage` runtime-message relay stub | Untouched — and it is the designated place for the PiP flow's first real message type (e.g. injected script reporting "no video found" back for a toast), if the design needs one. |
| 88 | Device id (`crypto.randomUUID` → sync + local mirror) | Untouched. |
| 89 | Entitlement client (`/me`, cache, 7-day grace, `restore`, `clear`, `devPro`) | Untouched. |
| 90 | `src/contract.ts` byte-identical to the backend's | Untouched. |
| 91 | `package.json` scripts pinned by `test/scripts.test.ts` | Untouched. |
| 92 | `gen-icons.mjs` + PNG signature/IHDR test | Untouched. The icon *artwork* should become PiP art before shipping; the test only checks the signature and dimensions, so new art passes without a test change — meaning nothing will fail if the art is forgotten. |
| 93 | `build:zip` packaging `dist/` contents | Untouched. |
| 94 | Welcome-page shipped copy | Preserved as structure, **copy replaced** with this product's. Three specific edits are mandatory or the onboarding will describe UI that does not exist: (a) `appName` "Hello Gated" → "Picture in Picture"; (b) the "Open the popup" step → "Click the toolbar icon — the video pops out immediately"; (c) the Uppercase/Reverse feature cards → the PiP feature. Also: if row 38 adds `scripting`, the `permissions` justification list needs a third entry. |
| 95 | `pro.restoreHref` `REPLACE_WITH_EXTENSION_ID` placeholder | Preserved as a **live, unresolved gap**. It cannot be filled until the extension has a real CWS id. `scripts/preflight.mjs:13-15` still refuses to pass while it is unfilled — that guard is deliberately kept, not silenced. |

---

## Intentionally dropped

| Inv # | Capability | Reason | Observable? | Sign-off |
|---|---|---|---|---|
| 15 | `popup.html` shell (`#root`, `index.tsx`, "popup root element missing" throw) — **i.e. the popup surface itself** | The toolbar button *is* the feature. A popup inserts a click between the user and the one job they installed the extension for. | **YES** | ⬜ REQUIRED |
| 7 | `UppercaseTool` — the always-free demo feature | Template placeholder, not this product. Exists nowhere else in the codebase. | **YES** | ⬜ REQUIRED |
| 8 | `ProTool` — the pro-gated demo feature | Template placeholder, not this product. **Note:** its enabled/disabled state is the Layer-2 Pro assertion in 4 e2e specs; those need a replacement subject or they weaken silently (see "Recorded gaps"). | **YES** | ⬜ REQUIRED |
| 44 | The *absence* of a `chrome.action.onClicked` listener (toolbar click handled entirely by `default_popup`) | This absence is deliberately ended — adding the listener is the entire product. Same underlying decision as row 15. | **YES** | ⬜ REQUIRED (shares row 15's sign-off) |
| 61 | Three-tier ladder: `monthly` $3.99/mo, `annual` $29/yr (highlighted), `lifetime` $79 once | Monthly and annual are dropped outright; lifetime is repriced $79 → $9.99. Two purchasable plans a user could have bought disappear, and the surviving price changes. | **YES** | ⬜ REQUIRED |
| 6 | `PopupViewProps.plan` — a prop passed by the container and never rendered | Dead prop. Dies with the popup; `OptionsView` renders `plan` properly via `PlanBadge` (row 74). | NO | — |
| 14 | Fixed 360px MV3-natural popup width with 16px padding | A layout property of a surface being removed. Nothing to see once row 15 is signed off. | NO | — |
| 16 | Heading text "Reference Extension" in the popup title row | Placeholder copy on a removed surface. | NO | — |
| 17 | `popupview-free` / `popupview-pro` preview-gallery cards | Dev-only gallery, never shipped to users. `test/webpack-preview-config.test.ts` does not pin card ids, so removing them breaks nothing. | NO | — |
| 34 | The `data-picture-in-picture-present` slug-token literal, asserted in `test/content.test.ts:14-16` | The attribute is superseded by the `window.__pipInjected` guard (row 33), which carries no slug token. The scaffold-rename check this test really performs survives via row 37's `manifest.name` assertion, so the protection is not lost — only this instance of it. | NO | — |
| 41 | Static `content_scripts` manifest block | Replaced by dynamic click-time injection so the install prompt stays minimal — nothing runs on any page until the user clicks. | NO | — |
| 42 | `matches` pinned as `["https://example.com/*"]` and asserted not to contain `<all_urls>` | Goes with row 41. **The minimal-prompt guarantee must not die with it** — replace with an assertion that the manifest declares no `host_permissions` and no `<all_urls>` anywhere. That replacement is contingent on row 46. | NO | — |
| 48 | `HtmlWebpackPlugin` instance for the popup | Build plumbing for a removed entry; the options instance survives unchanged. | NO | — |
| 63 | `plans.test.ts` non-domination ladder rules | Confirmed by reading `test/plans.test.ts`: all three ladder rules are guarded by `if (annual && lifetime)` / `if (annual && monthly)` / `highlighted?.id === "annual"`, so a single-plan array satisfies every one of them **vacuously**. The test would pass on an empty ladder and provides zero protection at one plan. Replaced by an assertion that `PLANS` has exactly one entry with id `lifetime`. | NO | — |

---

## ⬜ Undecided — needs a human

These two could not be resolved from the code. Guessing either would be worse
than flagging it.

| Inv # | Capability | The open question |
|---|---|---|
| 46 | No `host_permissions` at all (cross-origin `/me` works only via the worker's `Access-Control-Allow-Origin: *`) | **Whether this survives depends on which "dynamic registration" mechanism is meant, and the two differ exactly on the install prompt.** `chrome.action.onClicked` + `chrome.scripting.executeScript` runs under `activeTab` with **zero** `host_permissions` — the prompt stays minimal, which is what the known decision wants. But `chrome.scripting.registerContentScripts` **requires** `host_permissions` matching its `matches`, which reintroduces the "Read and change all your data on websites you visit" warning the decision was trying to avoid. The known decision names "dynamic registration" without saying which. Rows 38 and 42 both hang off this answer. |
| 67 | CORE-vendored files with recorded SHA256s in `.factory.json`; local edits are reported as drift and refused by `sync-core` without `--force` | **This plan cannot avoid editing at least three CORE-vendored files:** `extension/src/billing/plans.ts` (lifetime-only, $9.99), `extension/e2e/billing.spec.ts` (`popup.html` → `options.html`), and `extension/e2e/harness/identity.ts` (the doc comment citing `src/popup/popup.tsx`). All three are in the `.factory.json` `core` map — verified. Accept permanent recorded drift, re-baseline the SHAs, or fork these files locally? This is a policy call about the factory relationship, not a code call. |

---

## Recorded gaps (preserved-but-uncovered)

Not drops — things that keep existing while their only proof of life goes away.
Listed so they cannot be lost quietly between now and the paid-tier plan.

1. **Feature gating has no production mount.** `LockedFeature` (row 9) is
   mounted in production **only** by the popup. Its `.ui-kit-locked-feature
   fieldset` selector is the gating assertion in **five** e2e specs
   (`popup-loads`, `billing`, `dunning-refund`, `renewal-cascade`, plus the
   opacity/disabled check in `popup-loads`). Once the popup goes, those five
   assertions have nothing to point at until the paid-tier plan adds Pro rows.
   **Do not let them quietly weaken into something that passes trivially** — if
   there is no subject, the honest move is to skip them with an explicit
   `test.fixme` naming the paid-tier plan, not to delete or soften them.
   `preview/gallery.tsx` (row 84) remains the component's only live rendering.

2. **The Layer-2 Pro assertion loses its subject.** `ProTool`'s enabled/disabled
   state (row 8) is the Pro-vs-Free proof in 4 e2e specs. Same treatment as
   gap 1 — v1 free has nothing Pro-gated to assert on.

3. **`PaymentNudge` loses its only e2e coverage if row 5's retarget is skipped.**
   `e2e/dunning-refund.spec.ts:60-61` is its sole e2e exercise, and it runs on
   the popup page.

4. **The "no Free flash" regression test is popup-only.** `options.tsx` has the
   byte-equivalent seed code and **no test** (row 12). Moving the test is not
   optional bookkeeping — without it, the behaviour ships untested.

5. **Row 1 is new work, not a move.** `TierBadge` is not mounted in
   `OptionsView` today. Seven e2e specs assert a Free/Pro badge; all of them
   need that mount to exist before they can retarget.

6. **Row 95 stays red.** The preflight will keep failing on
   `REPLACE_WITH_EXTENSION_ID` until the extension has a real CWS id. That is
   correct behaviour and must not be worked around.

---

## Deletion is not authorised by this document

This is a decision record. Per the plan, deletion of the popup, the demo tools,
and the dropped plans happens 16 tasks from now, gated on a parity check against
this file — never on "it compiles". Nothing above should be removed until the
five ⬜ REQUIRED sign-offs are granted and the two ⬜ UNDECIDED rows are answered.

---

## Sign-off — 2026-08-07

Asked of the product owner against the code about to be deleted, not against the
design document that originally decided them. Verbatim answers.

### Observable drops — ✅ "Confirm all five"

| Inv # | Capability | Status |
|---|---|---|
| 15 | `popup.html` shell — the popup surface itself | ✅ SIGNED OFF |
| 7 | `UppercaseTool` demo feature | ✅ SIGNED OFF |
| 8 | `ProTool` demo feature | ✅ SIGNED OFF |
| 44 | Absence of `chrome.action.onClicked` — the toolbar click becomes the feature | ✅ SIGNED OFF |
| 61 | Three-tier ladder → lifetime only, repriced $79 → $9.99 | ✅ SIGNED OFF |

### #46 — resolved, not a human question

**No `host_permissions` at all is correct and compatible with dynamic registration.**
The concern was that `registerContentScripts` needs declared `host_permissions`,
which would reintroduce the broad install warning. It needs **granted** host
permission, not **declared** — and `optional_host_permissions: ["<all_urls>"]`
granted at runtime through `chrome.permissions.request()` satisfies it. That is
precisely the mechanism §2.8 and R-03 specify, and S-05 measured registration
succeeding against a granted origin. The install prompt stays minimal because
nothing broad is declared at install time.

Row 42's guarantee is rescued as specified: the test asserting the extension does
not request `<all_urls>` is replaced by the R-04 allowlist guard, which asserts
`host_permissions` is exactly `[]` and `permissions` is exactly
`['storage','activeTab','scripting']`.

### #67 — CORE drift: ✅ "Accept and record the drift"

Three files drift deliberately. `docs/superpowers/plans/core-drift.md` records each
with its reason, so a future `sync-core` refusal is a documented decision rather
than an archaeology problem:

| File | Why it drifts |
|---|---|
| `extension/src/billing/plans.ts` | Per-child pricing — lifetime-only at $9.99. Arguably what this file is for |
| `extension/e2e/billing.spec.ts` | Repointed from `popup.html` to `options.html`; follows from removing the popup |
| `extension/e2e/harness/identity.ts` | Doc comment cites `src/popup/popup.tsx`, which no longer exists |

### The Upgrade button — ✅ "Keep it wired"

The options page keeps the factory's Upgrade button and `UpgradePaywall` mount
through plan 1. Rationale: **plan 1 / plan 2 is an implementation split, not a
release split** — `00-summary.md` records that v1 launches *with* Pro. Stripping
the purchase path would strand the preserved checkout hand-off and leave six
billing e2e specs exercising something no user can reach. Plan 2 fills in the Pro
rows behind it.

This supersedes the "UpgradePaywall DEFERRED" reading in the table above: the
*mount* is preserved and live; only the *Pro rows it gates* are deferred.
