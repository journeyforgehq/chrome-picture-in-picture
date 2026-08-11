# Parity evidence — Picture in Picture v1 → Pro tier

> ## ✅ DELETION PERFORMED — 2026-08-11
>
> Three assertions were removed from `extension/test/pip/entry.test.ts`:
> `"contains no await before the requestPictureInPicture call"`,
> `"is not an async function"`, and `"contains no await anywhere in its body,
> not merely before the PiP call"`. Nothing else was deleted anywhere in this
> plan. §2 records the replacement that had to land first, and the mutation
> evidence that it is not vacuous.

One row per item in `decisions-pro-tier.md` — **34 rows**, matching that
document's own coverage line (34 of 34 inventoried: 31 Preserved, 3
Intentionally dropped). For each Preserved row: the test that **exercises the
capability through the code path that exists today**, not the test that existed
when the decision was written.

**The gate is *exercised*, not *compiles*.** `grep` finding no dangling
references is not parity and appears nowhere below. `npx tsc --noEmit` passing
is not parity either — it is listed under §4 as a separate check, because a
union type can be type-correct and unreachable at the same time.

**Two rows were re-derived rather than ticked**: row 18 (§3) and the three
dropped guard tests (§2). Both are written up at length because both were
flagged by `decisions-pro-tier.md` as things this audit must not skim.

---

## How the evidence was produced

Every command was run on 2026-08-11 from
`/Users/oleksiiostapiuk/projects/chrome/picture-in-picture/extension`, branch
`feat/v2-pro`, and its output is pasted verbatim in §4.

| Handle | Command | Result |
|---|---|---|
| **C1** | `npm test` | `Test Files  57 passed (57)` / `Tests  469 passed (469)` |
| **C2** | `npx playwright test --config playwright.fixtures.config.ts` | `77 passed` |
| **C3** | `npm run e2e:visual` | `8 passed` |
| **C4** | `npm run e2e:granted` | `12 passed` |
| **C5** | `npm run e2e` | `12 passed` (0 skipped) |
| **C6** | `npx tsc --noEmit` && `npm run e2e:typecheck` | both exit 0, no output |
| **C7** | `npm run build` + grep of `dist/content.js` | compiled; no `storage.session` / `activePip` / `setAccessLevel` |
| **C8** | mutation matrix, §2.2 | 10 mutations, 10 red on the predicted assertion |

Baseline before this task: `npm test` 55 files / 457 tests. 457 − 3 deleted
+ 15 added = **469**, and 55 + 2 new files = **57**. The count moved *up*; no
test file was lost.

---

## §1 — `src/pip/entry.ts` (rows 1–20)

All 20 **Preserved**. `entry.test.ts` and `entry-dpip.test.ts` both drive the
real `pipEntry`, so every row below is exercised through the Pro-branch code
path, not a pre-Pro copy of it.

