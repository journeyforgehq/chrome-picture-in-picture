import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDoctor, EXTENSION_DIR, BACKEND_DIR, TEMPLATE_DIR, WORKER_PORT } from "./scripts/doctor.mjs";

const WEBHOOK_URL = `http://localhost:${WORKER_PORT}/stripe/webhook`;
const RESET = "\x1b[0m";

/** Parse .factory.json content (string | null) -> object | null. Never throws. */
export function parseFactory(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read template/.factory.json if present (absent in the template itself). */
export function readFactory(templateDir = TEMPLATE_DIR) {
  const p = resolve(templateDir, ".factory.json");
  return parseFactory(existsSync(p) ? readFileSync(p, "utf8") : null);
}

/** Build the list of dev processes. The stripe listener is included ONLY when needsStripeListener. */
export function planProcesses({ needsStripeListener, extensionDir, backendDir, webhookUrl }) {
  const procs = [
    { name: "web", color: "\x1b[36m", cmd: "npm", args: ["run", "watch"], cwd: extensionDir },
    { name: "api", color: "\x1b[35m", cmd: "npm", args: ["run", "dev"], cwd: backendDir },
  ];
  if (needsStripeListener) {
    procs.push({
      name: "stripe",
      color: "\x1b[33m",
      cmd: "stripe",
      args: ["listen", "--forward-to", webhookUrl],
      cwd: backendDir,
    });
  }
  return procs;
}

/** Prefix each nonempty line of a stdout/stderr chunk with a colored [name] tag. */
export function formatChunk(name, color, chunk) {
  return chunk
    .toString()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => `${color}[${name}]${RESET} ${line}`)
    .join("\n");
}

async function main() {
  const factory = readFactory();
  const needsStripeListener = factory?.needsStripeListener ?? false;

  // Preflight (spec: doctor runs at the top of dev).
  const { ok, checks } = await runDoctor({ needsStripeListener });
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  if (!ok) {
    console.error("dev: preflight failed — fix the failing items above.");
    process.exit(1);
  }

  const procs = planProcesses({
    needsStripeListener,
    extensionDir: EXTENSION_DIR,
    backendDir: BACKEND_DIR,
    webhookUrl: WEBHOOK_URL,
  });
  console.log(`\ndev: starting ${procs.map((p) => p.name).join(", ")} (Ctrl-C to stop)\n`);

  const children = [];
  let shuttingDown = false;

  const shutdown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGTERM"); // kill the whole process group
        } catch {
          /* already gone */
        }
      }
    }
    process.exit(code);
  };

  for (const spec of procs) {
    // detached so each child leads its own process group and we can kill grandchildren too
    const child = spawn(spec.cmd, spec.args, { cwd: spec.cwd, detached: true });
    children.push(child);
    child.stdout.on("data", (d) => {
      const s = formatChunk(spec.name, spec.color, d);
      if (s) console.log(s);
    });
    child.stderr.on("data", (d) => {
      const s = formatChunk(spec.name, spec.color, d);
      if (s) console.error(s);
    });
    child.on("error", (err) => {
      console.error(`${spec.color}[${spec.name}]${RESET} failed to start: ${err.message}`);
      shutdown(1);
    });
    child.on("close", (code) => {
      if (shuttingDown) return;
      console.error(`${spec.color}[${spec.name}]${RESET} exited (code ${code}). Shutting down the rest.`);
      shutdown(code ?? 1);
    });
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

// --- CLI entrypoint (only when run directly, not when imported by tests) ---
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
