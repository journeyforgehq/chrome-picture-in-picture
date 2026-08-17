# Staging runbook — Picture in Picture

Running the money-path e2e suite against a **deployed** Cloudflare Worker.

`extension/e2e/STAGING.md` is the factory's generic contract and stays authoritative for
the harness. This file is the child-specific part: what this worker is called, what is
still unfilled, and **what has never been exercised against a real deployment.**

> **Status 2026-08-09: never run.** The machinery came with the scaffold and has been
> verified only to *collect* (12 tests across 7 files) and to *fail fast* when
> unconfigured. No worker is deployed, so nothing here has executed.

---

## 1. What actually needs staging, and what does not

Only the money path touches a worker. Everything the extension's own product does is
backend-independent **by design**, and that is not an accident — it is why the detection
suite can be fast and hermetic.

| Suite | Command | Needs a worker? |
|---|---|---|
| 47 detection fixtures | `npm run e2e:fixtures` | **No** — serves its own two origins |
| 8 visual specs | `npm run e2e:visual` | **No** — serves the preview gallery |
| Gesture e2e | part of `npm run e2e` | **No** — drives `pipEntry` in a page |
| **12 money-path specs** | `npm run e2e` / `npm run e2e:staging` | **Yes** |
| 310 unit tests | `npm test` | No |

So a red staging run says something about **billing**, never about picture-in-picture.
Do not let a staging failure block a detection or UI change.

---

## 2. Blockers, as of this writing

`node scripts/preflight.mjs` is red on precisely the values staging needs:

```
✗ backend/wrangler.toml: REPLACE_WITH_KV_ID
✗ backend/wrangler.toml: REPLACE_WITH_STAGING_KV_ID     ← this one gates staging
✗ backend/wrangler.toml: REPLACE_WITH_PROD_KV_ID
✗ welcome-page/src/content.ts: __DOMAIN__
✗ extension/.env: BACKEND_BASE_URL is empty
✗ extension/.env: no STRIPE_ANNUAL_URL or STRIPE_LIFETIME_URL
```

Only the **staging KV id** blocks `npm run e2e:staging`. The others block a shippable
build, not a staging test run. `predeploy:staging` runs `check-placeholders.mjs --env
staging`, which is scoped to the `[env.staging]` block — so the two unrelated KV
placeholders will not stop a staging deploy.

---

## 3. One-time setup

Worker name is `picture-in-picture` (`backend/wrangler.toml`). Named environments suffix
it automatically, so the staging worker is **`picture-in-picture-staging`**.

**3.1 — Create a staging KV namespace and paste its id**

```bash
cd backend && npx wrangler kv namespace create PAID --env staging
```

Paste the returned id into `[[env.staging.kv_namespaces]] → id`, replacing
`REPLACE_WITH_STAGING_KV_ID`. **Use a namespace that is not production's** — the suite
writes `cust:`, `paid:` and canceled-sub keys.

**3.2 — Set the two worker secrets**

```bash
cd backend
npx wrangler secret put E2E_SEED_SECRET --env staging
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
```

- `E2E_SEED_SECRET` unlocks `/__test__/seed` and `/__test__/reset`. `src/test-mode/router.ts`
  404s every `/__test__/*` path unless this is configured, and a wrong secret is
  indistinguishable from a nonexistent route.

  **Still, do not set it on production** — but note the safety here is stronger than that
  discipline. The router opens with `if (environment === "production") return notFound()`,
  *before* it looks at the secret at all. Test-mode is unreachable on prod even if the
  secret bleeds there through a copy-paste or a shared secret store. It is a **code
  invariant, not an operational rule** — which is the right way round, because operational
  rules are the ones that get skipped at 2am.
- `STRIPE_WEBHOOK_SECRET` is the worker's **real test-mode** Stripe signing secret, so real
  checkout stays testable on the same worker. The suite forges events signed with the same
  value; if they disagree the grant probe 400s.

**3.3 — Deploy**

```bash
cd backend && HEALTH_TOKEN=<token> npm run deploy:staging
```

That runs the placeholder guard, deploys, then `health:check --env staging`, which curls
`/health/summary?token=…&fresh=1` and exits non-zero unless `status === "ok"`. A green
deploy therefore already proves the worker is up and its config is sane.

---

## 4. Run

```bash
cd extension
STAGING_BACKEND_URL="https://picture-in-picture-staging.<subdomain>.workers.dev" \
E2E_SEED_SECRET="<same value you set on the worker>" \
STAGING_STRIPE_WEBHOOK_SECRET="<the worker's STRIPE_WEBHOOK_SECRET>" \
npm run e2e:staging
```

**Expected: 12 passed, 0 skipped.** Any skip is now a symptom, not a known state. The
four `PLAN 2:` fixmes that used to account for `4 skipped` were un-parked once the
options page grew the four Pro rows: `LockedFeature`'s gating assertions have a
production mount, so they run as ordinary tests on staging exactly as they do locally.
If you are reading an older note that says `8 passed, 4 skipped`, it predates that.