| # | Capability | Verified through | Evidence |
|---|---|---|---|
| 1 | Frame arbitration via `window.__pipCoord`, top-frame default | `entry.test.ts` → "acts when `__pipCoord` is absent and this is the top frame", "stands down when `__pipCoord` says another frame won", "acts when `__pipCoord` says this frame won" | C1; also C4 `arbitration.spec.ts` in a real multi-frame page |
| 2 | Second click exits PiP (`PIP_EXITED`), rejection on an already-gone window swallowed | `entry.test.ts` → "pipEntry — a rejected requestPictureInPicture must be REPORTED" block; `action.test.ts` consumes `PIP_EXITED` | C1; C5 `gesture.spec.ts` exercises the real exit |
| 3 | `pictureInPictureEnabled` guard emits `pip-unavailable` before any API call | `entry.test.ts` → "reports pip-unavailable when the browser has PiP switched off"; `pip/errors.test.ts` | C1; C2 `detection.spec.ts` + `e2e/fixtures/d03-permissions-policy.html` |
| 4 | Shadow-root-descending collection; closed roots / `querySelectorAll` failures degrade to empty, never throw | `entry.test.ts` → "finds a video nested two open shadow roots deep" | C1; C2 |
| 5 | `disablePictureInPicture` (property or attribute) → `sawDisabled` | `entry.test.ts` → "reports pip-disabled-by-site rather than none-found" | C1; C2 |
| 6 | `readyState < 2` → `sawNotReady` | `entry.test.ts` → "reports not-ready when readyState < 2" | C1; C2 `d05-no-src.html`, `b07-duration-nan.html` |
| 7 | Zero-dimension / <100px rect / `display:none` / `visibility:hidden` / opacity ≤0.1 filters | `entry.test.ts` → "includes a video at exactly 100x100 and excludes 99x99" | C1; C2 `c01-display-none.html` |
| 8 | `duration > 5` filter, `Infinity` live-stream exemption | `entry.test.ts` → "keeps a live stream — duration Infinity must survive the >5s filter", "drops a 3s muted hero loop and reports none-found" | C1; C2 |
| 9 | Scoring terms (playing +1000, unmuted +200, intersection ×500, area ×300 capped) | `entry.test.ts` → "lets a small PLAYING video beat a large PAUSED one", "prefers unmuted content over a large muted 10s advert" | C1; C2 |
| 10 | R-14 term 1 — muted clip under 65s, −400 | `entry.test.ts` → the parameterised "penalises a muted {15,30,60}s pre-roll", "applies the penalty at 64s and not at 65s", "leaves an UNMUTED short clip alone", "ACCEPTED COST: a genuine 45s muted clip is demoted too" | C1; C2 |
| 11 | R-14 term 2 — page-aware advert penalty, −500, `isFinite` guard | `entry.test.ts` → "THE E08 CASE", "fires at exactly 4x and not a hair under", "Infinity accuses but is never accused", "two live streams do not accuse each other", "NaN and 0 durations never reach the term", "the accuser must itself be PLAYING", "THE CEILING: 400 + 500 < 1000" | C1; C2 `e08-unmuted-ad-same-slot.html` |
| 12 | Tie-break: score, then area, then DOM order | `entry.test.ts` → "breaks ties by DOM order, deterministically", "returns every surviving candidate, highest score first" | C1 |
| 13 | `dryRun` returns synchronously, pinned by the `dryRun: true` overload | **Re-pinned as the decision promised.** `entry.test.ts` → "returns a plain object rather than a thenable" and "keeps the dryRun path synchronous and non-thenable" (behavioural); **new** `entry-invariant.test.ts` → "returns from the dryRun branch above the first PiP call" (positional — the property the overload alone cannot state) | C1; mutation M3 §2.2 |
| 14 | Both failure shapes (sync throw + async rejection) → one `THREW` result, matched by `err.name` | `entry.test.ts` → "reports a SecurityError rejection as THREW", "reports a NotAllowedError rejection as THREW", "still reports a SYNCHRONOUS throw as THREW, with the same shape", "still reports PIP_OK when the promise resolves" | C1; C5 `gesture.spec.ts` measures the real gesture-less rejection |
| 15 | Frame/`isTop` determination before arbitration | `entry.test.ts` → "pipEntry — frame arbitration" block (all four read `frame` off the result) | C1; C4 |
| 16 | No-candidates reason priority (`sawDisabled` before `sawNotReady`) | `entry.test.ts` → "reports pip-disabled-by-site rather than none-found" (a page carrying both signals) | C1 |
| 17 | Candidate `label` derivation (`dataset.label \|\| id \|\| "video-" + i`) | `entry.test.ts` → every scoring test asserts on `winner.label`, which is that derivation's output | C1 |
| 18 | `PipEntryReason` exactly 5, `outcome` exactly 3, checked against every return site | **Re-derived — see §3.** Finding: **holds.** The Pro branch added *fields* (`mode`, `fellBackFrom`), not union members. | C1, C6; §3 |
| 19 | Public type contract is the shape `content.ts` and `background/action.ts` consume | `content.test.ts` and `background/action.test.ts` both consume real `PipEntryResult` values, including the two new fields; `action.test.ts` keys the fallback toast on `outcome === "PIP_OK" && fellBackFrom === "document"` | C1; C5 `action-click.spec.ts`, `dpip-fallback.spec.ts` |
| 20 | Rule 1, whole-body self-containment | `entry.test.ts` → "references no identifier outside its own body" (rebuilds the function in a bare scope — the runtime check); **new** `entry-invariant.test.ts` → "references none of the outside helpers it deliberately inlines" (the specific temptation: `decideMode(`, `sizeForOrigin(`, `normalizeSize(`, `SIZE_PRESETS`) | C1; mutation M4 §2.2 |

