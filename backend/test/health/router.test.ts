import { describe, it, expect } from "vitest";
import { handleHealth } from "../../src/health/router";
import { MonitorService } from "../../src/health/monitor-service";

const svc = () => { const s = new MonitorService("test"); s.register("a", async () => ({ ok: true })); return s; };

describe("handleHealth", () => {
  it("GET /health is public and shallow", async () => {
    const res = await handleHealth(new Request("https://w/health"), svc, "tok");
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ ok: true });
  });
  it("GET /health merges the shallow extra into the body", async () => {
    const res = await handleHealth(new Request("https://w/health"), svc, "tok", { version: "1.2.3", configOk: true });
    expect(res!.status).toBe(200);
    expect(await res!.json()).toEqual({ ok: true, version: "1.2.3", configOk: true });
  });
  it("GET /health/summary needs the token", async () => {
    const res = await handleHealth(new Request("https://w/health/summary"), svc, "tok");
    expect(res!.status).toBe(401);
  });
  it("GET /health/summary?token=tok returns the summary", async () => {
    const res = await handleHealth(new Request("https://w/health/summary?token=tok"), svc, "tok");
    expect(res!.status).toBe(200);
    expect((await res!.json() as any).status).toBe("ok");
  });
  it("returns null for unrelated paths", async () => {
    expect(await handleHealth(new Request("https://w/me"), svc, "tok")).toBeNull();
  });
});