`globalSetup` does **not** spawn wrangler on staging. It calls `resetStaging()` and then a
grant probe: forge a `checkout.session.completed`, confirm `/me` reports pro. If that probe
fails, no spec runs — which is the right shape, because every downstream assertion would
otherwise fail for the same reason and bury the cause.

---

## 5. What has never been exercised against a real worker

**Read this before trusting a first green run, and before diagnosing a first red one.**

**5.1 — All six billing specs were repointed off a deleted surface.** This build removed
the popup; `billing`, `identity`, `grace`, `dunning-refund`, `renewal-cascade` and
`restore` used to read tier state from `popup.html` and now read it from `options.html`
and its `[data-testid="tier-badge"]`. They were verified **only against local
`wrangler dev`**. The repoint is backend-agnostic in principle — same flows, different
page — but the first staging run is the first time that is actually true rather than
argued.

**5.2 — The lifetime-only path is new, and the backend derives the plan label from the
checkout *mode*, not the plan id.** `backend/src/billing/webhook.ts` maps subscription →
`"annual"`, anything else → `"lifetime"`, and sets `periodEnd: null` only for lifetime.
Until this build `restore.spec.ts` asserted the literal `"Annual"` — a label a single
$9.99 lifetime plan **can never produce**. It now drives a `mode: "payment"` event and
asserts `"Lifetime" + "Active"`. That correction has only ever met a local worker.

If exactly `restore.spec.ts` fails on staging while the other five pass, look here first.

**5.3 — `PLANS` is one plan.** `plans.ts` is CORE-vendored and deliberately drifted
(recorded in `core-drift.md`). A `sync-core` that reverted it would restore the three-tier
ladder and break the lifetime assertions — with a symptom that looks like a backend bug.
Check `git diff` on `src/billing/plans.ts` before blaming the worker.

**5.4 — The four Pro-gating tests are new and have only met a local worker.** They are
the ones that used to be the `4 skipped`. They assert a *rendered* consequence of the
entitlement — `getByLabel("Enhanced window")` disabled via its ancestor `<fieldset>`,
that fieldset's computed `opacity: 0.5`, and the `Unlock` button — rather than the tier
badge's text, so they fail on a class of bug the other eight cannot see: a cascade that
updates the badge but leaves the feature usable.

They are also the ones most likely to fail for a **non-billing** reason, because they
depend on `OptionsView`'s `LockedFeature` mount as well as on `/me`. Discriminator: if
the tier badge assertions in the same file pass and only the gating ones fail, the
worker is fine and the options page changed.

---

## 6. Triage

| Symptom | Almost certainly |
|---|---|
| `TARGET=staging requires STAGING_BACKEND_URL` | env var missing. Zero tests collect — this is the fail-fast working |
| Grant probe: `device not pro after grant` | `STAGING_STRIPE_WEBHOOK_SECRET` ≠ the worker's `STRIPE_WEBHOOK_SECRET`, so the forged signature is rejected |
| Every `/__test__/*` 404s | `E2E_SEED_SECRET` not set **on the worker** (setting it only in the shell is not enough) |
| `restore.spec.ts` alone fails on the plan label | §5.2 — the mode→label derivation |
| All six fail on `tier-badge` not found | §5.1 — the options-page repoint, not the backend |
| Any skip at all | **Not** correct any more. The four `PLAN 2:` fixmes were un-parked; a skip means a `test.fixme`/`test.skip` crept back in, or a `--grep` is set |
| The four Pro-gating tests fail on `opacity` or `toBeDisabled` | The options page's `LockedFeature` mount, not the worker — the tier badge would be failing too if it were billing |
| Deploy refused before uploading | `check-placeholders.mjs` — the `[env.staging]` KV id is still `REPLACE_WITH_STAGING_KV_ID` |

---

## 7. Housekeeping

Determinism comes from per-run-unique ids (`RUN_ID` in `harness/config.ts`), **not** from
wiping KV — so runs are safe to repeat and safe to run concurrently. The cost is that
stale `cust:` / `paid:` / canceled-sub keys accumulate on the staging namespace. Harmless,
since every run uses fresh ids; purge periodically if you want it tidy.

`backend` has a `pretest` guard (`guard-no-kv-delete.mjs`) that blocks KV-delete calls
from entering the codebase. Do not work around it to "clean up" staging — deleting keys is
exactly the operation that would make a concurrent run flaky.

---

## 8. First-run checklist

- [ ] Staging KV namespace created; id pasted into `[env.staging]`
- [ ] `E2E_SEED_SECRET` set on the **staging** worker — and confirmed **absent** on production
- [ ] `STRIPE_WEBHOOK_SECRET` set on the staging worker (real test-mode value)
- [ ] `npm run deploy:staging` green, including its `health:check`
- [ ] `npm run e2e:staging` → **12 passed, 0 skipped**
- [ ] If green: record the worker URL and the run date here, and note that §5's three
      never-exercised paths are now exercised
- [ ] If red: triage with §6 **before** changing any test — five of the twelve specs were
      modified in this build and the sixth had a wrong assertion, so a failure is at least
      as likely to be ours as the worker's
