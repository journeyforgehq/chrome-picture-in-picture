import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("contract.ts stays in sync with the backend", () => {
  it("is byte-identical to template/backend/src/contract.ts", () => {
    const extensionContract = readFileSync(
      path.resolve(__dirname, "../src/contract.ts"),
      "utf8"
    );
    const backendContract = readFileSync(
      path.resolve(__dirname, "../../backend/src/contract.ts"),
      "utf8"
    );
    expect(extensionContract).toBe(backendContract);
  });
});
