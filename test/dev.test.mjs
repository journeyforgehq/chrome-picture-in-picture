import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFactory, planProcesses, formatChunk } from "../dev.mjs";

test("parseFactory: null for empty/invalid, object for valid JSON", () => {
  assert.equal(parseFactory(null), null);
  assert.equal(parseFactory("not json"), null);
  assert.deepEqual(parseFactory('{"needsStripeListener":true}'), { needsStripeListener: true });
});

test("planProcesses: web+api by default, +stripe only when needed", () => {
  const base = { extensionDir: "/ext", backendDir: "/api", webhookUrl: "http://x/stripe/webhook" };

  const without = planProcesses({ ...base, needsStripeListener: false });
  assert.deepEqual(without.map((p) => p.name), ["web", "api"]);
  assert.equal(without[0].cwd, "/ext");
  assert.deepEqual(without[1].args, ["run", "dev"]);

  const withStripe = planProcesses({ ...base, needsStripeListener: true });
  assert.deepEqual(withStripe.map((p) => p.name), ["web", "api", "stripe"]);
  const stripe = withStripe.find((p) => p.name === "stripe");
  assert.deepEqual(stripe.args, ["listen", "--forward-to", "http://x/stripe/webhook"]);
  assert.equal(stripe.cwd, "/api"); // runs from the backend (billing), not the extension
});

test("formatChunk: prefixes each nonempty line with the tag, drops blanks", () => {
  const out = formatChunk("api", "\x1b[35m", "line one\nline two\n\n");
  const lines = out.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("[api]") && lines[0].includes("line one"));
  assert.ok(lines[1].includes("[api]") && lines[1].includes("line two"));
});
