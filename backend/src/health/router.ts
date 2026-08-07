import { MonitorService } from "./monitor-service";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * `/health` (public shallow) + `/health/summary?token=…[&fresh=1]` (token-guarded deep).
 * Returns null for other paths. `shallow` is merged into the public `/health` body,
 * letting each worker surface a richer liveness contract (e.g. `{ version, configOk }`)
 * without the deep summary — pass `{}` (default) for a bare `{ ok: true }`.
 */
export async function handleHealth(
  req: Request,
  getService: () => MonitorService,
  healthToken: string | undefined,
  shallow: Record<string, unknown> = {}
): Promise<Response | null> {
  if (req.method !== "GET") return null;
  const url = new URL(req.url);
  if (url.pathname === "/health") return json({ ok: true, ...shallow });
  if (url.pathname === "/health/summary") {
    if (!healthToken || url.searchParams.get("token") !== healthToken) return json({ error: "unauthorized" }, 401);
    const summary = await getService().run(url.searchParams.get("fresh") === "1");
    return json(summary, summary.status === "down" ? 503 : 200);
  }
  return null;
}
