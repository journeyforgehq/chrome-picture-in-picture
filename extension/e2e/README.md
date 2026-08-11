# E2E harness

Four loops, one per **external dependency** — not one per suite. That is the
rule `playwright.fixtures.config.ts`'s header states and it is why there is no
fifth config: before adding one, name the dependency it needs that none of these
already brings.

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

- **Fixtures (`npm run e2e:fixtures`)** — `playwright.fixtures.config.ts`. Needs
  **nothing**: the specs serve their own static pages from `e2e/serve.ts` on
  `localhost:3000` + `127.0.0.1:3001` (two real origins). No extension is
  loaded, so these are the fast loop.
  - `detection.spec.ts` — ~40 fixtures scored through `pipEntry({ dryRun: true })`
  - `gesture.spec.ts` — the real `requestPictureInPicture()` under a real click,
    plus the no-gesture control
  - `dpip-window.spec.ts`, `dpip-controls.spec.ts`, `dpip-fallback.spec.ts`,
    `dpip-geometry.spec.ts` — the Document PiP / Pro path, i.e. Group G below

### Group G — the Document PiP / Pro path

The design package (`02-architecture.md` §Group G) lists 12 scenarios for the
enhanced window. This is where each one is proved. **The canonical copy of this
table, with the reasoning, is the header of `e2e/dpip-window.spec.ts`** — this
is a mirror; if they disagree, that file wins.

| ID | Scenario | Proved by |
|---|---|---|
| G01 | `documentPictureInPicture` absent | `dpip-fallback.spec.ts` — "G01 — with documentPictureInPicture absent…" |
| G02 | `requestWindow()` rejects | `dpip-fallback.spec.ts` — "G02 — when requestWindow REJECTS…"; the toast half runs the real browser-produced result through the real `decideOutcome` |
| G03 | `inner` is exactly 400×225 | `dpip-window.spec.ts` — "G03 + G05 — the stylesheet crossed…", "G03 — the window RENDERS…"; `dpip-geometry.spec.ts` — "G03 — the S-12 correction…" |
| G04 | Oversize request is clamped | `dpip-geometry.spec.ts` — the oversize row **and** the zero-size row; both assert the argument that reached `requestWindow` |
| G05 | No scrollbars | `dpip-window.spec.ts` — "G03 + G05 — the stylesheet crossed…" (`overflow:hidden` on html + `scrollHeight === clientHeight` on both axes) and "G03 + G05 — the video fills the window…" (body) |
| G06 | Video moved, still playing, `currentTime` continuous | `dpip-window.spec.ts` — "G06 — the video MOVED…" and "G06 — the video keeps playing across the move…" |
| G07 | Closed → video home, `activePip` cleared | `dpip-window.spec.ts` — "G07 — restore puts the video back…" and "G07 — closing the window tells the worker…" (**carve-out 3**) |
| G08 | Resize → `GEOMETRY_CHANGED` + storage | `dpip-window.spec.ts` — "G08 — a resize of the real window…"; the `storage.local` half is worker-side, pinned in `test/background/registration-wiring.test.ts` (**carve-out 2**) |
| G09 | Re-open, same origin | `dpip-geometry.spec.ts` — "G09 — a resize is remembered…" |
| G10 | Re-open, different origin | `dpip-geometry.spec.ts` — "G10 — a DIFFERENT origin opens at its own size…", across both of `serve.ts`'s origins |
| G11 | Licence lapses mid-session | `test/pip/licence-lapse.test.ts` — a **unit** test on purpose: the row needs no window, the "mid-session" part is a worker-cache fact unreachable from a fixture page, and "no paywall" is a negative best proved structurally |
| G12 | In-window controls | `dpip-controls.spec.ts` — "G12 — the buttons ACT on the video…" plus the bar's style, reveal, focus ring and geometry. Seek and the full speed cycle are in `test/pip/enhance-controls.test.ts`: the fixture's canvas `captureStream` is a **live stream** and silently discards both `currentTime` and `playbackRate` |

**What a green run of this suite does NOT cover.** Three things, none of them
automatable:

1. **`requestWindow()`'s gesture requirement.** S-12 ran a no-gesture control in
   every arm — bundled Chromium and real Chrome, `viewport: null` and default —
   and `requestWindow` opened a window **every time** without user activation.
   Under automation the requirement is not enforced, so there is deliberately
   **no assertion anywhere** that touches it: one would pass for the wrong
   reason. S-10 measured it by hand (`NotAllowedError`); smoke sheet.
