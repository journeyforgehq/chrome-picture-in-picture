import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import {
  WORKER_PORT,
  WORKER_BASE_URL,
  EXTENSION_DIR,
  BACKEND_DIR,
  DIST_DIR,
  STRIPE_WEBHOOK_SECRET,
  E2E_CUSTOMER_ID,
  E2E_SUB_ID,
} from "../../e2e/harness/config";

describe("e2e harness config", () => {
  it("derives the worker base url from the port", () => {
    expect(WORKER_BASE_URL).toBe(`http://localhost:${WORKER_PORT}`);
    expect(WORKER_PORT).not.toBe(8787);
  });

  it("resolves EXTENSION_DIR to the real extension package (has package.json)", () => {
    expect(existsSync(`${EXTENSION_DIR}/package.json`)).toBe(true);
  });

  it("resolves BACKEND_DIR to the sibling worker package (has wrangler.toml)", () => {
    expect(existsSync(`${BACKEND_DIR}/wrangler.toml`)).toBe(true);
  });

  it("points DIST_DIR inside the extension", () => {
    expect(DIST_DIR).toBe(`${EXTENSION_DIR}/dist`);
  });

  it("exposes test-only, non-real Stripe/customer identifiers", () => {
    expect(STRIPE_WEBHOOK_SECRET.startsWith("whsec_")).toBe(true);
    expect(E2E_CUSTOMER_ID).toMatch(/^cus_/);
    expect(E2E_SUB_ID).toMatch(/^sub_/);
  });
});
