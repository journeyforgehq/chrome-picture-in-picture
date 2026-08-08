import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

// Two origins on purpose. localhost:3000 and 127.0.0.1:3001 are cross-origin
// to each other even though both resolve to this machine, which is exactly
// what the cross-origin iframe fixtures need. Nothing here talks to wrangler,
// the extension build, or the preview gallery — the detection layer is pure
// DOM logic and serves itself.
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".webm": "video/webm",
  ".css": "text/css",
};

export function startServers(): { close(): Promise<void> } {
  const make = (host: string, port: number): Server => {
    const s = createServer((req, res) => {
      const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "");
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      const headers: Record<string, string> = {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
      };
      // A later fixture needs a REAL Permissions-Policy header; a <meta> tag cannot set it.
      if (rel.startsWith("d03")) headers["permissions-policy"] = "picture-in-picture=()";
      res.writeHead(200, headers).end(readFileSync(file));
    });
    s.listen(port, host);
    return s;
  };
  const a = make("localhost", 3000);
  const b = make("127.0.0.1", 3001);
  return {
    close: () =>
      Promise.all([
        new Promise<void>((r) => a.close(() => r())),
        new Promise<void>((r) => b.close(() => r())),
      ]).then(() => undefined),
  };
}
