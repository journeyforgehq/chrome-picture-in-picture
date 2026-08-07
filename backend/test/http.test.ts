import { describe, it, expect } from "vitest";
import { json, preflight } from "../src/billing/http";

describe("json", () => {
  it("serializes body, sets status, JSON content-type, CORS, and extra headers", async () => {
    const r = json({ a: 1 }, 201, { "X-Quota-Remaining": "5" });
    expect(r.status).toBe(201);
    expect(r.headers.get("Content-Type")).toContain("application/json");
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(r.headers.get("X-Quota-Remaining")).toBe("5");
    expect(await r.json()).toEqual({ a: 1 });
  });
});

describe("preflight", () => {
  it("returns 204 with CORS method + header allowances", () => {
    const r = preflight();
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(r.headers.get("Access-Control-Allow-Headers")).toContain("X-Device-Id");
  });
});