### Rows 19–20 in practice — the inlined copies are now pinned

Row 20 forced the routing decision and the size clamp to be written twice —
once in `router.ts`/`geometry.ts` as the tested source of truth, once inlined
in `entry.ts` as what actually runs. `entry.ts`'s own comments promised a later
task would pin them together. **`test/pip/inline-parity.test.ts` is that
promise paid**, and it *executes* both copies rather than pattern-matching
them:

| Pinned | Assertion | Mutation |
|---|---|---|
| `SIZE_PRESETS` | "agrees on all three presets, key for key" + "still has the three the options dropdown offers" | **M5** — `small` changed to 321×180 in `entry.ts` only → 2 red |
| `normalizeSize` bounds | "uses the same floor and ceiling on both axes" (bounds read off `entry.ts`'s call site, floor/ceiling read off `normalizeSize`'s *behaviour* — neither retyped) | **M5b** — inline floor changed 240→200 → 2 red |
| `normalizeSize` behaviour | "produces the same size as normalizeSize for every stored-record shape" — 12 inputs incl. `NaN`, `±Infinity`, 0, negatives, fractional, over-ceiling | **M5b** |
| `decideMode` | "agrees on the WHOLE truth table — all 8 combinations" of tier × enhancedWindow × documentPipSupported, plus a length check so a subset cannot masquerade as the table | **M5c** — the `enhancedWindow` guard deleted from the inline copy → 1 red at `tier=pro enhanced=false dpip=true` |

One divergence is recorded as deliberate rather than left unaudited: the
inlined `routeTo` also accepts `null` prefs (the cold path can hand it
nothing), which `decideMode`'s `RouteInput` cannot express. Pinned by
"routes a null prefs bundle to native — the case decideMode cannot express".

---

## §2 — the guard tests (`test/pip/entry.test.ts`)

### §2.1 The three dropped tests, and what replaced them

| Dropped | Replaced by | Status |
|---|---|---|
| "contains no await before the requestPictureInPicture call" | `entry-invariant.test.ts` → **"contains no await above the first PiP call"** — same property, but `firstCall` is `min(requestPictureInPicture(), requestWindow()` , so the *enhanced* window's entry point is covered too. The old one measured only the free path's call. | ✅ landed, mutation-checked (M2) |
| "is not an async function" | `entry-invariant.test.ts` → **"declares pipEntry — and every helper in the file — without `async`"** — the same two runtime checks (`constructor.name`, `Object.prototype.toString`) **plus** a file-wide source check. The retired version could not see an `async` helper declared *inside* the body; this one can. | ✅ landed, mutation-checked (M1async) |
| "contains no await anywhere in its body, not merely before the PiP call" | `entry-invariant.test.ts` → **"contains no await anywhere either, because source order is not execution order"** | ✅ landed, mutation-checked (M1async) |

Plus three assertions with **no predecessor at all**:

- **"still contains a PiP call to measure against"** — without it, deleting or
  renaming the call makes `firstCall` `MAX_SAFE_INTEGER` and every positional
  assertion passes vacuously. Mutation M7.
- **"contains no .then chain above the first PiP call"** — a `.then` above the
  call means the path to it runs in a microtask rather than the click's own
  turn. Mutation M6.
- **"returns from the dryRun branch above the first PiP call"** — row 13's
  positional half. Mutation M3.

And a meta-guard the retired trio had no need for, but this file cannot do
without: **the comment stripper**. `entry.ts`'s prose says `await` and
`requestPictureInPicture()` repeatedly, and the *first* such mention is in the
header block above all code. Measured against the raw text, `firstCall` lands
at byte 1179 — inside a comment on line 21 — and the file becomes decorative.
Two tests pin the stripper, and disabling it turns **7 of 9** assertions red
(§2.2, M9).

#### One honest correction to the decision record

`decisions-pro-tier.md` justified dropping the trio partly on the grounds that
"the Pro path deliberately makes part of `pipEntry`'s control flow suspend
(after `requestWindow()` resolves), **which this test forbids outright**". That
is not accurate as built: the Pro path suspends via **`.then`**, not via
`await`, and `pipEntry` is still not an `async` function. **All three retired
tests still pass against today's `entry.ts`** — they were not blocking the
implementation.

