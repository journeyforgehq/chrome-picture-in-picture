# E2E harness

Two loops:

- **Hermetic (default, `npm run e2e`)** — fully offline and deterministic.
  `global-setup.ts` builds `dist/` with `BACKEND_BASE_URL` pointed at a local
  `wrangler dev` worker (port 8788, wiped KV), then Chrome-for-Testing loads the
  unpacked extension. Stripe is never called: `harness/webhook.ts` signs webhook
  events with the same test secret the worker verifies against, so
  `billing.spec.ts` drives grant → pro → revoke → re-lock end to end.
  - `health.spec.ts` — worker up + dist built (options.html, content.js, background.js)
  - `identity.spec.ts` — device id generated, cached tier free
  - `billing.spec.ts` — the full billing loop (writes screenshots to `__screens__/`)
  - `grace.spec.ts` — 7-day offline grace keeps Pro on a fresh cache
  - `dunning-refund.spec.ts` — past_due keeps Pro + shows the nudge; refund revokes
  - `renewal-cascade.spec.ts` — two independent installs renewed and revoked together
  - `restore.spec.ts` — restore a lifetime purchase onto a second device by email

  There is **no popup**: the toolbar button is the feature, so every spec above
  that needs to read tier state does it on `options.html` via
  `[data-testid="tier-badge"]`. Four `test.fixme` tests named `PLAN 2: …` are
  parked, not broken — they hold the Pro-gating assertions until the paid tier
  adds a gated surface to assert against.

- **Granted-permission (`npm run e2e:granted`)** —
  `playwright.granted.config.ts`. Needs one thing nothing else brings: a loaded
  extension with `<all_urls>` **already granted**. Its `globalSetup` builds
  `dist/` and mirrors it to `.tmp-granted-dist/` with the host permission
  promoted from optional to required, because `chrome.permissions.request()`
  cannot be driven under automation (the consent bubble is out-of-process and a
  spike measured the call never settling). `src/static/manifest.json` is never
  touched — `test/manifest.test.ts` pins the real allowlist.
  - `arbitration.spec.ts` — the WRITE side of `window.__pipCoord`: content
    script scores, worker ranks frames by `sender.frameId`, verdict comes back
    per frame via `tabs.sendMessage(…, { frameId })`. Asserts that **exactly
    one** frame ends up `isWinner: true`.
  - `registration.spec.ts` — `chrome.scripting.registerContentScripts` against
    the real API: register → visible → actually running in both frames →
    unregister → gone and no longer running on a fresh load; plus both
    idempotency guards, and a re-measurement of the duplicate-id /
    nonexistent-id rejections that `test/background/registration.test.ts`'s
    stub is built on.

  **These prove the machinery under a granted permission, not the granting.**
  Nothing here exercises `chrome.permissions.request()`, the consent bubble, or
  `permissions.onRemoved` (which cannot be made to fire under automation — the
  wiring for it is asserted in `test/background/registration-wiring.test.ts`
  against the shipped bundle instead).

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
