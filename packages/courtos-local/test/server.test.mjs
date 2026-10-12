import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.mjs";
import { freePort, freshCase } from "./helpers.mjs";

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

test("the loopback server enforces host, pairing, origin and folder rules", async (t) => {
  // A temporary HOME: no developer certificates (plain HTTP) and no real CourtOS settings.
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const { root, cleanup } = await freshCase();
  const port = await freePort();
  const app = await startServer({ port, folder: root, openBrowser: false, log: () => {} });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;

  assert.equal((await call(port, "/api/state", { headers: { Host: "evil.example" } })).status, 421, "DNS rebinding");
  assert.equal((await call(port, "/api/state")).status, 401, "unpaired");
  assert.equal((await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token: "wrong" } })).status, 403);
  assert.equal((await call(port, "/api/pair", { method: "POST", headers: { Origin: "https://evil.example", "X-CourtOS": "1" }, body: { token: "x" } })).status, 403, "foreign origin");

  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const paired = await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } });
  assert.equal(paired.status, 200);
  const cookie = paired.headers["set-cookie"][0].split(";")[0];
  assert.match(paired.headers["set-cookie"][0], /HttpOnly/);
  assert.equal((await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).status, 403, "the startup link pairs once");

  const state = await call(port, "/api/state", { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.equal(JSON.parse(state.body).case.sources.length, 9);

  // Writes need the exact own Origin and the custom header, even with a session.
  assert.equal((await call(port, "/api/revoke", { method: "POST", headers: { Cookie: cookie } })).status, 403);
  assert.equal((await call(port, "/api/revoke", { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.example", "X-CourtOS": "1" } })).status, 403);
  // A page cannot make CourtOS open an arbitrary path: cases open by id, samples by name.
  const open = await call(port, "/api/folder", { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body: { path: "/etc" } });
  assert.equal(open.status, 400);
  assert.equal((await call(port, "/api/cases/open", { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body: { id: "/etc" } })).status, 404);
  assert.equal(JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body).case.root, await realpath(root), "the open case is unchanged");
  // Static files are restricted to the bundled web folder.
  assert.equal((await call(port, "/..%2Fsrc%2Fserver.mjs")).status, 404);
  // Malformed or foreign requests never crash the server.
  assert.equal((await call(port, "/api/runs/xxxxxxxx/requests/999", { headers: { Cookie: cookie } })).status, 404, "unknown request is a 404, not a crash");
  assert.equal((await call(port, "/api/state", { headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" } })).status, 403);
  const bad = await new Promise((resolve) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/pair", method: "POST", headers: { Host: `localhost:${port}`, Origin: origin, "X-CourtOS": "1", "Content-Type": "application/json" } }, (r) => { r.resume(); r.on("end", () => resolve(r.statusCode)); });
    req.end("{not json");
  });
  assert.equal(bad, 400);
  assert.equal((await call(port, "/api/state", { headers: { Cookie: cookie } })).status, 200, "still alive");
  const page = await call(port, "/");
  assert.match(page.headers["content-security-policy"], /default-src 'self'/);
});

test("the browser and Word follow each other: one language, a passage shown in the browser, a claim inserted in Word", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const { root, cleanup } = await freshCase();
  const port = await freePort();
  const app = await startServer({ port, folder: root, openBrowser: false, log: () => {} });
  const streams = [];
  t.after(async () => { for (const s of streams) s.destroy(); app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const paired = await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } });
  const cookie = paired.headers["set-cookie"][0].split(";")[0];
  const post = (path, body) => call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body });
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);
  const listen = (kind) => new Promise((resolve) => {
    const received = { text: "" };
    const req = request({ host: "127.0.0.1", port, path: `/api/events?client=${kind}`, headers: { Host: `localhost:${port}`, Cookie: cookie } }, (res) => {
      streams.push(res);
      res.setEncoding("utf8");
      res.on("data", (chunk) => { received.text += chunk; });
      resolve(received);
    });
    req.end();
  });
  const settle = () => new Promise(r => setTimeout(r, 100));

  // A stored result to refer to.
  assert.equal((await post("/api/release", { model: "demo" })).status, 200);
  const { id } = JSON.parse((await post("/api/runs", { task: "source_chat", demo: true, question: (await state()).demo_question })).body);
  for (let i = 0; i < 100 && (await state()).current; i++) await settle();
  const run = JSON.parse((await call(port, `/api/runs/${id}`, { headers: { Cookie: cookie } })).body);
  assert.equal(run.status, "succeeded");
  const claim = run.result.claims[0];

  const web = await listen("web"), word = await listen("word");
  await settle();
  assert.deepEqual((await state()).clients, { web: 1, word: 1 });

  // Only references to a stored citation are accepted; the browser receives the stored citation itself.
  assert.equal((await post("/api/show", { run: id, claim: claim.id, citation: 99 })).status, 404);
  assert.equal((await post("/api/show", { run: id, claim: "nope", citation: 0 })).status, 404);
  const shown = await post("/api/show", { run: id, claim: claim.id, citation: 0 });
  assert.deepEqual(JSON.parse(shown.body), { delivered: 1 });
  await settle();
  assert.match(web.text, /event: show/);
  assert.ok(web.text.includes(JSON.stringify(claim.citations[0].quote_pseudonymised)), "the browser gets the stored citation");
  assert.doesNotMatch(word.text, /event: show/);

  assert.equal((await post("/api/word/insert", { run: id, claim: "nope" })).status, 404);
  assert.deepEqual(JSON.parse((await post("/api/word/insert", { run: id, claim: claim.id })).body), { delivered: 1 });
  await settle();
  assert.match(word.text, /event: insert/);
  assert.doesNotMatch(web.text, /event: insert/);

  // One interface language for both views, remembered across restarts.
  assert.equal((await post("/api/language", { language: "xx" })).status, 400);
  assert.equal((await post("/api/language", { language: "fr" })).status, 200);
  await settle();
  for (const view of [web, word]) assert.match(view.text, /event: language\ndata: \{"language":"fr"\}/);
  assert.equal((await state()).settings.language, "fr");
});
