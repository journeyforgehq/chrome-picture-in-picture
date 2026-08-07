// The content-script `matches` in manifest.json is a NARROW placeholder
// (https://example.com/*) — widen it to your target sites. Re-add the
// "scripting" permission only if you call chrome.scripting. Each host/permission
// needs a justification in the CWS listing (see DEPLOY.md).

// Deliberate no-op content script. Its ONLY job in this plan is to exist as
// the subject the webpack separation guard protects (spec §18): it must
// NEVER import antd, @ant-design/*, or anything from a ui-kit/ directory.
// Real gated features (Plan 2b+) render their own UI without pulling the
// antd-based ui-kit into this bundle.

export const MARKER_ATTR = "data-picture-in-picture-present";

/** Set a presence marker on <html>. Idempotent. */
export function markPresent(doc: Document): void {
  doc.documentElement.setAttribute(MARKER_ATTR, "true");
}

// Runtime entry point — no-op beyond the marker. Guarded so importing this
// module under vitest/happy-dom (no `document` timing quirks) is safe.
if (typeof document !== "undefined") {
  markPresent(document);
}
