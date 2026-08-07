import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  parseNodeMajor,
  nodeVersionOk,
  portFree,
  commandExists,
  ensureDevVars,
  runDoctor,
} from "../scripts/doctor.mjs";

test("parseNodeMajor extracts the major version", () => {
  assert.equal(parseNodeMajor("v22.15.0"), 22);
  assert.equal(parseNodeMajor("18.0.0"), 18);
  assert.ok(Number.isNaN(parseNodeMajor("garbage")));
});

test("nodeVersionOk gates on the minimum", () => {
  assert.equal(nodeVersionOk("v22.15.0", 18), true);
  assert.equal(nodeVersionOk("v16.20.0", 18), false);
});

test("portFree: true for an ephemeral port, false when occupied", async () => {
  assert.equal(await portFree(0), true);
  const srv = createServer().listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const busy = srv.address().port;
  assert.equal(await portFree(busy), false);
  await new Promise((r) => srv.close(r));
});

test("commandExists: true for node, false for a bogus command", async () => {
  assert.equal(await commandExists("node"), true);
  assert.equal(await commandExists("definitely-not-a-real-cmd-xyz"), false);
});

test("ensureDevVars copies the example when missing, no-ops when present", () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor-"));
  const templateDir = join(dir, "template");
  const backendDir = join(templateDir, "backend");
  mkdirSync(backendDir, { recursive: true });
  writeFileSync(join(templateDir, ".dev.vars.example"), "ENVIRONMENT=dev\nDEV_FORCE_PRO=1\n");

  const first = ensureDevVars(templateDir, backendDir);
  assert.equal(first.created, true);
  assert.ok(existsSync(join(backendDir, ".dev.vars")));
  assert.match(readFileSync(join(backendDir, ".dev.vars"), "utf8"), /DEV_FORCE_PRO=1/);

  const second = ensureDevVars(templateDir, backendDir);
  assert.equal(second.created, false);
});

test("runDoctor includes the stripe check only when needsStripeListener", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doctor2-"));
  const templateDir = join(dir, "template");
  const extDir = join(templateDir, "extension");
  const backDir = join(templateDir, "backend");
  mkdirSync(join(extDir, "node_modules"), { recursive: true });
  mkdirSync(join(backDir, "node_modules"), { recursive: true });
  writeFileSync(join(templateDir, ".dev.vars.example"), "ENVIRONMENT=dev\n");
  const base = { templateDir, extensionDir: extDir, backendDir: backDir, port: 0 };

  const without = await runDoctor({ ...base, needsStripeListener: false });
  assert.equal(without.checks.some((c) => c.name === "stripe CLI"), false);
  // npm is always required (it launches both dev processes) — checked unconditionally.
  assert.equal(without.checks.some((c) => c.name === "npm CLI"), true);

  const withStripe = await runDoctor({ ...base, needsStripeListener: true });
  assert.equal(withStripe.checks.some((c) => c.name === "stripe CLI"), true);
});
