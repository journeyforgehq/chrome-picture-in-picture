# E2E harness

Two loops:

- **Hermetic (default, `npm run e2e`)** — fully offline and deterministic.
  `global-setup.ts` builds `dist/` with `BACKEND_BASE_URL` pointed at a local
  `wrangler dev` worker (port 8788, wiped KV), then Chrome-for-Testing loads the
  unpacked extension. Stripe is never called: `harness/webhook.ts` signs webhook
  events with the same test secret the worker verifies against, so
  `billing.spec.ts` drives grant → pro → revoke → re-lock end to end.
  - `health.spec.ts` — worker up + dist built
  - `popup-loads.spec.ts` — popup Free, pro tool locked
  - `identity.spec.ts` — device id generated, cached tier free
  - `billing.spec.ts` — the full billing loop (writes screenshots to `__screens__/`)

- **Live (`npm run e2e:live`, manual)** — `playwright.stripe-live.config.ts`, a
  documented stub for a human-driven real-purchase run using a real
  `stripe listen`. Not run in CI. Add specs under `e2e/live/`.

## Run

```bash
npm run e2e:install   # one-time: download Chrome-for-Testing
npm run e2e           # hermetic loop
HEADLESS=1 npm run e2e   # headless-new (CI)
```

## Notes

- The extension has **no `host_permissions`**; cross-origin `/me` works because
  the worker returns `Access-Control-Allow-Origin: *` (`backend/src/billing/http.ts`).
- `ENVIRONMENT=production` + `DEV_FORCE_PRO=0` (both pinned via `--var`) ⇒ the
  real billing path runs (no dev-force-pro short-circuit, enforced explicitly so
  a stray env or scaffold edit can't turn every device pro). For pro UI *without*
  a purchase, build with `DEV_PRO=true` instead of seeding cache.
- Port 8788 is used so it never clashes with `npm run dev`'s worker (8787).
- **Local mode only — never `--remote`.** `wrangler dev` runs locally, so the
  placeholder `wrangler.toml` `name`/KV `id` are ignored (KV is bound by the
  `PAID` binding name). Running `--remote` would require a real deployed worker
  and KV namespace and is not supported by this harness.
