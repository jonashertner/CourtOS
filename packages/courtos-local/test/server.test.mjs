import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.mjs";
import { freshCase } from "./helpers.mjs";

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
  const port = 4300 + Math.floor(Math.random() * 400);
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

  const state = await call(port, "/api/state", { headers: { Cookie: cookie } });
  assert.equal(state.status, 200);
  assert.equal(JSON.parse(state.body).case.sources.length, 9);

  // Writes need the exact own Origin and the custom header, even with a session.
  assert.equal((await call(port, "/api/revoke", { method: "POST", headers: { Cookie: cookie } })).status, 403);
  assert.equal((await call(port, "/api/revoke", { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.example", "X-CourtOS": "1" } })).status, 403);
  // A page cannot make CourtOS open an arbitrary path.
  const open = await call(port, "/api/folder", { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body: { path: "/etc" } });
  assert.equal(open.status, 403);
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
