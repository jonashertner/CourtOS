import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/server.mjs";

const cli = fileURLToPath(new URL("../bin/courtos-local.mjs", import.meta.url));

test("without a localhost certificate the start says that Word will not work, and how to fix it", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const lines = [];
  const app = await startServer({ port: 4300 + Math.floor(Math.random() * 400), openBrowser: false, log: (l) => lines.push(l) });
  t.after(() => app.close());
  assert.match(app.origin, /^http:/);
  const said = lines.join("\n");
  assert.match(said, /Word nicht/);
  assert.match(said, /npx office-addin-dev-certs install/);
});

test("a busy port ends the start with a plain message, not a stack trace", async (t) => {
  const busy = createServer();
  await new Promise(resolve => busy.listen(0, "127.0.0.1", resolve));
  t.after(() => busy.close());
  const { port } = busy.address();
  const home = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const result = await new Promise(resolve => execFile(process.execPath, [cli, "--port", String(port), "--no-open"], { env: { ...process.env, HOME: home } },
    (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stderr })));
  assert.equal(result.code, 1);
  assert.match(result.stderr, new RegExp(`Port ${port} ist belegt`));
  assert.match(result.stderr, /--port \d+/);
  assert.doesNotMatch(result.stderr, /\n\s+at /, "no stack trace");
});