They were retired for the *other* reason the same document gives, which does
hold: they are **proxies**. "No `await` token" is neither necessary nor
sufficient for "nothing suspends above the first PiP call" — a `.then` chain
above the call would suspend while passing all three, and an `await` in a
legitimately-async branch *below* the call would fail all three while spending
no activation. The replacement asserts the property itself. This audit records
the correction rather than repeating the decision record's wording, because
the difference is exactly the sort of thing a future reader would otherwise
have to re-derive.

**What the replacement kept anyway.** The decision record's "Constraint carried
forward to Task 19" says the replacement must keep forbidding `await` in the
synchronous non-`dryRun` flow. It does — file-wide, not merely above the call.
The reason is worth stating because it is the one place where a purely
positional rule is *not* enough: `actNow` and `native` are function
**expressions** declared in the middle of `entry.ts` and called from the
bottom of it, so `const supported = …` — the last statement to run before the
PiP call — sits **below** `requestPictureInPicture()` in the text. Source order
is not execution order, and the hole is exactly the size of that inversion.
Mutation **M1async** lands in it, and only the file-wide assertion catches it.

### §2.2 Mutation matrix — every assertion broken individually

Each mutation was applied to `src/pip/entry.ts` alone, the two new test files
run, and the mutation reverted with `git checkout --`. **Nothing was deleted
until all ten were red on the predicted assertion.**

| # | Mutation | Predicted to fail | Actual |
|---|---|---|---|
| M1 | `await Promise.resolve();` immediately above `const supported = …` (the literal instruction) | assertion 2 | **Transform failed** — `await` in a non-`async` function is a parse error, so the file never compiled. Re-run as M1async. |
| M1async | `async function _mutant() { await Promise.resolve(); }` in the same position | assertion 2 | 🔴 **"contains no await anywhere either…"** and 🔴 **"declares pipEntry … without `async`"**. The *positional* assertion stayed green — see the source-order note above. `await` cannot be isolated from `async`: the two mutations are the same mutation. |
| M2 | an `await` token immediately above `const entering = best.el.requestPictureInPicture()` | assertion 2 | 🔴 **"contains no await above the first PiP call"** + 🔴 the file-wide one |
| M3 | the `if (dryRun)` return block moved below the native call | assertion 4 | 🔴 **"returns from the dryRun branch above the first PiP call"** — `expected 9034 to be less than 6531` |
| M4 | `import { decideMode } from "./router";` + a call to it | assertion 5 | 🔴 **"references none of the outside helpers it deliberately inlines"** — `not to contain 'decideMode('` |
| M5 | inline preset `small` → 321×180 | inline-parity presets | 🔴 2 assertions |
| M5b | inline clamp floor `240` → `200` | inline-parity clamp | 🔴 2 assertions — bounds *and* the behavioural table |
| M5c | `if (!p.enhancedWindow) return "native";` deleted from the inline `routeTo` | inline-parity truth table | 🔴 `tier=pro enhanced=false dpip=true: expected 'document' to be 'native'` |
| M6 | `Promise.resolve().then(function () {});` above the PiP call | assertion 6 | 🔴 **"contains no .then chain above the first PiP call"** |
| M7 | both PiP calls renamed away | assertion 1 | 🔴 **"still contains a PiP call to measure against"** — `expected 9007199254740991 to be less than 10301` |
| M9 | comment stripping disabled in the test itself | the stripper guard | 🔴 **7 of 9** assertions, incl. `expected 15823 to be less than 1179` on the dryRun test — the exact vacuity the stripper prevents |

**No assertion survived its mutation.** Every one measures something.

### §2.3 The two Preserved guard tests

| Test | Decision | Verified |
|---|---|---|
| "references no identifier outside its own body" | Preserved, unchanged | Still present and green in `entry.test.ts` (C1). It survived the Pro branch, which is the non-trivial part: every helper Document PiP needed (`routeTo`, `presets`, `clamp`, `actNow`, `native`, `failed`) is declared inside the body. |
| "returns a plain object rather than a thenable" | Preserved, unchanged | Still present and green, and deliberately **left in `entry.test.ts`** rather than moved: it is the only one of the five that exercises pipEntry's *behaviour* rather than its source, and it belongs beside the dryRun tests it protects. |

