/**
 * Published policy pages — linked from the options page and quoted by the
 * paywall. Stripe and Chrome Web Store reviewers follow these, so they must
 * resolve in every build.
 *
 * HARDCODED on purpose, not derived from `config.WELCOME_URL`: that value comes
 * from build-time env (webpack DefinePlugin) and is empty in any build that
 * doesn't set it — .env.production does not — which would emit a broken
 * relative "/terms". A wrong-but-present origin is easy to spot; an empty one
 * silently ships a dead policy link.
 *
 * The origin is the Cloudflare Pages project this repo's welcome-page actually
 * deploys to — see welcome-page/package.json, `deploy` script
 * (`--project-name`). Change it in this one place if the domain moves.
 */
export const POLICY_ORIGIN = "https://picture-in-picture-web.pages.dev";

export const TERMS_URL = `${POLICY_ORIGIN}/terms`;
export const REFUNDS_URL = `${POLICY_ORIGIN}/refunds`;
