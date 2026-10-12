import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { certificateDirs, loadCertificates, startServer } from "../src/server.mjs";

const cli = fileURLToPath(new URL("../bin/courtos-local.mjs", import.meta.url));

/** A port nothing listens on, so the test never collides with a running CourtOS. */
async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test("without a localhost certificate the start says that Word will not work, and how to fix it", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const lines = [];
  const app = await startServer({ port: await freePort(), openBrowser: false, log: (l) => lines.push(l), certDirs: certificateDirs({}, "linux") });
  t.after(() => app.close());
  assert.match(app.origin, /^http:/);
  const said = lines.join("\n");
  assert.match(said, /Word nicht/);
  assert.match(said, /npx office-addin-dev-certs install/);
  process.env.COURTOS_APP = "1";
  const inApp = [];
  const app2 = await startServer({ port: await freePort(), openBrowser: false, log: (l) => inApp.push(l), certDirs: certificateDirs({}, "linux") });
  delete process.env.COURTOS_APP;
  app2.close();
  assert.match(inApp.join("\n"), /im CourtOS-Menü/, "the app's own menu sets the certificate up");
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

test("started by the menu-bar app, CourtOS gives a fresh one-time link on request and ends with the app", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const port = await freePort();
  const child = spawn(process.execPath, [cli, "--control", "--port", String(port)], { env: { ...process.env, HOME: home }, stdio: ["pipe", "pipe", "ignore"] });
  t.after(() => child.kill());
  const pending = [];
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      const waiter = pending.find(w => line.startsWith(w.prefix));
      if (waiter) { pending.splice(pending.indexOf(waiter), 1); waiter.resolve(line.slice(waiter.prefix.length + 1)); }
    }
  });
  const next = (prefix) => new Promise(resolve => pending.push({ prefix, resolve }));
  const ask = (command, prefix) => { const answer = next(prefix); child.stdin.write(`${command}\n`); return answer; };
  const origin = await next("COURTOS_READY");
  const pair = async (url) => (await fetch(`${origin}/api/pair`, { method: "POST", headers: { Origin: origin, "X-CourtOS": "1", "Content-Type": "application/json" }, body: JSON.stringify({ token: new URL(url).hash.slice("#pair=".length) }) })).status;

  const first = await ask("pair", "COURTOS_PAIR");
  assert.equal(await pair(first), 200);
  assert.equal(await pair(first), 403, "a link pairs once");
  const unused = await ask("pair", "COURTOS_PAIR");
  const latest = await ask("pair", "COURTOS_PAIR");
  assert.equal(await pair(unused), 403, "a newer link replaces an unused one");
  assert.equal(await pair(latest), 200);
  assert.deepEqual(JSON.parse(await ask("status", "COURTOS_STATUS")), { origin, busy: false, case: null, clients: { web: 0, word: 0 } });

  const exited = new Promise(resolve => child.on("exit", resolve));
  child.stdin.end();
  assert.equal(await exited, 0, "CourtOS ends when the app that started it ends");
});

test("the certificate is looked for in the configured folder, the Office developer folder and the installer's folder; a PFX counts", async () => {
  assert.deepEqual(certificateDirs({ COURTOS_CERT_DIR: "/x" }, "darwin").filter(d => !d.endsWith(".office-addin-dev-certs")), ["/x", "/Library/Application Support/CourtOS/certs"]);
  assert.equal(certificateDirs({ ProgramData: "C:\\ProgramData" }, "win32").at(-1), join("C:\\ProgramData", "CourtOS", "certs"));
  const dir = await mkdtemp(join(tmpdir(), "courtos-cert-"));
  assert.equal(await loadCertificates([dir]), null);
  await writeFile(join(dir, "localhost.pfx"), "pfx");
  assert.equal(String((await loadCertificates([join(dir, "missing"), dir])).pfx), "pfx");
});

test("on macOS the OCR helper the app ships is used, so no compiler is needed", { skip: process.platform !== "darwin" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "courtos-ocr-"));
  const helper = join(dir, "ocr-vision");
  await writeFile(helper, "#!/bin/sh\n");
  await chmod(helper, 0o755);
  const engine = await new Promise((resolve, reject) => execFile(process.execPath, ["--input-type=module", "-e",
    `const { ocrEngine } = await import(${JSON.stringify(new URL("../src/ocr.mjs", import.meta.url).href)}); console.log(JSON.stringify(await ocrEngine()));`],
    { env: { ...process.env, COURTOS_OCR_HELPER: helper, PATH: "/nowhere" } }, (error, stdout) => error ? reject(error) : resolve(JSON.parse(stdout))));
  assert.deepEqual(engine, { name: "vision", binary: helper });
});
