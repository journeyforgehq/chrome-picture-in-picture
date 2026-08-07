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
          },
        },
      },
    },
  },
});
