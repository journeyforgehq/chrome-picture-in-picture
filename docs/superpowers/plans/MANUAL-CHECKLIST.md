# Manual checklist — the part no tool can do

Everything here is manual **because automation cannot reach it**, not because
nobody got round to writing it. Each row names the reason.

The single reason that covers most of this sheet: **Playwright drives page
content, not browser chrome.** It cannot click a toolbar button, and
`chrome.action.onClicked.dispatch()` from the service worker carries no user
activation — which is precisely the thing being tested, since
`requestPictureInPicture()` fails with `NotAllowedError` without it. The
worker→frame gesture hop is therefore covered by **no automated layer in this
repo**. It was measured once, by hand, in a spike; this sheet is how it stays
measured.

Run the whole sheet on a build produced by `npm run build` (not `build:dev`),
against `extension/dist/`.

---

## Before you start

```
cd extension && npm run build
```

Then `chrome://extensions` → **Developer mode** on → **Load unpacked** →
select `extension/dist`.

---

| # | Step | Pass criterion | Why it cannot be automated |
|---|---|---|---|
| 1 | Load unpacked from `extension/dist`. | The card appears with the name **"Picture in Picture - Floating Video Player"**, the description below it, **no errors** and **no warnings** on the card. The permission line reads only *"Read and change your data on the site you're on when you click the extension"* — there must be **no** all-sites warning at install. | `chrome://extensions` is browser chrome; Playwright cannot read it. |
| 2 | Look at the toolbar icon at **1× display scaling**. | The 16px icon is distinguishable from its neighbours at a glance. **KNOWN FAIL TODAY:** `scripts/gen-icons.mjs` emits a flat `#1677ff` square with no glyph at all three sizes. It is legible but says nothing about picture-in-picture. `test/icons.test.ts` only proves the PNGs are valid, exactly as the decisions log warned. **Real artwork is still outstanding.** | Icon rendering at real DPI in a real toolbar is a compositor output; no headless surface reproduces it. |
| 3 | Repeat step 2 on a **2× (Retina/HiDPI)** display, or with `--force-device-scale-factor=2`. | The 32-device-pixel rendering of `icon-16.png` is not blurred to mush. Chrome downscales `icon-48` here, so a 48px asset that only reads at 48px will look muddy. | Same as 2. |
| 4 | Open a page with a **playing** video (YouTube, Vimeo, or `extension/e2e/fixtures/a01-plain.html` served over http). **Click the toolbar button.** | Chrome's floating picture-in-picture window appears with the video **playing** in it. | **The core gesture path.** No automation can click a toolbar button, and a dispatched `onClicked` has no user activation, so the real `requestPictureInPicture()` never runs under automation. |
| 5 | Inspect the floating window. | **No chrome at all** — no extension branding, no overlay, no watermark, no injected buttons. Only Chrome's own native controls. *This is the free tier's entire differentiator; anything drawn on that window is a product failure, not a cosmetic one.* | The PiP window is an OS-level always-on-top surface outside the page; it is not in any screenshot Playwright can take. |
| 6 | **Click the toolbar button again**, with the same tab focused. | The video returns to the page **and is still playing** (not paused, not restarted from 0:00). | Same as 4 — needs a second real gesture. |
| 7 | Press **`Alt+P`** on the same page (browser window focused). | Identical result to step 4: the video pops out. Press again → identical to step 6. | The shortcut is bound to `_execute_action`, so it routes through the same handler as the click — but the keystroke is delivered by the browser, not the page. |
| 8 | With the floating window focused (click it), press `Alt+P`. | **Nothing happens** — this is expected, and the options page says so ("It works while a browser window has focus"). Confirm the copy is not lying. | Focus lives in a non-browser surface. |
| 9 | Open a page with **no video at all** (e.g. `example.com`) and click the toolbar button. | A dark toast appears **bottom-right**, blue left border, reading *"No video found on this page."* It fades in, is dismissable by click and by `Esc`, and disappears on its own after ~4s. | The toast render is automated (`toast-visual.spec.ts` + `docs/superpowers/plans/final/`), but *reaching it via a real click* is not. |
| 10 | Click the toolbar button on `chrome://extensions` itself. | **No crash, no error badge.** The extension's icon **tooltip** changes to *"Chrome blocks extensions on this page."* (hover to read it). No toast — there is no page to draw into. | `executeScript` rejects on `chrome://`; both the rejection and the tooltip are browser-chrome behaviour. |
| 11 | Hover the toolbar icon on any ordinary page. | The tooltip reads **"Pop this video out (Alt+P)"**. | Tooltip text is browser chrome. |
| 12 | Right-click the icon → **Options** (or `chrome://extensions` → Details → Extension options). | The options page opens. The **browser tab title** reads *"Picture in Picture — Settings"* — not "Reference Extension". The heading, five rows (Keyboard shortcut / Support embedded players / Show status messages / Your plan / Restore purchase), the `Free` badge, `No plan`, `Upgrade`, the restore form and the privacy footer all render. | The tab title is browser chrome. (The rest is screenshotted in `final/real-options-*.png`.) |
| 13 | Toggle **Show status messages** off. Close the options page, reopen it. | The switch is **still off**. Then click the toolbar button on a video-less page → **no toast appears**. Turn it back on and confirm the toast returns. | Persistence across a page close is automatable; the *effect* on the toolbar-click path is not (step 9's constraint). |
| 14 | Click **Change shortcut**. | A new tab opens on `chrome://extensions/shortcuts` with this extension listed and `Alt+P` bound to the action. (It must be a real navigation — a dead link here would look identical in a screenshot.) | `chrome://` pages are unreachable to automation. |
| 15 | Toggle **Support embedded players** ON. | **Chrome's own permission bubble appears**, asking to allow access to *all sites*. Accept it. | **PERMANENTLY MANUAL.** A spike established this bubble is rendered out-of-process by the browser; it is not in the page's DOM, not in any frame, and no automation surface in Chrome exposes it. |
| 16 | After accepting in step 15, reload the options page. | The switch is **still on**. `chrome://extensions` → Details now shows site access for all sites. | Follows 15. |
| 17 | Go to `chrome://extensions` → Details → **Site access** → set back to *"On click"* (revoking all-sites). Reopen the options page. | The **Support embedded players** switch has flipped itself **off**, and embedded-player injection has stopped. *(This is the `chrome.permissions.onRemoved` listener in `background.ts`; a spike measured that Chrome does **not** auto-unregister the dynamic content script, so without that listener the script keeps running after the user believes they revoked it — which would make the store listing's central claim false.)* | Revocation happens in browser chrome. |
| 18 | Toggle **Support embedded players** ON, then **decline** the Chrome bubble. | The switch does **not** stay on (it is driven by persisted settings, which are only written on grant), and an info alert appears: *"Site access wasn't granted, so embedded players stay off…"*. | Follows 15. |
| 19 | Restart Chrome entirely with **Support embedded players** on, then load a page with an embedded player. | Embedded-player support still works. **UNVERIFIED BY ANY LAYER:** `background.ts` re-asserts registration in `chrome.runtime.onStartup`, but the spike could not settle whether registrations survive a restart — Chrome treated every relaunch of an unpacked extension as a fresh install and `onStartup` never fired. This row is the only thing that will ever settle it. | Requires a browser restart on an extension Chrome considers *installed*, which unpacked loading never is. |
| 20 | Click the toolbar button on a page whose video sits in a **cross-origin iframe that forbids PiP** (`allow="picture-in-picture"` absent). | The toast reads *"This embedded player doesn't allow picture-in-picture."* with an **amber** left border. | The `SecurityError` only arises from a real `requestPictureInPicture()` under a real gesture. |
| 21 | Open `chrome://flags`, disable picture-in-picture support, restart, then click the button on a page with a video. | The toast reads *"Picture-in-picture is turned off in this browser."*, amber border. | Same as 20, plus a browser-level flag. |
| 22 | Uninstall the extension. | If `UNINSTALL_URL` is configured for the build, the post-uninstall page opens with `?v=<version>` and **no device id** in the URL. (Unset in dev → nothing opens, which is also a pass.) | Uninstall is browser chrome. |

---

## What a failure on rows 4–7 means

Rows 4, 6 and 7 are the product. If any of them fails while the whole automated
suite is green, the most likely cause is the one the codebase is built around:
**something suspended before `requestPictureInPicture()`**, spending the
transient user activation. Check, in order:

1. `src/background/background.ts` — an `await` added above
   `chrome.scripting.executeScript` inside `chrome.action.onClicked`
   (`test/invariants.test.ts` guards this, but only against the source text).
2. `src/pip/entry.ts` — an `await` anywhere in `pipEntry`, or a helper hoisted
   out of its body (`test/injected-bundle.test.ts` guards the second against the
   shipped bundle).
3. The DevTools console **of the page**, not of the service worker: a
   `ReferenceError` there is the signature of a hoisted helper, and it produces
   exactly this symptom — the click does nothing and every test stays green.