---

## §3 — Row 18, re-derived

`decisions-pro-tier.md` marked row 18 **"Preserved, unchanged — flagged"** and
said outright that this audit must not read "Preserved" off the table and move
on. The feared case: Task 7 needing a **sixth `reason`** or a **fourth
`outcome`** to describe a Document PiP failure, or to distinguish a Pro success
from a native one.

**Finding: row 18 holds, and the flag can be cleared.** Checked against
`src/pip/entry.ts` as it stands today, not against the plan's prediction:

- **`PipEntryReason` — exactly 5**, at lines 87–91: `none-found`, `not-ready`,
  `pip-disabled-by-site`, `not-winner`, `pip-unavailable`. No sixth anywhere in
  `src/`; the type is not re-declared or widened elsewhere (it is referenced in
  exactly three places, all in `entry.ts`).
- **`outcome` — exactly 3**, at line 99: `"PIP_OK" | "PIP_EXITED" | "THREW"`.
  The union is declared inline on the field and nowhere else in the repo.
- **Every return site produces a member of those two sets.** The `reason`
  producers are lines 129 (`not-winner`), 148 (`pip-unavailable`) and the
  three-way ternary at 328–332 (`pip-disabled-by-site` / `not-ready` /
  `none-found`), which is annotated `const reason: PipEntryReason` so the
  compiler checks it. The `outcome` producers are lines 140 (`PIP_EXITED`),
  377 (`THREW`), 392 (`PIP_OK`, native) and 514 (`PIP_OK`, **document**).

**The load-bearing observation is line 514.** The enhanced window's success
returns `outcome: "PIP_OK"` — *the same value the native window returns* — and
carries the distinction in `mode: "document"` instead. Likewise the fallback
case: `background/action.ts:41` keys its toast on
`actor.outcome === "PIP_OK" && actor.fellBackFrom === "document"`, i.e. on a
**field**, not on a new outcome value. Both of the callout's escape hatches
were available and neither was taken.

So the Pro branch is squarely inside row 19's additive rule ("any Pro branch
that wants to report new information must extend this interface, not bypass
it") and leaves row 18's cardinality claim intact. **No amended decision is
required.** Row 18 stands as `Preserved, unchanged`, now *verified* rather than
*flagged*.

Two caveats, stated rather than implied:

1. The cardinality is enforced by **`tsc`**, not by a dedicated runtime test —
   the unions are the declaration, and every producer is checked against them
   at compile time (C6). Every one of the five reasons and three outcomes is
   *additionally* exercised at runtime by a named test (rows 2, 3, 5, 6, 8, 14,
   16 above), so no member is merely declared.
2. This finding is a fact about the code as of 2026-08-11. It is not a rule
   that survives future edits on its own; if a later plan does need a sixth
   reason, row 18 needs the explicit amendment the callout describes.

---

## §4 — Verification runs

Run 2026-08-11, output pasted verbatim:

| Handle | Command | Result |
|---|---|---|
| C1 | `npm test` | `Test Files  57 passed (57)` / `Tests  469 passed (469)` |
| C2 | `npx playwright test --config playwright.fixtures.config.ts` | `77 passed (17.8s)` |
| C3 | `npm run e2e:visual` | `8 passed (18.2s)` |
| C4 | `npm run e2e:granted` | `12 passed (15.4s)` |
| C5 | `npm run e2e` | `12 passed (24.9s)`, 0 skipped |
| C6 | `npx tsc --noEmit`; `npm run e2e:typecheck` | exit 0, no output |
| C7 | `npm run build` → `webpack 5.108.1 compiled with 3 warnings in 5424 ms` (3 = asset-size advisories). `grep -c` on the resulting `dist/content.js`: `storage.session: 0`, `activePip: 0`, `setAccessLevel: 0` | ✅ |

C7's grep was run against a bundle produced by `npm run build` **immediately
beforehand** — `npm test` leaves a dev bundle behind, and grepping that would
prove nothing about what ships.

