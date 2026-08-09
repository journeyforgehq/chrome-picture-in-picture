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

Not copied from the decisions log — recomputed from disk, because the log's
prediction turned out to be one file wrong (see "Predicted but not yet drifted"
below).

```
node -e '
const fs=require("fs"),c=require("crypto");
const f=JSON.parse(fs.readFileSync(".factory.json","utf8"));
for(const [p,sha] of Object.entries(f.core)){
  const h=c.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  if(h!==sha) console.log("DRIFTED "+p);
}'
```

Run from the repo root on 2026-08-09:

```
DRIFTED (2):
  extension/e2e/billing.spec.ts
  extension/src/billing/plans.ts
MISSING (0):
UNCHANGED: 45 / 47
```

## Drifted files

| File | What changed | Why |
|---|---|---|
| `extension/src/billing/plans.ts` | Three-tier ladder (`monthly` $3.99/mo, `annual` $29/yr highlighted, `lifetime` $79 once) collapsed to a **single `lifetime` plan at `$9.99`, unit `once`**. The `PRICING RULE` doc comment was rewritten to say why the template's non-domination rule does not apply at one plan, and the "imported by popup + options" note now names options only. | Per-child pricing — arguably what this file is for. Inventory row 61; signed off 2026-08-07 ("Three-tier ladder → lifetime only, repriced $79 → $9.99"). The `Plan` union in `contract.ts` and all three `config.STRIPE_LINKS` keys are deliberately left intact, so re-adding a subscription later needs no contract or build-config change. |
| `extension/e2e/billing.spec.ts` | The money loop navigates `options.html` instead of `popup.html`; the tier assertion reads `[data-testid="tier-badge"]` instead of `getByText("Free"/"Pro")`; the `ProTool` / `LockedFeature` Layer-2 assertions are replaced by the options page's own Free-tier `Upgrade` affordance and a `test.fixme` parking the gating assertion for plan 2; screenshots renamed `popup-free.png`/`popup-pro.png` → `options-free.png`/`options-pro.png`. A `LOCAL DRIFT` note was added under the GENERATED banner. | This extension has no popup by design — the toolbar button *is* the feature (inventory row 15, signed off). The template's money loop asserts against a surface this child does not ship, so it had to move to the surface that does carry tier state. Inventory row 20. |

## Predicted but not yet drifted

| File | Status |
|---|---|
| `extension/e2e/harness/identity.ts` | **Still byte-identical to its recorded SHA.** Decision #67 predicted this would drift because `waitForDeviceId`'s doc comment explains the render race by citing `src/popup/popup.tsx`'s `useState<Tier>("free")`. That citation is still *correct*: `src/popup/popup.tsx` still exists and still does exactly that. It becomes stale only when the popup is deleted. Amend it in the deletion task, then add a row here. `src/options/options.tsx` has the byte-equivalent `useState<Tier>("free")`, so the comment's explanation survives the retarget verbatim. |

Everything else in the `core` map — including `extension/e2e/fixtures.ts`,
`extension/e2e/global-setup.ts`, `extension/e2e/harness/webhook.ts`,
`backend/src/billing/webhook.ts` and all of `src/ui-kit/` — is unchanged and
`sync-core` will accept an upstream bump for them cleanly.

Worth noting for the same reason: `e2e/restore.spec.ts` needed a lifetime
(`mode: "payment"`) checkout event, and `harness/webhook.ts`'s `checkoutCompleted`
hard-codes `mode: "subscription"`. Rather than drift a third CORE file, the
lifetime event is built locally inside `restore.spec.ts`, which is **not**
vendored. If the factory ever grows a `mode` option on `checkoutCompleted`, that
local builder should be deleted in favour of it.

## Operating rule from here

- `sync-core` will report drift on the two files above and refuse without
  `--force`. That is expected, not a failure.
- Before forcing, diff the incoming template version against this table. Anything
  the template changed *outside* the rows described here is a real upstream
  improvement and should be taken; the two changes above must be re-applied on
  top.
- Any new drift must be added to this table in the same commit that causes it.
