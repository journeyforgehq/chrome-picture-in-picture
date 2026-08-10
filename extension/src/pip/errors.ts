// The toast is the ONLY feedback channel in this product (there is no popup),
// so this map is the entire vocabulary the extension has for saying "no".

export const PIP_ERROR_CODES = [
  "NO_VIDEO",
  "NOT_READY",
  "SITE_DISABLED",
  "IFRAME_BLOCKED",
  "PIP_UNAVAILABLE",
  "PIP_REFUSED",
  "RESTRICTED_URL",
] as const;

export type PipErrorCode = (typeof PIP_ERROR_CODES)[number];

/** `blocked` = the site or browser said no. `info` = we found nothing to do.
 *  `tooltip` = no page to render into, so the icon tooltip is the only channel. */
export type PipSeverity = "info" | "blocked" | "tooltip";

/* PIP_UNAVAILABLE vs PIP_REFUSED — two different facts, deliberately not one
 * code. entry.ts checks `document.pictureInPictureEnabled` and returns the
 * `pip-unavailable` REASON *before* it ever calls the API, so by the time a
 * NotAllowedError comes back from that call, picture-in-picture was definitely
 * ENABLED and the request was refused for some other cause — overwhelmingly a
 * lost user activation. Telling that user "picture-in-picture is turned off in
 * this browser" is false, and it is a dead end besides: Chrome's toggle lives in
 * chrome://flags, which most people will never find. PIP_REFUSED says only what
 * we can verify and names a next step that actually works.
 */
const MESSAGES: Record<PipErrorCode, string> = {
  NO_VIDEO: "No video found on this page.",
  NOT_READY: "This video hasn't loaded yet. Press play, then try again.",
  SITE_DISABLED: "This site has turned off picture-in-picture for this video.",
  IFRAME_BLOCKED: "This embedded player doesn't allow picture-in-picture.",
  PIP_UNAVAILABLE: "Picture-in-picture is turned off in this browser.",
  PIP_REFUSED: "Couldn't open the floating window. Click the icon and try again.",
  RESTRICTED_URL: "Chrome blocks extensions on this page.",
};

const SEVERITIES: Record<PipErrorCode, PipSeverity> = {
  NO_VIDEO: "info",
  NOT_READY: "info",
  SITE_DISABLED: "blocked",
  IFRAME_BLOCKED: "blocked",
  PIP_UNAVAILABLE: "blocked",
  PIP_REFUSED: "blocked",
  RESTRICTED_URL: "tooltip",
};

export function messageFor(code: PipErrorCode): string {
  return MESSAGES[code];
}

export function severityFor(code: PipErrorCode): PipSeverity {
  return SEVERITIES[code];
}
