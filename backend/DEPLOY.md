# Deploy Guide

This backend deploys as **two workers from one repo** via wrangler named
environments: `--env staging` and `--env production`. Top-level config is the
legacy/default (`wrangler deploy` with no `--env`); prefer the env-scoped scripts.

## One-time setup (per env)
1. **Create separate KV namespaces** (staging seeding must never touch prod data):
   ```bash
   wrangler kv namespace create PAID_staging      # → prints an id
   wrangler kv namespace create PAID_production    # → prints an id
   ```
   Paste the ids into `wrangler.toml` under `[[env.staging.kv_namespaces]]` /
   `[[env.production.kv_namespaces]]`, replacing `REPLACE_WITH_STAGING_KV_ID` /
   `REPLACE_WITH_PROD_KV_ID`.
2. **Fill `deploy.targets.json`** with each deployed worker's URL
   (`https://<worker-name>-staging.<subdomain>.workers.dev`, and `-production`).
3. **Set secrets per env** (never committed):
   ```bash
   wrangler secret put HEALTH_TOKEN --env staging          # distinct value per env
   wrangler secret put HEALTH_TOKEN --env production
   wrangler secret put STRIPE_SECRET_KEY --env staging       # test-mode key
   wrangler secret put STRIPE_SECRET_KEY --env production     # LIVE key
   wrangler secret put STRIPE_WEBHOOK_SECRET --env staging
   wrangler secret put STRIPE_WEBHOOK_SECRET --env production
   # staging-only test affordances (Phase 3b) — NEVER set on production:
   wrangler secret put E2E_SEED_SECRET --env staging
   # (+ OPENROUTER_KEY / DATAFORSEO_AUTH per env where the backend uses them)
   ```

## Per-env config matrix (this IS the safety boundary)
| | STAGING | PROD |
|---|---|---|
| `E2E_SEED_SECRET` ᴮ | **set** → `/__test__/*` live | **unset** → `/__test__/*` 404 |
| `TEST_LIMITS_JSON` ᴮ | set (tiny limits) | unset |
| Stripe keys | **test** mode | **live** mode |
| `HEALTH_TOKEN` | set | set (distinct value) |
| KV namespace | staging id | prod id |
| Upstream keys | real (test quota ok) | real (prod) |

> ᴮ **Not yet wired — Phase 3b.** The worker does not implement `/__test__/*` or read
> `TEST_LIMITS_JSON` yet, so setting these secrets has no effect until Phase 3b lands.
> They're documented here so the per-env secret setup is done once.

## Health / deploy gate
- Public shallow: `GET /health` → `{ ok, version, configOk }`.
- Deep (guarded): `GET /health/summary?token=<HEALTH_TOKEN>&fresh=1` (`fresh=1` bypasses the 60s cache).
- The deploy scripts chain the gate: `wrangler deploy --env X && npm run health:check -- --env X --token "$HEALTH_TOKEN"`.
  A non-`ok` status exits non-zero → the deploy step fails (CI red). Broken/missing
  Stripe/KV/upstream credentials fail the deploy the moment the worker serves.
- Standalone: `npm run health:check -- --env staging --token "$HEALTH_TOKEN"`.

## Deploy
`HEALTH_TOKEN` is **per-env** (distinct values) — re-export it to match the env you're
deploying, or the post-deploy health gate 401s and fails the deploy.
```bash
export HEALTH_TOKEN=<staging token>     # the value you set via `wrangler secret ... --env staging`
npm run deploy:staging                  # wrangler deploy --env staging + health gate

export HEALTH_TOKEN=<production token>   # swap to the production token before deploying prod
npm run deploy:production                # manual, promotes the tested commit/tag
```

## Promotion
- **STAGING**: auto on push to `main` (CI) → health gate → full seeded + acceptance suites.
- **PROD**: manual (`workflow_dispatch`/tag, required-approval GitHub Environment) →
  deploys the **exact commit already green on staging** → health gate → prod acceptance.
- Stronger (PROD): preview-first — `wrangler versions upload` → health-check the preview
  URL → `wrangler versions deploy` only if `ok`. (Confirm `wrangler versions` syntax at use.)
