# Keep/drop decisions — Picture in Picture v1 → Pro tier

Every capability recorded in `inventory-pro-tier.md` (commit c695a12, branch
`feat/v2-pro`) appears here exactly once, across all three surfaces Task 1
inventoried: `src/pip/entry.ts` (20 rows), its guard tests (5 items), and
`src/options/OptionsView.tsx` (9 items). A capability in neither the Preserved
nor the Intentionally-dropped list is a planning bug — that is the rule this
document exists to enforce.

**Coverage:** 34 of 34 inventoried items decided. Preserved: 31 (of which 3
carry a qualifier — re-pinned, flagged-at-risk, or extensible-by-rule, see
below). Intentionally dropped: 3 (the full "no `await`" guard-test trio,
decided as one group per the plan). Undecided: 0.

Notation:
- **unchanged** — the code (or test) does not change at all in this plan.
- **re-pinned** — the capability survives and gains a new test that pins the
  same invariant more precisely.
- **flagged** — preserved as read today; recorded here because this task
  found a real tension the plan's own text does not resolve (see the callout
  under row 18).
- **extensible-by-rule** — the capability itself (a rule about *how* future
  code may extend a contract) is unchanged; the contract it governs is
  expected to grow additively.
- **fulfilled** — a forward-looking promise in the code is not preserved
  *unchanged*, it is preserved by being *carried out*: this plan is the "later
  plan" the comment was written for.

---

## Part 1 — `src/pip/entry.ts` (rows 1–20)

All 20 rows are **Preserved**. None are dropped. This matches the plan's own
framing: the Pro branch is added *after* the winner is chosen, so detection,
scoring, arbitration, and the failure/result contracts that surround them are
none of this plan's business — with one flagged exception (row 18, below).

| # | Capability | Decision |
|---|---|---|
| 1 | Frame arbitration via `window.__pipCoord`, top-frame default | Preserved, unchanged |
| 2 | Second click exits PiP (`PIP_EXITED`), rejection on an already-gone window silently swallowed | Preserved, unchanged |
| 3 | `pictureInPictureEnabled` guard emits `pip-unavailable` before any API call | Preserved, unchanged |
| 4 | Shadow-root-descending collection; closed roots and `querySelectorAll` failures degrade to empty, never throw | Preserved, unchanged |
| 5 | `disablePictureInPicture` (property or attribute) → `sawDisabled` | Preserved, unchanged |
| 6 | `readyState < 2` → `sawNotReady` | Preserved, unchanged |
| 7 | Zero-dimension / <100px rect / `display:none` / `visibility:hidden` / opacity ≤0.1 filters | Preserved, unchanged |
| 8 | `duration > 5` filter, `Infinity` live-stream exemption | Preserved, unchanged |
| 9 | Scoring terms (playing +1000, unmuted +200, intersection ×500, area ×300 capped) | Preserved, unchanged |
| 10 | R-14 term 1 — muted clip under 65s, −400 | Preserved, unchanged |
| 11 | R-14 term 2 — page-aware advert penalty, −500, `isFinite` guard | Preserved, unchanged |
| 12 | Tie-break: score, then area, then DOM order (earlier wins) | Preserved, unchanged |
| 13 | `dryRun` returns synchronously, pinned by the `dryRun: true` overload | **Preserved, re-pinned.** `content.ts`'s `localScore()` lifts `window.__pipCoord` around a `dryRun` call and depends on nothing observing the window in between. Task 7 keeps the overload and adds a test that the `dryRun` path is still not thenable. |
| 14 | Both failure shapes (sync throw + async rejection) → one `THREW` result, matched by `err.name` not `instanceof Error` | Preserved, unchanged |
| 15 | Frame/`isTop` determination before arbitration, read by arbitration's fallback | Preserved, unchanged — happens before the winner is chosen, same as rows 1–12/14 |
| 16 | No-candidates reason priority (`sawDisabled` before `sawNotReady`) | Preserved, unchanged — a detection-phase decision, before any winner exists |
| 17 | Candidate `label` derivation (`dataset.label \|\| id \|\| "video-" + i`) | Preserved, unchanged — set during candidate construction, before the winner is chosen |
| 18 | `PipEntryReason` has exactly 5 members, `outcome` has exactly 3, checked against every return site | **Preserved, unchanged — flagged.** See callout below. This is the row most likely to need a *different* decision once Task 7 is actually written. |
| 19 | Public type contract (`PipEntryOptions`, `PipCandidate`, `PipEntryResult`) is the shape `content.ts` and `background/action.ts` consume | **Preserved, extensible-by-rule.** The inventory's own text states the rule Task 7 must follow: "any Pro branch that wants to report new information must extend this interface, not bypass it." That rule is unchanged. The contract itself may grow additive fields under that rule — this is not the same thing as row 18 changing (see callout). |
| 20 | Rule 1, whole-body self-containment (no imports, no module-level constants, no closure variables), enforced by "references no identifier outside its own body" | Preserved, unchanged. The test does not need to change; every helper the Document PiP path needs (feature-detection, window sizing) must be declared inside `pipEntry`'s own body to keep passing it — this is a constraint *on Task 7's implementation*, not a change to this test. |

