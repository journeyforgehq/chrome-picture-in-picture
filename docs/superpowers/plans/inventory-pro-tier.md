# Inventory — capability inventory of every surface the Pro tier plan modifies

Built by reading the code at commit c695a12 (branch `feat/v2-pro`), not from any
task description. Every row was confirmed by opening the file named in the last
column and reading the surrounding code, not just the named line. No keep/drop
decision is recorded here on purpose — decisions are Task 19's job, and this
list exists precisely so that task cannot make them without an explicit
capability list to check off against. Line numbers below were re-read against
the files as they stand today; see "Line-number accuracy" at the end of each
section for whether the plan's numbers needed correcting.

Paths are relative to `extension/` unless stated otherwise.

**Scope of this document.** Everything below records current state — what the
code does today, not what it should do. Where this document points forward (to
Task 19, or to the promise the `OptionsView.tsx` comment makes), it is
**quoting the plan's own Step 2 and Step 3 instructions**, not offering a
design recommendation of its own. The one place this document draws its own
conclusion beyond what the plan or the code states outright is called out
explicitly, inline, as an inference.

## Step 1 — `src/pip/entry.ts` (360 lines total)

`entry.ts` is the single function (`pipEntry`) injected into the page via
`chrome.scripting.executeScript({ func: pipEntry })`, which serializes it with
`Function.prototype.toString()`. Two constraints from the file's own header
comment (lines 1–56) bind every future edit, including the Pro tier's:

- **Rule 1 — no outside identifiers.** The function body may not reference
  anything declared outside itself: no imports, no module-level constants, no
  helper functions, no closure variables. TypeScript compiles a violation
  happily; the user gets a `ReferenceError` in their browser. Every helper the
  Pro branches need must live inside the body. Enforced by
  `test/pip/entry.test.ts`'s "references no identifier outside its own body"
  test (line 384), which rebuilds the function from its own source text with
  `new Function` in a bare scope.
- **Rule 2 — no `await`, nothing may suspend above `requestPictureInPicture()`.**
  Transient user activation is spent by the first suspension point. The precise
  invariant is "the call happens synchronously inside the gesture turn," not
  "the function returns synchronously" — the real-PiP branch returns
  `promise.then(...)`, never `await`s it. The `dryRun` path is additionally
  pinned to be **fully** synchronous (return, not just call), because
  `content.ts`'s `localScore()` temporarily lifts `window.__pipCoord` around a
  `dryRun` call and relies on nothing observing the window in between.

