export interface CheckResult { name: string; ok: boolean; latencyMs: number; detail?: string; critical: boolean; }
export interface HealthSummary { status: "ok" | "degraded" | "down"; env: string; checks: CheckResult[]; }
export type MonitorFn = () => Promise<{ ok: boolean; detail?: string }>;
interface Monitor { name: string; fn: MonitorFn; critical: boolean; }

/** Registry of named dependency checks with an aggregated status + a short TTL cache. Framework-free. */
export class MonitorService {
  private monitors: Monitor[] = [];
  private cache: { at: number; summary: HealthSummary } | null = null;
  constructor(private env: string, private ttlMs = 60_000, private now: () => number = () => Date.now()) {}

  register(name: string, fn: MonitorFn, opts: { critical?: boolean } = {}): void {
    this.monitors.push({ name, fn, critical: opts.critical ?? true });
  }

  async run(fresh = false): Promise<HealthSummary> {
    if (!fresh && this.cache && this.now() - this.cache.at < this.ttlMs) return this.cache.summary;
    const checks: CheckResult[] = await Promise.all(
      this.monitors.map(async (m) => {
        const start = this.now();
        try {
          const r = await m.fn();
          return { name: m.name, ok: r.ok, latencyMs: this.now() - start, detail: r.detail, critical: m.critical };
        } catch (e) {
          return { name: m.name, ok: false, latencyMs: this.now() - start, detail: (e as Error).message, critical: m.critical };
        }
      })
    );
    const status: HealthSummary["status"] = checks.some((c) => !c.ok && c.critical)
      ? "down"
      : checks.some((c) => !c.ok)
        ? "degraded"
        : "ok";
    const summary: HealthSummary = { status, env: this.env, checks };
    this.cache = { at: this.now(), summary };
    return summary;
  }
}
