/* ============================================================================
 * Message types shared by the content script and the service worker.
 * ============================================================================
 *
 * Its own module on purpose: the worker needs these strings and nothing else
 * from content.ts. Importing content.ts into background.ts would drag the
 * installer, its DOM listeners, and pipEntry's page-side scoring into the
 * service-worker bundle for a handful of constants.
 *
 * TWO OF THESE ARE ALSO SPELLED OUT AS LITERALS ELSEWHERE. src/pip/enhance.ts
 * is shipped to the page as SOURCE TEXT by executeScript and may reference no
 * outside identifier, so it inlines "PIP_DPIP_CLOSED" and
 * "PIP_GEOMETRY_CHANGED" rather than importing them.
 * test/pip/enhance-lifecycle.test.ts reads that file and asserts the spellings
 * agree — and that enhance.ts ships NO OTHER message type that has escaped this
 * pairing. Without it, editing one spelling would silently stop the worker
 * hearing about closed windows, or about resizes.
 * ==========================================================================*/

/** frame -> worker: "here is my best score" (payload: { score: number | null }). */
export const PIP_SCORE_REPORT = "PIP_SCORE_REPORT";

/** worker -> frame: "score yourself now and answer" (reply: { score }). */
export const PIP_SCORE_REQUEST = "PIP_SCORE_REQUEST";

/** worker -> frame: the verdict (payload: { isWinner: boolean }). */
export const PIP_COORD = "PIP_COORD";

/** content -> worker: the enhanced window closed — by the user, by a
 *  navigation, or because Chrome replaced it with another PiP surface. Clears
 *  activePip so a later click does not think a window is still open. */
export const PIP_DPIP_CLOSED = "PIP_DPIP_CLOSED";

/** content -> worker: the user resized the enhanced window. Payload carries the
 *  CONTENT size (S-12: `outer` includes browser chrome, and storing it would
 *  make the window creep larger on every reopen).
 *  Payload: { origin: string; w: number; h: number }. */
export const PIP_GEOMETRY_CHANGED = "PIP_GEOMETRY_CHANGED";
