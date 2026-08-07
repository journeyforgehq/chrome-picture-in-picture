// =============================================================================
// GENERATED - do not edit here. CORE file vendored from chrome-ext-factory.
// Edit upstream in the template and run `sync-core` to propagate. Local edits
// are reported as drift and refused without --force.
// =============================================================================
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import {
  BACKEND_DIR,
  PERSIST_DIR,
  WORKER_PORT,
  WORKER_BASE_URL,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_SECRET_KEY,
} from "./config";

export interface WorkerHandle {
  baseUrl: string;
  stop(): Promise<void>;
}

async function waitForHealth(url: string, timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`worker did not become healthy at ${url}/health within ${timeoutMs}ms`);
}

/**
 * Start the worker as a real local HTTP server via `wrangler dev`.
 * The REAL /me billing path is exercised (not the dev-force-pro short-circuit):
 * dev-force-pro requires BOTH ENVIRONMENT="dev" AND DEV_FORCE_PRO="1"
 * (backend config.ts isDevForcePro), so we pin ENVIRONMENT=production AND
 * DEV_FORCE_PRO=0 — the harness enforces the guarantee explicitly rather than
 * inferring it from wrangler.toml, so a stray DEV_FORCE_PRO in the shell or a
 * later scaffold edit cannot silently turn every device pro. KV state is wiped
 * per run. Spawned detached so we can kill the whole process group (npx spawns
 * a child).
 */
export async function startWorker(): Promise<WorkerHandle> {
  rmSync(PERSIST_DIR, { recursive: true, force: true });

  const child: ChildProcess = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      String(WORKER_PORT),
      "--persist-to",
      PERSIST_DIR,
      "--var",
      "ENVIRONMENT:production",
      "--var",
      "DEV_FORCE_PRO:0",
      "--var",
      `STRIPE_WEBHOOK_SECRET:${STRIPE_WEBHOOK_SECRET}`,
      "--var",
      `STRIPE_SECRET_KEY:${STRIPE_SECRET_KEY}`,
      "--var",
      "APP_VERSION:e2e",
      "--log-level",
      "warn",
    ],
    { cwd: BACKEND_DIR, detached: true, stdio: "ignore" },
  );

  try {
    await waitForHealth(WORKER_BASE_URL);
  } catch (e) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    throw e;
  }

  return {
    baseUrl: WORKER_BASE_URL,
    async stop() {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* already gone */
        }
      }
    },
  };
}