### Callout — row 18 is the one place this document cannot fully resolve today

Row 18 is a whole-body assertion over the *result contract* used by **every**
return site in `entry.ts`, present and future — it is not scoped to
detection/scoring the way rows 1–12/14 are, and it sits directly downstream of
row 19's contract, which the inventory itself says Task 7 is expected to
extend.

There is a real distinction the plan's text does not draw:

- **Adding a field** to `PipEntryResult` (row 19's rule) is additive and
  compatible with row 18 as written — a new optional field doesn't change how
  many `reason` or `outcome` values exist.
- **Adding a new `reason` or `outcome` value** — e.g. if a Document PiP
  failure mode doesn't cleanly map onto one of the existing five reasons, or
  if the Pro path's success needs to be distinguishable from the native path's
  `PIP_OK` — would break row 18's exact-cardinality claim outright.

Task 7 has not been written yet, so this document cannot say today which of
those two happens. Recorded here so Task 19's parity audit does not
mechanically read "row 18: Preserved" off this table and skip checking it —
if Task 7 added a sixth reason or a fourth outcome, row 18's test needs an
explicit **amended** decision at that point, not silence.

---

## Part 2 — the guard tests (`test/pip/entry.test.ts`)

### Intentionally dropped

| Test | Reason | Sign-off |
|---|---|---|
| `entry.test.ts:395–400` — "contains no await before the requestPictureInPicture call" | Part of the "no `await` anywhere" guard trio the plan names. The invariant was always *"nothing suspends above the first PiP call,"* not *"the source text contains no `await` token."* The source-text rule was a cheap proxy for the real invariant. | Not observable to end users — internal test replacement. No sign-off required. |
| `entry.test.ts:412–415` — "is not an async function" | Same trio, same reason. The Pro path deliberately makes part of `pipEntry`'s control flow suspend (after `requestWindow()` resolves), which this test forbids outright regardless of *where* the suspension happens. | Not observable. No sign-off required. |
| `entry.test.ts:417–419` — "contains no await anywhere in its body, not merely before the PiP call" | This is the one the plan names explicitly: **intentionally dropped, replaced by a stricter one.** The Pro path deliberately suspends *after* `requestWindow()` resolves — a location the existing test forbids just as much as before the PiP call, even though only the latter is what actually spends transient activation. Task 19's replacement guard asserts the precise property (nothing suspends *above the first PiP call*) instead of the blanket proxy, and is mutation-checked. | Not observable. No sign-off required. |

All three are decided together because the inventory itself groups them: "These
three are the guards this plan weakens... Task 19 replaces them — it may not
simply delete them, because until they are replaced nothing enforces the
turn-based synchronicity invariant at all." Task 19 may only remove these
three once this document exists and gives an explicit basis for the
replacement — which it now does.

**Constraint carried forward to Task 19 (not a drop, a design note):** the
inventory's own reasoning about the `__pipCoord` race means whatever replaces
the third test must keep forbidding `await` in the *synchronous, non-`dryRun`*
control flow, even though the file as a whole gains an async branch elsewhere.
This is inferred from the existing code comment at lines 409–411, not stated
outright by the plan — recorded here so Task 19 doesn't have to re-derive it.

### Preserved

| Test | Decision |
|---|---|
| `entry.test.ts:384–393` — "references no identifier outside its own body" | Preserved, unchanged. This is Rule 1's enforcement (row 20), a different contract than the no-`await` trio. It does not mention `await`/`async` and does not need to change for the Pro tier's async branch — but it *will* break if any Pro branch references an outside identifier, so every helper Document PiP needs (feature-detection, window sizing) must live inside `pipEntry`'s own body. |
| `entry.test.ts:421–425` — "returns a plain object rather than a thenable" (asserts on `pipEntry({ dryRun: true })`) | Preserved, unchanged — this is the same invariant as row 13's re-pinning. It only exercises the `dryRun: true` path, so the plan can add an async, non-`dryRun` Document-PiP branch without touching this test at all. |

---

## Part 3 — `src/options/OptionsView.tsx`

All 9 items are **Preserved**. None are dropped.

| Item | Decision |
|---|---|
| Page heading "Picture in Picture — Settings" | Preserved, unchanged |
| "Keyboard shortcut" row (`Button type="link"` → `onOpenShortcuts`) | Preserved, unchanged |
| "Support embedded players" row (`Switch` + conditional `site-access-denied` alert) | Preserved, unchanged |
| "Show status messages" row (`Switch` → `onSettingChange("toastEnabled", ...)`) | Preserved, unchanged |
| "Your plan" row (`PaymentNudge`, `PlanBadge`, conditional Upgrade button, `TierBadge`) | Preserved, unchanged. This is the row the four new Pro rows land near, but nothing in this task's scope restructures it — that is Task 7+'s job, and this document doesn't pre-decide their placement. |
| "Restore purchase" row (`RestoreForm`) | Preserved, unchanged |
| Footer (privacy paragraph + "Read the source" link) | Preserved, unchanged |
| Paywall modal (`UpgradePaywall`) | Preserved, unchanged |
| "The promise this plan keeps" — the doc comment at lines 124–133 stating the four Pro rows (enhanced window, window size, in-window controls, subtitles) "belong to a later plan and are deliberately absent" | **Preserved, fulfilled.** This plan *is* the later plan the comment names. Nothing about the comment's factual claim is preserved unchanged forever — this plan's job is to make it false by adding those four rows. Recorded as its own decision because it is the one item in the inventory that is not really a "keep the code as-is" case; it is a promissory note this plan is obligated to pay down, not merely leave alone. |

---

## Sign-off — the one observable behaviour change

The only user-observable behaviour change to an existing (Preserved)
capability in this plan: **a cold service worker makes the free path take one
`await` before `requestPictureInPicture()`.**

> The human partner was presented with three options and selected, on 2026-08-10:
>
> **"Hybrid: cache warm, fall back cold"** — Worker keeps a module-level prefs cache refreshed on `storage.onChanged`. Warm (the common case): free path stays fully synchronous, exactly as today. Cold (worker just started): `pipEntry` does one `chrome.storage.local.get` in the PAGE — measured 1ms against a ~5s activation budget. Worst case if that read ever stalled: `PIP_REFUSED` toast, and a second click works because the worker is warm by then.
>
> The two rejected alternatives were: (a) *never await on the free path* — a cold worker always routes to native even for a paying Pro user, which since clicks are usually more than 30s apart would be most clicks, making Pro feel broken; and (b) *always read page-side, one code path* — simpler, but every free click would then depend on a timing budget instead of a structural guarantee, for the ~99% of users who never buy Pro.

Measurement basis (S-11, recorded in `../picture-in-picture-design/09-spikes/FINDINGS.md`,
not re-derived here): the page's transient activation is time-based (~5s) and
survives awaits — a `chrome.storage.local.get` measured at 1ms, a `sendMessage`
round trip at 2–3ms, and a 1s timer all still allowed PiP to open; a 6s timer
did not. The service worker's user-gesture scope is turn-based and is lost by
any `await` — this is why the cold-path read happens in the page, never in
`chrome.action.onClicked` itself.

This sign-off is already obtained; it is recorded here verbatim and is not
being re-requested.

---

## Deletion is not authorised by this document

This is a decision record, not a work order. Task 19 may delete the three
"no `await`" guard tests once — and only once — its replacement guard (the
one asserting the precise "nothing suspends above the first PiP call"
invariant, mutation-checked) exists and passes. Nothing else in this document
authorises deleting any code; no code was touched to produce it.

---

## Self-review

- **Every inventory row has a decision, and none appears twice.** All 20
  `entry.ts` rows (Part 1), all 5 guard-test items (Part 2: 3 dropped + 2
  preserved), and all 9 `OptionsView.tsx` items (Part 3) are accounted for.
  20 + 5 + 9 = 34, matching the coverage line above.
- **No drop was invented that nobody asked for.** The only drops are the
  three "no `await`" guard tests, which the plan's own Step 1 text explicitly
  names as dropped-and-replaced. Every other item is Preserved.
- **Nothing is marked "Preserved" that the plan actually changes.** Row 13's
  entry is "re-pinned," not bare "unchanged," because Task 7 does add a new
  test against it. Row 19 is "extensible-by-rule" rather than plain
  "unchanged," because its own text anticipates Task 7 extending the
  interface. The "promise this plan keeps" item is marked "fulfilled," not
  "unchanged," because leaving it merely unchanged would make its own factual
  claim false once Task 7 lands. Row 18 is left as "Preserved... flagged"
  rather than forced into a false "unchanged" — the honest answer is that
  this task cannot determine row 18's fate without Task 7's design, and
  guessing would be worse than flagging it, per the same principle
  `decisions-picture-in-picture.md` used for its own Undecided rows 46 and 67.