**C2 is the one that matters most for parity.** Detection, scoring and both
R-14 terms are untouched by the Pro plan; 77 green is the evidence that the
Pro work did not reach further than intended.

The four Playwright configs remain disjoint — `--list` reports 77 / 8 / 12 / 12,
unchanged from the pre-task baseline.

---

## §5 — Part 3, `src/options/OptionsView.tsx` (9 items)

All 9 **Preserved**. The four Pro rows landed *beside* them, so the risk this
section audits is displacement, not deletion.

| Item | Verified through | Evidence |
|---|---|---|
| Page heading "Picture in Picture — Settings" | `OptionsView.test.tsx` → "renders exactly the nine rows, in order" | C1 |
| "Keyboard shortcut" row | `OptionsView.test.tsx` → "hands off to the container rather than relying on an inert chrome:// anchor", "exposes the shortcut control as a real focusable control", "says the key works while a BROWSER WINDOW has focus" | C1; `options.test.tsx` → "opens Chrome's shortcut editor through chrome.tabs.create" |
| "Support embedded players" row (+ `site-access-denied` alert) | `OptionsView.test.tsx` → the six-test "embedded players row" block | C1; `options.test.tsx` → "requests `<all_urls>` SYNCHRONOUSLY from the click", "a declined grant leaves the switch off" |
| "Show status messages" row | `OptionsView.test.tsx` → "toggling it reports ('toastEnabled', false)", "reflects the current setting in the switch's checked state" | C1 |
| "Your plan" row (`PaymentNudge`, `PlanBadge`, Upgrade, `TierBadge`) | `OptionsView.test.tsx` → the nine-test "your plan row" block | C1; C5 `billing.spec.ts` |
| "Restore purchase" row | `OptionsView.test.tsx` → "wires the RestoreForm's submit to onRestore(email)", "reflects a 404 restoreResult as a warning alert", "reflects a success restoreResult" | C1 |
| Footer (privacy + "Read the source") | `OptionsView.test.tsx` → "states the privacy position", "links to the source" | C1 |
| Paywall modal (`UpgradePaywall`) | `OptionsView.test.tsx` → "renders UpgradePaywall as open when paywallOpen is true"; `options-pro.test.tsx` → "routes a locked row's Unlock button to the paywall" | C1 |
| "The promise this plan keeps" doc comment — the four Pro rows "deliberately absent" | **Preserved, fulfilled.** The comment's factual claim is now false *by design*: `options-pro.test.tsx` → "renders all four, on Free as well as Pro" and "puts them between the status-message row and the plan row"; `OptionsView.test.tsx` → "renders exactly the nine rows, in order", "shows all four Pro feature rows on free", "…on pro too" | C1; C3 visual |

The row-order tests are the ones doing the real work here: "renders exactly the
nine rows, in order" and "puts them between the status-message row and the plan
row" together mean a Pro row cannot displace a v1 row without a test going red.

---

## §6 — Self-review

- **All 34 decision rows have a row here.** 20 (§1) + 3 dropped (§2.1) + 2
  preserved guards (§2.3) + 9 (§5) = 34. Row 18 additionally has §3.
- **Nothing is marked verified on the strength of `tsc` alone**, with one
  disclosed exception: row 18's *cardinality* is a compile-time property by
  construction, and §3 says so explicitly rather than dressing it up. Every
  individual member of both unions is separately exercised at runtime.
- **The deletion happened last.** `entry-invariant.test.ts` and
  `inline-parity.test.ts` were written, run green, and mutation-checked (10
  mutations, 10 red) *before* a single line was removed from `entry.test.ts`.
- **The decision record is corrected, not quietly followed.** §2.1 records that
  all three retired tests still passed, which the decision record's wording
  implies they would not.
- **A weakness in the plan's own replacement design was found and closed**,
  not worked around: the positional rule alone has a source-order hole, M1async
  lands in it, and the file-wide `await` assertion exists because of it. Had
  the mutation matrix been skipped, that hole would have shipped.
- **Known limit, stated rather than implied.** These are *syntactic* guards.
  They cannot see a suspension introduced through a helper in another file,
  because rule 1 forbids `entry.ts` calling one — the guards are sound only
  while "references no identifier outside its own body" (row 20) is also green.
  The two tests are coupled; neither is safe to delete alone.