| # | Capability | Line(s) |
|---|---|---|
| 1 | Frame arbitration via `window.__pipCoord`, top-frame default | 100–105 |
| 2 | Second click exits PiP (`PIP_EXITED`), with the exit promise's rejection silently swallowed (the window being already gone is not an error) | 107–116 |
| 3 | `pictureInPictureEnabled` guard emits `pip-unavailable` **before** any API call — the only place that reason is produced, and its ordering is what lets `action.ts` treat a later `NotAllowedError` as `PIP_REFUSED` rather than "PiP turned off" | 118–124 |
| 4 | Shadow-root-descending collection, closed roots degrade to not-found (never throw); a `querySelectorAll` failure on any root is also caught and treated as empty | 126–145 |
| 5 | `disablePictureInPicture` (property OR `disablepictureinpicture` attribute) → `sawDisabled` | 165–168 |
| 6 | `readyState < 2` → `sawNotReady` | 169–172 |
| 7 | Zero-dimension (`videoWidth`/`videoHeight`) / <100px rect / `display:none` / `visibility:hidden` / opacity ≤0.1 filters | 173–184 |
| 8 | `duration > 5` filter with the `Infinity` live-stream exemption | 186–188 |
| 9 | Scoring terms: playing +1000, unmuted +200, viewport-intersection ratio ×500, area (capped at 200000px²) ×300 | 198–202 |
| 10 | R-14 term 1 — muted clip under 65s, −400 (65s, not 30s, chosen to clear all three commonly-sold pre-roll lengths: 15/30/60s) | 203–216 (comment 203–215, code at 216) |
| 11 | R-14 term 2 — page-aware advert penalty, −500, `isFinite` guard against symmetric live-stream self-penalty, video is penalised only if some *other, currently-playing* candidate's duration is ≥4× its own | 229–290 (comment 229–274, code 275–290) |
| 12 | Tie-break: score, then area, then DOM order (**earlier wins**) | 292–296 |
| 13 | `dryRun` returns **synchronously** — contract pinned in the type system by the `dryRun: true` overload at line 93 (return type `PipEntryResult`, not `PipEntryResult \| Promise<...>`) | 313–315 (overload: 93) |
| 14 | Both failure shapes (sync throw + async rejection) → one `THREW` result with `errorName`, matched by property (`err.name`) rather than `instanceof Error` because the failure can cross a realm boundary | 317–359 |
| 15 | Frame/`isTop` determination itself (`window === window.top`, and the `frame: "TOP" \| "SUBFRAME"` value threaded through every return) happens **before** arbitration and is read by arbitration's fallback (`isTop` is the no-`__pipCoord` default) | 97–98 |
| 16 | **No-candidates reason priority.** When `scored.length === 0`, the reason returned is `sawDisabled ? "pip-disabled-by-site" : sawNotReady ? "not-ready" : "none-found"` — a specific precedence between two boolean flags set during filtering. This is a distinct decision from rows 5/6 (which only set the flags) and was not called out as its own row anywhere in the plan's table. | 302–309 |
| 17 | Candidate `label` derivation: `el.dataset.label \|\| el.id \|\| "video-" + i`, i.e. a three-level fallback keyed to DOM index | 218 |
| 18 | The full `PipEntryReason` union has exactly five members (`none-found`, `not-ready`, `pip-disabled-by-site`, `not-winner`, `pip-unavailable`) and the full `outcome` union has exactly three (`PIP_OK`, `PIP_EXITED`, `THREW`) — every existing return site was checked to confirm it produces one of these and no other value | 69–84 |
| 19 | Public type contract: `PipEntryOptions`, `PipCandidate` (`label`/`score`/`width`/`height`), `PipEntryResult` (`frame`/`acted`/`winner`/`candidates`/`reason?`/`outcome?`/`errorName?`) — this is the shape `content.ts` and `background/action.ts` consume; any Pro branch that wants to report new information must extend this interface, not bypass it | 58–84 |
| 20 | Rule 1 as a standalone, whole-body constraint (not just prose above): the function body must be entirely self-contained — no imports, no module-level constants, no helper functions, no closure variables — enforced by the "references no identifier outside its own body" test. Listed as its own row, not just header prose, so Task 19's parity audit has an explicit line to record a keep/drop decision against rather than inferring one from the intro text. | whole-body constraint; header rationale at 12–19, enforced by `test/pip/entry.test.ts:384` |

Rows 15–20 are **this task's own findings**, not itemized anywhere in the
plan's Step 1 table — they are folded into the same table, with continuing
numbers, specifically so Task 19's parity audit cannot skip them as
second-class just because they arrived from a closer read rather than from
the plan text.

### Line-number accuracy

Every one of the plan's 14 line-number ranges (rows 1–14) was checked against
the file as it stands at c695a12 (Read tool, 1-indexed, matching `cat -n`).
**All 14 were exact** — none needed correction. This was not assumed; each
range was individually re-derived from the file content (e.g. row 10's own
code line is 216, inside the stated 203–216 comment+code range; row 11's code
is 275–290, inside the stated 229–290 range). The file has not drifted since
the plan was written. Rows 15–20 have no plan-provided numbers to check
against — their line numbers are first-hand, read directly from the file
during this task.

## Step 2 — the guard tests that constrain `entry.ts`

```
cd extension && grep -n "await\|async\|toString\|dryRun" test/pip/entry.test.ts
```

