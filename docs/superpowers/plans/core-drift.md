# CORE drift — vendored files this child edits on purpose

`.factory.json` carries a `core` map of 47 files vendored from `chrome-ext-factory`,
each with a recorded SHA-256. `sync-core` compares the file on disk against that
hash and refuses to propagate an upstream change when they differ, unless it is
given `--force`.

Decision #67 of `decisions-picture-in-picture.md` was answered **"Accept and
record the drift"** (sign-off 2026-08-07). This file is that record: it exists so
that a future factory bump reads as a documented decision rather than an
archaeology problem.

## How this list was produced

Not copied from the decisions log, and not predicted — recomputed from disk each
time, because the prediction has already been wrong once. Before the popup
deletion the log's list of three was really two; after it, it is three, but for a
narrower reason than the log gave.

```
node -e '
const fs=require("fs"),c=require("crypto");
const f=JSON.parse(fs.readFileSync(".factory.json","utf8"));
for(const [p,sha] of Object.entries(f.core)){
  const h=c.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  if(h!==sha) console.log("DRIFTED "+p);
}'
```

Run from the repo root on 2026-08-09, **after the popup deletion**:

```
DRIFTED (3):
  extension/e2e/billing.spec.ts
  extension/e2e/harness/identity.ts
  extension/src/billing/plans.ts
MISSING (0):
UNCHANGED: 44 / 47
```

Earlier the same day, before the deletion, the same command reported `DRIFTED (2)`
and `UNCHANGED: 45 / 47` — `harness/identity.ts` had not drifted yet because its
doc comment still cited a file that still existed. It does not any more.

## Drifted files

| File | What changed | Why |
|---|---|---|
| `extension/src/billing/plans.ts` | Three-tier ladder (`monthly` $3.99/mo, `annual` $29/yr highlighted, `lifetime` $79 once) collapsed to a **single `lifetime` plan at `$9.99`, unit `once`**. The `PRICING RULE` doc comment was rewritten to say why the template's non-domination rule does not apply at one plan, and the "imported by popup + options" note now names options only. | Per-child pricing — arguably what this file is for. Inventory row 61; signed off 2026-08-07 ("Three-tier ladder → lifetime only, repriced $79 → $9.99"). The `Plan` union in `contract.ts` and all three `config.STRIPE_LINKS` keys are deliberately left intact, so re-adding a subscription later needs no contract or build-config change. |
| `extension/e2e/billing.spec.ts` | The money loop navigates `options.html` instead of `popup.html`; the tier assertion reads `[data-testid="tier-badge"]` instead of `getByText("Free"/"Pro")`; the `ProTool` / `LockedFeature` Layer-2 assertions are replaced by the options page's own Free-tier `Upgrade` affordance and a `test.fixme` parking the gating assertion for plan 2; screenshots renamed `popup-free.png`/`popup-pro.png` → `options-free.png`/`options-pro.png`. A `LOCAL DRIFT` note was added under the GENERATED banner. | This extension has no popup by design — the toolbar button *is* the feature (inventory row 15, signed off). The template's money loop asserts against a surface this child does not ship, so it had to move to the surface that does carry tier state. Inventory row 20. |
| `extension/e2e/harness/identity.ts` | **Comments only — no executable line changed.** `waitForDeviceId`'s doc comment explained the render race by citing `src/popup/popup.tsx`'s `useState<Tier>("free")` by name; it now cites `src/options/options.tsx`, which has the byte-equivalent line, so the explanation survives verbatim. `readDeviceId`'s contract line "must be called on an extension page (popup.html/options.html)" became "(options.html)". | `src/popup/popup.tsx` no longer exists. **Chose to update the comment rather than leave it**, because the alternative was a doc comment naming a deleted file as the authority for why the function polls storage instead of waiting on visible text — the single most load-bearing comment in the harness, and the one a future reader is most likely to act on. A dangling citation there invites someone to "simplify" `waitForDeviceId` into a text wait and reintroduce the race. Cheaper to carry one comment-only drift row than to leave that trap armed. |

Everything else in the `core` map — including `extension/e2e/fixtures.ts`,
`extension/e2e/global-setup.ts`, `extension/e2e/harness/webhook.ts`,
`backend/src/billing/webhook.ts` and all of `src/ui-kit/` — is unchanged and
`sync-core` will accept an upstream bump for them cleanly.

Worth noting for the same reason: `e2e/restore.spec.ts` needed a lifetime
(`mode: "payment"`) checkout event, and `harness/webhook.ts`'s `checkoutCompleted`
hard-codes `mode: "subscription"`. Rather than drift `harness/webhook.ts` too, the
lifetime event is built locally inside `restore.spec.ts`, which is **not**
vendored. If the factory ever grows a `mode` option on `checkoutCompleted`, that
local builder should be deleted in favour of it.

## Operating rule from here

- `sync-core` will report drift on the three files above and refuse without
  `--force`. That is expected, not a failure.
- Before forcing, diff the incoming template version against this table. Anything
  the template changed *outside* the rows described here is a real upstream
  improvement and should be taken; the three changes above must be re-applied on
  top. `harness/identity.ts` is the cheapest of the three to re-apply — it is two
  comment lines — and the most tempting to skip; don't, for the reason in its row.
- Any new drift must be added to this table in the same commit that causes it,
  with the SHAs **recomputed**, never predicted.