2. **A user-dragged resize.** `resize` is exercised programmatically (a real
   400×225 → 480×265 via `resizeBy` under a fresh click). Dragging an OS window
   frame is not automatable — Playwright's input goes to the page, not the
   window manager. The drag-burst debounce is pinned by
   `test/pip/enhance-resize.test.ts`; smoke sheet.
3. **Chrome firing `pagehide` on a closing Document PiP window.** The e2e drives
   `restore()` directly, because no automation can close a real PiP window. That
   `restore` is *registered* on `pagehide` is pinned by
   `test/pip/enhance-lifecycle.test.ts`; that Chrome *fires* it is assumed.
   Smoke sheet.

**The two guards that protect the paid tier, mutation-tested.** G03 and G05 are
the regression guards for S-10's and S-12's findings, so they were checked by
breaking the code they guard:

- **G05** — deleting `overflow:hidden` from `enhance.ts`'s CSS **fails** both G05
  tests, on the `overflow` assertions. It does *not* move
  `scrollHeight === clientHeight`: at 400×225 with the video sized to 100% there
  is nothing to overflow. Both halves are needed — `overflow` catches the
  declaration going missing, the scroll check catches the sheet not applying at
  all (an unstyled video lays out at its inline 640×360 and the page really does
  scroll).
- **G03** — removing `resizeBy` from `entry.ts` **does not fail** any G03 test in
  the browser, and not because the assertion is weak: on the build this suite
  runs, `requestWindow` already returns the requested content box (deficit 0), so
  the correction is a no-op and there is nothing to observe when it goes.
  `test/pip/entry-dpip.test.ts` caught it at once (3 failures) — it *simulates*
  the deficits S-12 measured (−52 on Chromium 131, −56 on Chrome 151).
  `dpip-geometry.spec.ts`'s "G03 — the S-12 correction…" now measures this
  build's deficit, prints it, and becomes a live guard on any build that has one.
  Do not drop the unit test on the strength of the browser one: a browser cannot
  be asked to produce a deficit.

`npm run e2e:dpip` runs just the Group G rows (`--grep @dpip`).

Two per-file `test.use` declarations are load-bearing in the specs that measure
window size (`dpip-window`, `dpip-controls`, `dpip-geometry`) and are documented
at length in `dpip-window.spec.ts`: `viewport: null`, because the PiP window
inherits Playwright's 1280×720 device-metrics override; and
`channel: "chromium"`, because the old headless shell has no window manager and
so discards `requestWindow`'s size *and* no-ops `resizeBy`. `dpip-fallback`
carries neither, deliberately — neither of its rows opens an enhanced window.

- **Live (`npm run e2e:live`, manual)** — `playwright.stripe-live.config.ts`, a
  documented stub for a human-driven real-purchase run using a real
  `stripe listen`. Not run in CI. Add specs under `e2e/live/`.

## Run

```bash
npm run e2e:install   # one-time: download Chrome-for-Testing
npm run e2e           # hermetic loop  (headed — see below)
```

### Headed is not a preference — `HEADLESS=1` does not work

Every loop that loads the extension must run **headed**. `HEADLESS=1` is still
read by `harness/extension.ts` and `granted-dist.ts`, and it still launches a
browser — but **no MV3 service worker ever starts**, so `waitForEvent(
"serviceworker")` times out and the run dies before the first assertion, with an
error that names the timeout rather than the cause.

Measured against the unmodified `dist/` on Playwright 1.49.1, both arms in one
run:

| | service workers | outcome |
|---|---|---|
| headed (control) | 1 — `chrome-extension://…/background.js` | ready in 604ms |
| `headless: true` | 0 | 15s timeout |

The control arm matters: without it a zero is equally consistent with a broken
`dist/`, and the harness would be blamed for a browser limitation.

This is **not caused by anything in this repo** — it is Chromium's headless mode
under Playwright 1.49. Consequences worth knowing before wiring CI:

- **CI must supply a display** (`xvfb-run -a npm run e2e`, or a runner with one).
  Headless is the usual CI default, so this will not fail over to "slower but
  working" — it will fail outright.
- The `HEADLESS=1` branch is dead code, deliberately left in place:
  `harness/extension.ts` is a CORE file vendored from `chrome-ext-factory`
  (`.factory.json`), so removing it here would register as drift. If a later
  Chromium starts extension workers headless, the switch is already wired.
- `e2e:fixtures` and `e2e:visual` load **no extension** and are unaffected —
  they drive `pipEntry` and the preview gallery in an ordinary page.

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