`test/pip/entry.test.ts` is 495 lines. The header comment in `entry.ts` itself
(lines 30–32) states: "three tests in `test/pip/entry.test.ts` assert that no
`await` appears anywhere in this source and that `pipEntry` is not an async
function." All three were located and are reproduced verbatim below, with
their current line numbers (unchanged from what a fresh read shows — no
correction needed).

**1. `test/pip/entry.test.ts:395–400`** — "contains no await before the
requestPictureInPicture call" (describe block: "pipEntry — serialization
safety")
```ts
it("contains no await before the requestPictureInPicture call", () => {
  const src = pipEntry.toString();
  const callAt = src.indexOf("requestPictureInPicture()");
  expect(callAt).toBeGreaterThan(-1);
  expect(src.slice(0, callAt)).not.toMatch(/\bawait\b/);
});
```

**2. `test/pip/entry.test.ts:412–415`** — "is not an async function" (describe
block: "pipEntry — synchronicity is a contract, not an implementation detail")
```ts
it("is not an async function", () => {
  expect(pipEntry.constructor.name).toBe("Function");
  expect(Object.prototype.toString.call(pipEntry)).toBe("[object Function]");
});
```

**3. `test/pip/entry.test.ts:417–419`** — "contains no await anywhere in its
body, not merely before the PiP call" (same describe block as #2)
```ts
it("contains no await anywhere in its body, not merely before the PiP call", () => {
  expect(pipEntry.toString()).not.toMatch(/\bawait\b/);
});
```

These three are **the guards this plan weakens**: adding a Document PiP branch
that legitimately needs `await` (or that makes `pipEntry` itself async) will
fail all three, by design. Task 19 replaces them — it may not simply delete
them, because until they are replaced nothing enforces the turn-based
synchronicity invariant (rule 2 above) at all. The comment at lines 409–411
already anticipates a *scoped* version of this constraint: "The existing guard
only forbids `await` BEFORE `requestPictureInPicture()`. An await anywhere else
would still make the [`__pipCoord`] lift a real race in every frame, on every
page." **Inferred constraint (not from the plan):** reading that comment
together with the code, whatever replaces test #3 must keep forbidding
`await` in the *synchronous, non-`dryRun`* control flow, even if the file as a
whole gains an async branch elsewhere. The plan does not say this; it follows
from the existing comment's own stated reasoning about the `__pipCoord` race,
applied to what a Pro-tier async branch would add.

### Closely related tests found — not "no-await" guards, but constrain the same contract

These were not asked for by the task's literal wording ("no await appears
anywhere" / "not an async function") but sit in the same two describe blocks
and will need explicit consideration when Task 19 touches this area, so they
are recorded rather than silently left out:

- **`test/pip/entry.test.ts:384–393`** — "references no identifier outside its
  own body" (describe block: "pipEntry — serialization safety"). This is
  Rule 1's enforcement (see Step 1 above), not Rule 2's — it does not mention
  `await`/`async` and does not need to change for the Pro tier's async branch
  per se, but it **will** break if any Pro branch references an outside
  identifier, and every helper the Document PiP path needs (feature-detection
  for `documentPictureInPicture`, window sizing, etc.) must be declared inside
  `pipEntry`'s own body to keep passing it.
- **`test/pip/entry.test.ts:421–425`** — "returns a plain object rather than a
  thenable" (describe block: "pipEntry — synchronicity is a contract, not an
  implementation detail"). Calls `pipEntry({ dryRun: true })` and asserts
  `typeof r.then === "undefined"`. This is the `dryRun`-stays-synchronous half
  of Rule 2, distinct from "no `await` anywhere" — the plan can add an async,
  non-`dryRun` Document-PiP branch without touching this test at all, since it
  only exercises the `dryRun: true` path.

## Step 3 — `src/options/OptionsView.tsx` (270 lines total)

