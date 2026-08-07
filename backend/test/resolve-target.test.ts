import { describe, it, expect } from "vitest";
import { resolveBase, parseArgs } from "../scripts/resolve-target.mjs";

const targets = { local: "http://localhost:8787", staging: "https://stg.example.workers.dev", production: "REPLACE_WITH_PROD_WORKER_URL" };

describe("resolveBase", () => {
  it("prefers explicit --base", () => expect(resolveBase({ base: "https://x", env: "staging", targets })).toBe("https://x"));
  it("resolves --env from targets", () => expect(resolveBase({ env: "staging", targets })).toBe("https://stg.example.workers.dev"));
  it("throws on unknown env", () => expect(() => resolveBase({ env: "nope", targets })).toThrow(/unknown/));
  it("throws on unfilled placeholder", () => expect(() => resolveBase({ env: "production", targets })).toThrow(/placeholder/));
  it("throws when neither given", () => expect(() => resolveBase({ targets })).toThrow(/need --base or --env/));
});
describe("parseArgs", () => {
  it("parses --k v pairs", () => expect(parseArgs(["--env", "staging", "--token", "t"])).toEqual({ env: "staging", token: "t" }));
});
