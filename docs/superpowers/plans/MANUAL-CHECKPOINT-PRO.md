# Manual visual checkpoint — the Pro tier

**Task 20 of the Pro-tier plan. This is the last task, and it cannot be automated away.**

Everything an automated layer can prove is green: 469 unit tests, 77 fixtures, 8 visual,
12 granted, 12 hermetic billing. What follows is the set of things those layers
**structurally cannot see** — plus one measurement that automation actively reports
*wrong*.

Two builds are staged for you:

| Path | What it is |
|---|---|
| `extension/dist/` | the ordinary **free** build |
| `.dev-pro-dist/` | the same build with `DEV_PRO=true`, so the Pro rows unlock **without a purchase** |

Load whichever the step names via `chrome://extensions` → Developer mode → **Load unpacked**.

---

## Why each of these is here rather than in CI

| Check | Why no test can do it |
|---|---|
| §1 free window has no title bar | Chrome draws the native window; nothing in the page can measure its chrome |
| §2 enhanced window opens at the chosen size | Automation **can** measure this, and does — but the deficit it corrects is **0 on this build** (S-12 measured −52 on Chromium 131, −56 on Chrome 151). Your Chrome may differ, which is the point |
| §3 no scrollbars | Covered by G05 — but the competitor's 3.8 rating came from users *seeing* them, so look |
| §4 controls readable over real video | `toHaveCSS` proves colour, never legibility against moving content |
| §5 drag-resize is remembered | Playwright's input goes to the page, not the window manager. **Not automatable at all** |
| §6 restore leaves the page intact | The e2e drives `restore()` directly; that Chrome fires `pagehide` on a closing PiP window is **assumed, never measured** |
| §7 gesture requirement | **Automation reports this wrong.** S-12's no-gesture control succeeded in every arm — under automation `requestWindow` opens with no activation. Only a human can check the real rule |

---

## §1 — The free path must be untouched (load `extension/dist/`)

The whole product is positioned on the free window being chrome-free. If Pro has leaked
into the default, stop and report it — that is the failure this design exists to avoid.

- [ ] Go to a real site with a video (YouTube is fine). Click the toolbar icon.
- [ ] **A floating window opens with NO title bar and no origin text.**
- [ ] Press `Alt+P` (macOS: `⌥P`) — it toggles the same way.
- [ ] Open the options page. The four Pro rows are visible but **dimmed and non-interactive**, with one **Unlock** button sitting in its own band *above* them — not across the "Remember the size for each site" text and not over the size dropdown's value. (That band exists because it did overlap both, and only a screenshot caught it.)
- [ ] Screenshot → `docs/superpowers/plans/final-pro/free-native-window.png`

## §2 — The enhanced window opens at the size you chose (load `.dev-pro-dist/`)

- [ ] Options page → the Pro rows are now **live**, full opacity, no Unlock button.
- [ ] Turn **Enhanced window** on. Leave size at **Medium · 400×225**.
- [ ] Click the toolbar icon on the same video.
- [ ] **Measure the window.** In its own console (right-click inside it → Inspect):
      `[innerWidth, innerHeight, outerWidth, outerHeight]`
      → **inner must be exactly `[400, 225]`.**
      Record `outer` too, and note your Chrome version — it is a fourth data point for S-12.
- [ ] The 34px title bar shows the site's **domain**. This is the disclosed cost, not a bug.
- [ ] Screenshot → `final-pro/enhanced-window-medium.png`

## §3 — No scrollbars

- [ ] Look at all four edges of the enhanced window. **No scrollbar, no white gutter, no frame around the video.**
- [ ] In its console: `document.documentElement.scrollHeight === document.documentElement.clientHeight` → `true`

## §4 — In-window controls, over real moving video

