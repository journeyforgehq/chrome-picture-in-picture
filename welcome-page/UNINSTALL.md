# Uninstall feedback page

Chrome can open a URL the moment a user removes the extension — your single best
chance to learn *why*. Around **5–15%** of removers answer a one-question form, and
that feedback is some of the highest-signal you'll get. This template ships the page
(`/uninstall`) and the wiring; you add a Google Form.

## How it works

- The service worker registers the page via `chrome.runtime.setUninstallURL` (see
  `extension/src/background/background.ts` → `uninstallUrl()`), pointed at
  `config.UNINSTALL_URL`.
- On removal, Chrome opens `UNINSTALL_URL?v=<extension version>`. Only the version
  is appended — **never the deviceId or any identifier** (the API already exposes the
  user's IP to your server, so we keep the payload non-identifying).
- `welcome-page/src/pages/uninstall.tsx` renders a themed page that embeds your
  Google Form. With no form configured it falls back to a "reply by email" card, so
  the page is never broken.

## Setup (3 steps)

1. **Create the Google Form** — one question: *"Why did you uninstall?"* (a paragraph
   field). Simpler forms convert better; resist adding more questions.
2. **Embed it** — in the form: **Send → `<>` (embed) →** copy the `src` URL (it ends
   in `viewform?embedded=true`). Paste it into `welcome-page/src/content.ts`:
   ```ts
   uninstall: {
     formEmbedUrl: "https://docs.google.com/forms/d/e/FORM_ID/viewform?embedded=true",
     // ...
   }
   ```
3. **Point the extension at it** — host the welcome page and set, in the extension's
   `.env` (same domain as the welcome page, per the guideline):
   ```
   UNINSTALL_URL=https://your-site.com/uninstall
   ```

Ship it. Responses land in the form's linked Google Sheet.

## Optional: prefill the version into the form

To bucket feedback by release, add a short-answer "Version" question, use the form's
**"Get pre-filled link"** to find its field id (looks like `entry.123456789`), and set:
```ts
uninstall: { formVersionEntryId: "entry.123456789", /* ... */ }
```
The page then forwards the `?v=` Chrome appended into that field automatically.

## Notes

- The page pins a light surface so it stays readable regardless of the user's OS dark
  mode (Chrome opens it in whatever scheme the browser prefers).
- `formEmbedUrl: ""` (the default) ships the email fallback — safe to release before
  the form exists.
