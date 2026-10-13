import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSamples, SAMPLES } from "../src/samples.mjs";
import { startServer } from "../src/server.mjs";

function call(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

async function freePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test("every sample dossier is offered on the start page and opens by its id, never by a path", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const base = await realpath(await mkdtemp(join(tmpdir(), "courtos-samples-")));
  const samples = await prepareSamples(base);
  assert.deepEqual(samples.map(s => s.id), SAMPLES.map(s => s.id), "every listed sample ships with the package");
  assert.ok(samples.every(s => s.path.startsWith(base)), "samples are working copies, not the package's own files");

  const port = await freePort();
  const app = await startServer({ port, openBrowser: false, samples, log: () => {} });
  t.after(async () => { app.close(); await rm(base, { recursive: true, force: true }); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = { Cookie: cookie, Origin: origin, "X-CourtOS": "1" };
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);

  const offered = (await state()).samples;
  assert.deepEqual(offered.map(s => s.id), SAMPLES.map(s => s.id));
  assert.ok(offered.every(s => s.court && s.matter && s.language && !("path" in s)), "court, matter and language, but no path, go to the page");
  assert.deepEqual(offered.filter(s => s.offline).map(s => s.id), ["alpenblick"], "only the short case replays without a model");

  assert.equal((await call(port, "/api/folder", { method: "POST", headers: write, body: { sample: "../../etc" } })).status, 400, "an unknown id is refused");
  assert.equal((await call(port, "/api/folder", { method: "POST", headers: write, body: { sample: "alpenblick" } })).status, 200);
  const opened = await state();
  assert.equal(opened.case.root, samples.find(s => s.id === "alpenblick").path);
  assert.equal(opened.case.demo, true);
});

test("choosing a case puts the interface in the language of the proceedings", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const base = await realpath(await mkdtemp(join(tmpdir(), "courtos-samples-")));
  const samples = await prepareSamples(base);
  const port = await freePort();
  const app = await startServer({ port, openBrowser: false, samples, log: () => {} });
  const streams = [];
  t.after(async () => { streams.forEach(s => s.destroy()); app.close(); await rm(base, { recursive: true, force: true }); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = { Cookie: cookie, Origin: origin, "X-CourtOS": "1" };
  const post = (path, body) => call(port, path, { method: "POST", headers: write, body });
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);
  const events = await new Promise((resolve) => {
    const received = { text: "" };
    request({ host: "127.0.0.1", port, path: "/api/events?client=browser", headers: { Host: `localhost:${port}`, Cookie: cookie } }, (res) => {
      streams.push(res);
      res.setEncoding("utf8");
      res.on("data", (chunk) => { received.text += chunk; });
      resolve(received);
    }).end();
  });

  for (const id of ["vd-fiduciaire", "ti-lavoro", "be-software", "alpenblick"]) {
    const { language } = SAMPLES.find(s => s.id === id);
    events.text = "";
    assert.equal((await post("/api/folder", { sample: id })).status, 200);
    assert.equal((await state()).settings.language, language, `${id} opens in ${language}`);
    assert.match(events.text, new RegExp(`event: language\ndata: \\{"language":"${language}"\\}`), `the open pages and Word switch to ${language} for ${id}`);
  }

  // The clerk may read a German case in French; the choice holds until the next case is chosen.
  assert.equal((await post("/api/language", { language: "fr" })).status, 200);
  assert.equal((await state()).settings.language, "fr");
  // Correcting a misdetected case language moves the interface with it.
  assert.equal((await post("/api/case/language", { language: "it" })).status, 200);
  assert.equal((await state()).settings.language, "it");
  assert.equal((await post("/api/folder", { sample: "vd-fiduciaire" })).status, 200);
  assert.equal((await state()).settings.language, "fr");
});
