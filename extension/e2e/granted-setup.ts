import { buildGrantedDist } from "./granted-dist";

/**
 * globalSetup for playwright.granted.config.ts: produce the one external
 * dependency that config exists for — an unpacked build with <all_urls>
 * statically granted.
 *
 * Deliberately does NOT spawn wrangler, a static server, or anything else. The
 * specs serve their own fixture pages.
 */
export default async function globalSetup(): Promise<void> {
  buildGrantedDist();
}