- [ ] Hover the window. The control bar fades in over the bottom of the video.
- [ ] **Read it.** Buttons legible against the scrim while the video plays underneath? Time readable? Anything colliding with the title bar?
- [ ] Click ❚❚ — video pauses, glyph becomes ▶.
- [ ] Click **+10s** and **−10s** — playback actually moves. *(The e2e cannot prove this: the fixture's canvas stream is a live stream and silently discards `currentTime`. This is the only place seek is genuinely exercised.)*
- [ ] Click the speed button through `1.25 → 1.5 → 2 → 0.5 → 1`.
- [ ] Turn **Subtitles** on in options, reopen on a video that has captions, confirm cues appear **above** the bar, not behind it.
- [ ] Screenshot with the bar visible → `final-pro/enhanced-controls.png`

## §5 — Size remembered per site (NOT AUTOMATABLE)

- [ ] **Drag the window's corner** to roughly 640×360.
- [ ] Close it. Click the toolbar icon again on the same site.
- [ ] **It reopens at the dragged size**, not at Medium.
- [ ] Go to a **different site** with a video. Open the enhanced window.
- [ ] **It opens at Medium** — that origin's own size — not the dragged one.
- [ ] Back on the first site: still the dragged size.
- [ ] Now turn **"Remember the size for each site" OFF**, and reopen on the first site.
      **It must open at the preset**, and turning the switch back on must restore the
      remembered size — the entry is ignored, never deleted.

## §6 — Close restores the page (NOT MEASURED ANYWHERE)

- [ ] With the enhanced window open, **close it with its own X**.
- [ ] The video returns **to its place in the page**, still playing.
- [ ] **The site's layout is intact** — the player is not stranded at the bottom of `<body>`, not resized, not stretched. Scroll the page and confirm.
- [ ] Click the toolbar icon again — it opens normally (proving `activePip` was cleared, so the click was not swallowed as an "exit").
- [ ] Screenshot of the restored page → `final-pro/restored-page.png`

## §7 — The gesture requirement (THE ONE AUTOMATION GETS WRONG)

S-10 measured by hand that `requestWindow()` without user activation throws
`NotAllowedError`. S-12 then measured that **under automation it succeeds anyway** — a
no-gesture control opened a window in every arm, bundled Chromium and real Chrome alike.
So no test asserts it, deliberately: the assertion would pass for the wrong reason.

- [ ] In the **page's** console (not the PiP window's), with nothing clicked, run:
      ```js
      documentPictureInPicture.requestWindow({ width: 400, height: 225 })
      ```
- [ ] **Expected: `NotAllowedError`.**
- [ ] If it *opens a window*, S-10's finding has changed in your Chrome build — say so. It would mean the carve-out in `e2e/README.md` is stated too strongly, and it bears on open question **S-13**.

## §8 — Both viewports for the options page

- [ ] Options page at a wide window and narrowed to ~375px.
- [ ] At 375px: no horizontal scrollbar; the size dropdown reads **"Medium · 400×225"** in full (it truncated to "Medium · 4…" before it was widened); "Remember the size for each site" appears **below** the dropdown, not above it.
- [ ] Screenshots → `final-pro/options-desktop.png`, `final-pro/options-mobile.png`

---

## Recording the result

Write what you **saw**, not what you expected, into `final-pro/NOTES.md` — one line per
numbered check. This project's founding rule is that an instrument which does not report
its own conditions will eventually report a defect in itself as a fact about the world;
the same applies to a human checklist ticked from memory.

**If anything fails, do not fix it here.** Report it — the plan's remaining open items are
already tracked, and a fix made at checkpoint time skips the review the other 19 tasks got.

## Still open, and not fixable in this session

| Item | Blocks |
|---|---|
| **The side-by-side comparison image (Task 15)** — two screenshots, native and enhanced, on the same video at the same size, composited. Chrome permits only one PiP surface at a time, so **no live demo can ever show both**; it must be captured by hand and shipped as a static asset. `scripts/check-assets.mjs` fails the release until it exists | Release |
| `__DOMAIN__`, three KV ids, `BACKEND_BASE_URL`, the Stripe lifetime link | Release (`preflight.mjs` is red on all six) |
| Staging run never executed | `STAGING-RUNBOOK.md` §8 |
| **S-13** — does `requestWindow` enforce activation across the worker hop? Task 18's enhanced-window test went red under the INVARIANT 1 mutation, which contradicts S-12 | Nothing; it sharpens a carve-out |
| Port 8788 collides with sibling projects on this machine — three false failures this session | CI reliability; fix belongs upstream in `chrome-ext-factory` |
