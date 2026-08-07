import { describe, it, expect } from "vitest";
import { MonitorService } from "../../src/health/monitor-service";

const mk = () => { let t = 0; return { svc: new MonitorService("test", 60_000, () => t), tick: (n: number) => (t += n) }; };

describe("MonitorService", () => {
  it("status ok when all pass", async () => {
    const { svc } = mk();
    svc.register("a", async () => ({ ok: true }));
    const r = await svc.run(true);
    expect(r.status).toBe("ok");
    expect(r.checks[0]).toMatchObject({ name: "a", ok: true, critical: true });
  });
  it("status down when a critical check fails", async () => {
    const { svc } = mk();
    svc.register("a", async () => ({ ok: true }));
    svc.register("b", async () => ({ ok: false, detail: "boom" }), { critical: true });
    expect((await svc.run(true)).status).toBe("down");
  });
  it("status degraded when only a non-critical check fails", async () => {
    const { svc } = mk();
    svc.register("a", async () => ({ ok: false }), { critical: false });
    expect((await svc.run(true)).status).toBe("degraded");
  });
  it("a throwing monitor is a failed check, not a crash", async () => {
    const { svc } = mk();
    svc.register("boom", async () => { throw new Error("nope"); });
    const r = await svc.run(true);
    expect(r.checks[0]).toMatchObject({ ok: false, detail: "nope" });
    expect(r.status).toBe("down");
  });
  it("caches within ttl, refreshes after ttl or when fresh=true", async () => {
    const { svc, tick } = mk();
    let n = 0;
    svc.register("count", async () => ({ ok: true, detail: String(++n) }));
    await svc.run();
    await svc.run();
    expect(n).toBe(1);
    tick(60_001);
    await svc.run();
    expect(n).toBe(2);
    await svc.run(true);
    expect(n).toBe(3);
  });
});
