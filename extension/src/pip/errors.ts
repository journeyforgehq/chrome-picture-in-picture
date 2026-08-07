// The toast is the ONLY feedback channel in this product (there is no popup),
// so this map is the entire vocabulary the extension has for saying "no".

export const PIP_ERROR_CODES = [
  "NO_VIDEO",
  "NOT_READY",
  "SITE_DISABLED",
  "IFRAME_BLOCKED",
  "PIP_UNAVAILABLE",
  "RESTRICTED_URL",
] as const;

export type PipErrorCode = (typeof PIP_ERROR_CODES)[number];

/** `blocked` = the site or browser said no. `info` = we found nothing to do.
 *  `tooltip` = no page to render into, so the icon tooltip is the only channel. */
export type PipSeverity = "info" | "blocked" | "tooltip";

const MESSAGES: Record<PipErrorCode, string> = {
  NO_VIDEO: "No video found on this page.",
  NOT_READY: "This video hasn't loaded yet. Press play, then try again.",
  SITE_DISABLED: "This site has turned off picture-in-picture for this video.",
  IFRAME_BLOCKED: "This embedded player doesn't allow picture-in-picture.",
  PIP_UNAVAILABLE: "Picture-in-picture is turned off in this browser.",
  RESTRICTED_URL: "Chrome blocks extensions on this page.",
};

const SEVERITIES: Record<PipErrorCode, PipSeverity> = {
  NO_VIDEO: "info",
  NOT_READY: "info",
  SITE_DISABLED: "blocked",
  IFRAME_BLOCKED: "blocked",
  PIP_UNAVAILABLE: "blocked",
  RESTRICTED_URL: "tooltip",
};

export function messageFor(code: PipErrorCode): string {
  return MESSAGES[code];
}

export function severityFor(code: PipErrorCode): PipSeverity {
  return SEVERITIES[code];
}
