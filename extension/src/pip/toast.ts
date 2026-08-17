/* ============================================================================
 * showToast — THE ONLY UI THIS EXTENSION EVER DRAWS. READ BEFORE TOUCHING.
 * ============================================================================
 *
 * There is no popup. This toast is the entire channel the product has for
 * telling a user why nothing happened, and it is shipped into the page by
 *   chrome.scripting.executeScript({ func: showToast })
 * which serializes it with Function.prototype.toString() and evaluates the
 * SOURCE TEXT inside the target frame. Same rule as pipEntry:
 *
 * 1. NO OUTSIDE IDENTIFIERS. The body may not reference anything declared
 *    outside itself — no imports, no module-level constants, no helpers, no
 *    closure variables. TypeScript compiles such a reference happily and the
 *    user gets a ReferenceError in their browser. Every helper lives inside
 *    the body. (Types are erased before .toString() ever sees the source, so
 *    the interface above is fine.)
 *
 * 2. THE SHADOW ROOT AND ITS adoptedStyleSheets SHIP TOGETHER. Creating the
 *    boundary in one place and styling it in another is the single most
 *    common source of "every test passes, nothing renders" — the CSS never
 *    crosses. attachShadow(), new CSSStyleSheet(), replaceSync() and the
 *    adoptedStyleSheets assignment are four consecutive statements below and
 *    they stay that way.
 *
 * 3. IT IS A SHADOW ROOT, NOT A STYLESHEET FILE — AND NOT FOR CSP REASONS.
 *    An early spike assumed a <link> to an extension stylesheet would be
 *    blocked by a strict page CSP. That assumption was measured and it was
 *    WRONG: content scripts run in an isolated world and are CSP-exempt; all
 *    three candidate approaches rendered fine under a strict policy. The
 *    shadow root won for two different reasons — it exposes no
 *    web_accessible_resource (less extension-fingerprinting surface), and the
 *    boundary isolates the toast from the page's own aggressive CSS. Do not
 *    "simplify" this back to a stylesheet.
 * ==========================================================================*/

export interface ShowToastOptions {
  text: string;
  severity: "info" | "blocked";
  /** 'body' (default) appends to document.body. 'detached' returns the host
   *  unattached so a caller — the preview gallery — can place it itself. */
  mount?: "body" | "detached";
}

export function showToast(options: ShowToastOptions): HTMLElement {
  const detached = options.mount === "detached";
  const accent = options.severity === "blocked" ? "#d48806" : "#1677ff";

  // Replace, never stack: one toast at a time is the whole vocabulary.
  if (!detached) {
    const previous = document.querySelectorAll("[data-pip-toast]");
    for (let i = 0; i < previous.length; i++) {
      const node = previous[i];
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }

  const host = document.createElement("div");
  host.setAttribute("data-pip-toast", "");
  // No tabindex, ever: the toast is announced, it is never focused.
  host.style.cssText = detached
    ? "position:relative;"
    : "position:fixed;right:16px;bottom:16px;z-index:2147483647;";

  // --- boundary + styling, together (rule 2 in the header) --------------
  const root = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(
    // `.toast` MUST stay the first rule: test/pip/toast.test.ts reads
    // adoptedStyleSheets[0].cssRules[0] to prove the accent shipped.
    ".toast{" +
      "box-sizing:border-box;" +
      "background:#1b1f27;" +
      "color:#e8ecf2;" +
      "font:13px/1.45 system-ui, -apple-system, sans-serif;" +
      "padding:10px 14px;" +
      "border-radius:6px;" +
      "border-left:3px solid " +
      accent +
      ";" +
      "box-shadow:0 4px 14px rgba(0,0,0,.35);" +
      "max-width:260px;" +
      "cursor:pointer;" +
      "animation:pip-toast-in 160ms ease-out both;" +
      "}" +
      "@keyframes pip-toast-in{" +
      "from{opacity:0;transform:translateY(6px)}" +
      "to{opacity:1;transform:none}" +
      "}" +
      // The entry animation is opt-out, not opt-in: anyone who asked their OS
      // for less motion gets the toast placed, not slid.
      "@media (prefers-reduced-motion: reduce){.toast{animation:none}}"
  );
  root.adoptedStyleSheets = [sheet];
  // ----------------------------------------------------------------------

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = options.text;
  root.appendChild(toast);

  if (detached) return host; // the gallery owns placement and teardown

  document.body.appendChild(host);

  let dismissed = false;
  let timer = 0;
  const onKeyDown = function (event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    dismiss();
  };
  const dismiss = function (): void {
    if (dismissed) return;
    dismissed = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("keydown", onKeyDown, true);
    if (host.parentNode) host.parentNode.removeChild(host);
  };

  host.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKeyDown, true);
  timer = setTimeout(dismiss, 4000) as unknown as number;

  return host;
}
