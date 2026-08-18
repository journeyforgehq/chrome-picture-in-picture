import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        isolatedStorage: true,
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            STRIPE_SECRET_KEY: "sk_test_123",
            STRIPE_WEBHOOK_SECRET: "whsec_test_123",
            ENVIRONMENT: "production",
            APP_VERSION: "test",
            APP_SLUG: "test-app",
            // STRIPE_PRICE_MONTHLY deliberately UNSET — keeps the
            // not_configured path in checkout.test.ts meaningful.
            STRIPE_PRICE_ANNUAL: "price_annual_test",
            STRIPE_PRICE_LIFETIME: "price_lifetime_test",
            STATEMENT_DESCRIPTOR_SUFFIX: "TESTAPP",
          },
        },
      },
    },
  },
});
