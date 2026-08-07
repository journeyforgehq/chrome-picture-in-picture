import { defineConfig } from "vitest/config";

// happy-dom is the active DOM environment (lighter/faster than jsdom).
// jsdom stays as a devDependency fallback if a future test needs an API
// happy-dom doesn't implement — swap `environment` below if that happens.
export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
