# Running the money-path e2e suite against a deployed staging worker

The template suite runs locally by default (`npm run e2e`, spawns `wrangler dev`).
`TARGET=staging` instead points it at an already-deployed worker.

## One-time worker setup (per instantiated extension)
- Deploy the staging worker (`wrangler deploy --env staging`).
- Set secrets on that worker:
  - `E2E_SEED_SECRET` — guards `/__test__/*` (used by the setup reset probe).
  - `STRIPE_WEBHOOK_SECRET` — the worker's **real test-mode** Stripe signing secret
    (keeps real checkout testable on the same worker).

## Run
```bash
STAGING_BACKEND_URL="https://<worker>.<subdomain>.workers.dev" \
E2E_SEED_SECRET="<same value set on the worker>" \
STAGING_STRIPE_WEBHOOK_SECRET="<the worker's STRIPE_WEBHOOK_SECRET>" \
npm run e2e:staging
```

## Contract
| Env var | Required on staging | Meaning |
|---|---|---|
| `STAGING_BACKEND_URL` | yes (setup throws if unset) | deployed worker base URL |
| `E2E_SEED_SECRET` | yes (setup throws if unset) | must equal the worker's `E2E_SEED_SECRET` |
| `STAGING_STRIPE_WEBHOOK_SECRET` | yes in practice | must equal the worker's `STRIPE_WEBHOOK_SECRET`, or the grant probe 400s |

Determinism on the persistent staging KV comes from per-run-unique ids (`RUN_ID` in
`harness/config.ts`); no KV wipe or dedicated namespace is required. Per-run ids mean stale
test keys (`cust:`/`paid:`/canceled-sub) accumulate on the staging KV over time — harmless
(each run uses fresh ids), but purge the namespace periodically if you want it tidy.