Purely presentational: `options.tsx` (not read for this task, out of scope)
owns every `chrome.*` call and all state; `OptionsView.tsx` receives it all as
props (`OptionsViewProps`, lines 17–39).

### Existing rows, in DOM order

| Row (`label` prop) | Layout | Control | `aria-label` | `data-testid` | Line(s) |
|---|---|---|---|---|---|
| Page heading "Picture in Picture — Settings" | `<Title level={2}>` | — | — | — | 157–159 |
| "Keyboard shortcut" | normal (label+help left, control right) | `<Button type="link">Change shortcut</Button>` calling `onOpenShortcuts` — deliberately not an `<a href="chrome://...">`, which Chrome blocks from extension pages | none | none | 161–181 |
| "Support embedded players" | normal, with a conditional child `<Alert>` when `siteAccessDenied` | `<Switch>` calling `onSettingChange("embeddedPlayers", checked)` | `"Support embedded players"` | `site-access-denied` (on the conditional alert wrapper `div`) | 183–208 |
| "Show status messages" | normal | `<Switch>` calling `onSettingChange("toastEnabled", checked)` | `"Show status messages"` | none | 210–220 |
| "Your plan" | `wide` (control/body stacked below label) | body: `PaymentNudge`, `PlanBadge`, conditional `<Button type="primary">Upgrade</Button>` (only when `tier === "free"`) calling `onOpenPaywall`; control-slot: `TierBadge` | none on the Upgrade button | `tier-badge` (wraps the `TierBadge` control) | 222–240 |
| "Restore purchase" | `wide` | body: `<RestoreForm onRestore result={restoreResult} loading={restoring} />` | (delegated to `RestoreForm`, not read here) | (delegated to `RestoreForm`, not read here) | 242–248 |
| Footer | plain `<footer>` | privacy paragraph + "Read the source" `<a>` to `sourceUrl` | none | `privacy-note` (on the privacy paragraph) | 250–260 |
| Paywall | modal, not a `Row` | `<UpgradePaywall open={paywallOpen} plans={plans} onCheckout={onClosePaywall→onClose} />` | — | — | 262–267 |

Every `data-testid`/`aria-label` in the file (confirmed by grep, not just the
table above): `aria-label="Support embedded players"` (194),
`data-testid="site-access-denied"` (201), `aria-label="Show status messages"`
(215), `data-testid="tier-badge"` (226), `data-testid="privacy-note"` (251).
No others exist in this file.

### The promise this plan keeps

`OptionsView.tsx` lines 124–133, the doc comment directly above the
`OptionsView` component:

> The extension's only page. Purely presentational: options.tsx owns every
> chrome.\* call, and in particular owns calling chrome.permissions.request
> straight out of the switch's change handler — that API rejects with
> "This function must be called during a user gesture" if anything is awaited
> first, so the request cannot live behind an async boundary here.
>
> The four Pro feature rows (enhanced window, window size, in-window controls,
> subtitles) belong to a later plan and are deliberately absent.

That second paragraph is a promise this plan keeps: it is the origin of the
"four Pro rows" the plan's own summary refers to (enhanced window, window
size, in-window controls, subtitles). Nothing else in `OptionsView.tsx`
references Pro-tier rows, gated or otherwise — grepped for "enhanced",
"subtitle", "window size", "in-window", `Pro` (case-sensitive, to exclude
`Paragraph`/`Property`-style matches): no hits beyond that one comment and the
existing `tier`/`plan`/paywall plumbing already inventoried in
`docs/superpowers/plans/inventory-picture-in-picture.md` rows 69–80 (which
predate the product rename from "Reference Extension" to "Picture in Picture"
— the heading text at line 158 has since changed from "Reference Extension —
Settings" to "Picture in Picture — Settings"; this is drift from plan 1's
document, not a defect in either document).

### Line-number accuracy

All line numbers in this section were read directly from the file as it
stands at c695a12; none are carried over from an earlier plan draft, so there
is nothing to "correct" here — the numbers above are first-hand.
