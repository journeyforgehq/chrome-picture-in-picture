/* ============================================================================
 * Message types shared by the content script and the service worker.
 * ============================================================================
 *
 * Its own module on purpose: the worker needs these three strings and nothing
 * else from content.ts. Importing content.ts into background.ts would drag the
 * installer, its DOM listeners, and pipEntry's page-side scoring into the
 * service-worker bundle for three constants.
 * ==========================================================================*/

/** frame -> worker: "here is my best score" (payload: { score: number | null }). */
export const PIP_SCORE_REPORT = "PIP_SCORE_REPORT";

/** worker -> frame: "score yourself now and answer" (reply: { score }). */
export const PIP_SCORE_REQUEST = "PIP_SCORE_REQUEST";

/** worker -> frame: the verdict (payload: { isWinner: boolean }). */
export const PIP_COORD = "PIP_COORD";
