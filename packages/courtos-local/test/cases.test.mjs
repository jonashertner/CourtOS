import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { chmod, cp, mkdir, mkdtemp, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { addCase, caseForDocument, caseSummary, checkPlaces, loadCases, moveWork, removeCase, workFolderFor } from "../src/cases.mjs";
import { CaseStore } from "../src/caseStore.mjs";
import { compileGuard } from "../src/guard.mjs";
import { emptyRegister } from "../src/register.mjs";
import { startServer } from "../src/server.mjs";
import { FIXTURE, originalHashes } from "./helpers.mjs";

const exists = async (path) => Boolean(await stat(path).catch(() => null));

/** A temporary HOME and a fresh copy of the sample case's originals, without any CourtOS work. */
async function setup() {
  const home = await realpath(await mkdtemp(join(tmpdir(), "courtos-home-")));
  process.env.HOME = home;
  const source = join(home, "Akten", "HG.2026.57 Alpenblick");
  await cp(FIXTURE, source, { recursive: true });
  return { home, source, cleanup: () => rm(home, { recursive: true, force: true }) };
}

test("a new case keeps its work in its own folder under ~/CourtOS; the originals' folder gets nothing", async (t) => {
  const { home, source, cleanup } = await setup();
  t.after(cleanup);
  const before = await originalHashes(source);
  const entry = await addCase({ source });
  assert.equal(entry.source, source);
  assert.equal(entry.work, join(home, "CourtOS", "HG.2026.57 Alpenblick"));
  assert.deepEqual((await loadCases()).map(c => c.id), [entry.id], "the case is listed");
  assert.equal((await addCase({ source })).id, entry.id, "adding the same originals again finds the listed case");

  const store = await CaseStore.open(entry.source, { work: entry.work });
  await store.scan();
  store.close();
  assert.ok(await exists(join(entry.work, ".courtos", "private", "register.json")), "the register is in the work folder");
  assert.equal(await exists(join(source, ".courtos")), false, "nothing is written next to the originals");
  assert.deepEqual(await originalHashes(source), before);

  const summary = await caseSummary(entry);
  assert.equal(summary.name, "HG.2026.57 Alpenblick");
  assert.equal(summary.started, true);
  assert.equal(summary.same_folder, false);
  assert.ok(summary.documents >= 9);

  const second = join(home, "Akten", "HG.2026.57 Alpenblick (Kopie)");
  await cp(FIXTURE, second, { recursive: true });
  await mkdir(join(home, "CourtOS", "HG.2026.57 Alpenblick (Kopie)"), { recursive: true });
  await writeFile(join(home, "CourtOS", "HG.2026.57 Alpenblick (Kopie)", "fremd.txt"), "");
  assert.equal((await addCase({ source: second })).work, join(home, "CourtOS", "HG.2026.57 Alpenblick (Kopie) (2)"), "an occupied name gets a number");

  await removeCase(entry.id);
  assert.equal((await loadCases()).some(c => c.id === entry.id), false);
  assert.ok(await exists(join(entry.work, ".courtos")), "taking a case off the list deletes nothing");
});

test("a folder CourtOS already worked in keeps its work there, and the old recent list becomes the case list", async (t) => {
  const { home, source, cleanup } = await setup();
  t.after(cleanup);
  (await CaseStore.open(source)).close();
  await mkdir(join(home, ".config", "courtos"), { recursive: true });
  await writeFile(join(home, ".config", "courtos", "recent.json"), JSON.stringify([source, join(home, "gone")]));
  const list = await loadCases();
  assert.deepEqual(list.map(c => [c.source, c.work]), [[source, source]], "only folders with CourtOS work are taken over");
  assert.equal((await addCase({ source })).work, source);
});

test("a work folder never sits inside the originals, and a chosen folder with other files gets a subfolder", async (t) => {
  const { home, source, cleanup } = await setup();
  t.after(cleanup);
  await assert.rejects(checkPlaces(source, join(source, "Arbeit")), { code: "work_inside_source" });
  await assert.rejects(CaseStore.open(source, { work: join(source, "Arbeit") }), { code: "work_inside_source" });
  await assert.rejects(addCase({ source, work: join(source, "Beilagen", "CourtOS") }), { code: "work_inside_source" });
  assert.equal(await exists(join(source, "Arbeit")), false, "a refused work folder is not created among the originals");
  assert.equal(await exists(join(source, "Beilagen", "CourtOS")), false);
  const shared = join(home, "Ablage");
  await mkdir(shared);
  await writeFile(join(shared, "Brief.docx"), "");
  assert.equal(await workFolderFor(shared, source), join(shared, "HG.2026.57 Alpenblick"));
  const empty = join(home, "Leer");
  await mkdir(empty);
  assert.equal(await workFolderFor(empty, source), empty);
});

test("moving the work folder takes the workspace along and leaves the originals alone", async (t) => {
  const { home, source, cleanup } = await setup();
  t.after(cleanup);
  const before = await originalHashes(source);
  const entry = await addCase({ source });
  (await CaseStore.open(entry.source, { work: entry.work })).close();
  const target = join(home, "Neu");
  const moved = await moveWork(entry, target);
  assert.equal(moved.work, target);
  assert.ok(await exists(join(target, ".courtos", "case.json")));
  assert.equal(await exists(join(entry.work, ".courtos")), false, "no second copy of the register stays behind");
  assert.equal((await loadCases())[0].work, target);
  assert.deepEqual(await originalHashes(source), before);
});

test("the work folder's path never leaves the computer", () => {
  const guard = compileGuard({ register: emptyRegister(), realRoot: "/Volumes/Gericht/HG.2026.57 Alpenblick", workRoot: "/Users/x/CourtOS/HG.2026.57 Alpenblick" });
  assert.throws(() => guard.check("siehe /Users/x/CourtOS/HG.2026.57 Alpenblick/Arbeitsprodukte"), { code: "outbound_blocked" });
  assert.throws(() => guard.check("/Volumes/Gericht/HG.2026.57 Alpenblick/KB 1.pdf"), { code: "outbound_blocked" });
});

test("a Word document belongs to the case whose work folder or originals hold it, the innermost one", async (t) => {
  const { home, source, cleanup } = await setup();
  t.after(cleanup);
  const entry = await addCase({ source });
  await mkdir(join(entry.work, "Entwürfe"), { recursive: true });
  const nested = { id: "inner", source: join(home, "anderswo"), work: join(entry.work, "Entwürfe") };
  const list = [entry, nested];
  assert.equal((await caseForDocument(list, join(entry.work, "Urteil.docx")))?.id, entry.id, "a path, as Word on a Mac gives it");
  assert.equal((await caseForDocument(list, pathToFileURL(join(source, "Beilagen", "x.docx")).href))?.id, entry.id, "a file URL, in the originals' folder");
  assert.equal((await caseForDocument(list, join(entry.work, "Entwürfe", "y.docx")))?.id, "inner", "the innermost folder wins");
  assert.equal(await caseForDocument(list, join(home, "Brief.docx")), null);
  assert.equal(await caseForDocument(list, "https://gericht.sharepoint.com/sites/x/Urteil.docx"), null, "an online document belongs to no case");
  assert.equal(await caseForDocument(list, ""), null, "nor does a document not saved yet");
  assert.equal(await caseForDocument(list, join(entry.work + " (2)", "z.docx")), null, "a folder that only starts with the same name is another folder");
});

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

test("the page lists the cases, opens, closes and removes them by id, never by a path", async (t) => {
  const { home, source, cleanup } = await setup();
  const port = await freePort();
  const app = await startServer({ port, folder: source, openBrowser: false, log: () => {} });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = (path, body) => call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body });
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);

  let s = await state();
  assert.equal(s.case.work, join(home, "CourtOS", "HG.2026.57 Alpenblick"), "a folder given on the command line gets its own work folder");
  assert.equal(s.case.same_folder, false);
  assert.deepEqual(s.cases.map(c => c.id), [s.case.id]);
  const id = s.case.id;

  assert.equal((await write("/api/cases/open", { id: "nope" })).status, 404);
  assert.equal((await write("/api/cases/open", { path: "/etc" })).status, 404, "a path is not an id");
  assert.equal((await write("/api/cases/close")).status, 200);
  s = await state();
  assert.equal(s.case, null);
  assert.equal(s.cases[0].started, true);
  assert.ok(s.cases[0].documents >= 9);

  assert.equal((await write("/api/cases/open", { id })).status, 200);
  assert.equal((await state()).case.id, id);
  assert.equal((await write("/api/cases/remove", { id })).status, 200);
  s = await state();
  assert.equal(s.case, null, "removing the open case closes it");
  assert.deepEqual(s.cases, []);
  assert.deepEqual(await readdir(join(home, "CourtOS")), ["HG.2026.57 Alpenblick"], "the work stays on disk");
});

test("the Word pane learns which case its document belongs to, and opens only listed work products", async (t) => {
  const { home, source, cleanup } = await setup();
  const port = await freePort();
  const shown = [];
  const app = await startServer({ port, folder: source, openBrowser: false, log: () => {}, show: (path) => shown.push(path) });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = async (path, body) => { const r = await call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body }); return { status: r.status, body: JSON.parse(r.body) }; };
  const state = JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);

  const work = join(home, "CourtOS", "HG.2026.57 Alpenblick");
  assert.deepEqual((await write("/api/cases/for-document", { url: pathToFileURL(join(work, "Urteil.docx")).href })).body, { id: state.case.id }, "only the id comes back");
  assert.deepEqual((await write("/api/cases/for-document", { url: join(home, "Brief.docx") })).body, { id: null });
  assert.deepEqual((await write("/api/cases/for-document", { url: 42 })).body, { id: null });

  assert.deepEqual(JSON.parse((await call(port, "/api/products", { headers: { Cookie: cookie } })).body), { folder: null, files: [] }, "no analysis yet, no folder");
  for (const name of ["../.courtos/case.json", "/etc/passwd", null]) assert.equal((await write("/api/products/open", { name })).status, 404);
  assert.equal((await write("/api/cases/reveal", { id: state.case.id, place: "products" })).status, 200);
  assert.deepEqual(shown, [join(work, "Arbeitsprodukte")], "nothing else was opened");
});

test("a work-products folder that cannot be written is reported until a retry succeeds", async (t) => {
  const { home, source, cleanup } = await setup();
  const port = await freePort();
  const app = await startServer({ port, folder: source, openBrowser: false, log: () => {} });
  const products = join(home, "CourtOS", "HG.2026.57 Alpenblick", "Arbeitsprodukte");
  t.after(async () => { await chmod(products, 0o755).catch(() => {}); app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = async (path, body) => { const r = await call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body }); return { status: r.status, body: JSON.parse(r.body) }; };
  const get = async (path) => JSON.parse((await call(port, path, { headers: { Cookie: cookie } })).body);
  const finish = async (task) => {
    const { id } = (await write("/api/runs", { task, demo: true })).body;
    for (let i = 0; i < 200 && (await get(`/api/runs/${id}`)).status === "running"; i++) await new Promise(r => setTimeout(r, 100));
    return (await get(`/api/runs/${id}`)).status;
  };

  assert.equal((await write("/api/release", { model: "claude-opus-5-5" })).status, 200);
  assert.equal(await finish("chronology"), "succeeded");
  assert.equal((await get("/api/state")).case.products_failed, false);
  await chmod(products, 0o555);
  assert.equal(await finish("facts_evidence"), "succeeded", "the result stays in CourtOS");
  assert.equal((await get("/api/state")).case.products_failed, true);
  assert.deepEqual((await write("/api/products/retry")).body, { ok: false });
  await chmod(products, 0o755);
  assert.deepEqual((await write("/api/products/retry")).body, { ok: true });
  assert.equal((await get("/api/state")).case.products_failed, false);
  assert.equal((await get("/api/products")).files.length, 4, "both results, as Word and Markdown");
});

test("a case whose originals' folder went away and came back can be opened again", async (t) => {
  const { source, cleanup } = await setup();
  const port = await freePort();
  const app = await startServer({ port, folder: source, openBrowser: false, log: () => {} });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const listed = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body).cases[0].source_available;
  await call(port, "/api/cases/close", { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" } });
  assert.equal(await listed(), true);
  await rename(source, `${source} weg`);
  assert.equal(await listed(), false);
  await rename(`${source} weg`, source);
  assert.equal(await listed(), true, "no stale summary");
});

test("a run is on disk once its launch is acknowledged, and one cut off by quitting is listed as interrupted", async (t) => {
  const { home, source, cleanup } = await setup();
  const port = await freePort();
  const app = await startServer({ port, folder: source, openBrowser: false, log: () => {} });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = async (path, body) => { const r = await call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body }); return { status: r.status, body: JSON.parse(r.body) }; };
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);
  const runs = join(home, "CourtOS", "HG.2026.57 Alpenblick", ".courtos", "runs");

  assert.equal((await write("/api/release", { model: "claude-opus-5-5" })).status, 200);
  const { id } = (await write("/api/runs", { task: "chronology", demo: true })).body;
  assert.ok(await exists(join(runs, id, "run.json")), "recorded before the reply");
  for (let i = 0; i < 200 && (await state()).current; i++) await new Promise(r => setTimeout(r, 100));

  // What a run looks like on disk when CourtOS stopped while it was working.
  const cut = "2026-10-12-facts_evidence-AbCdEf";
  await mkdir(join(runs, cut), { recursive: true });
  await writeFile(join(runs, cut, "run.json"), JSON.stringify({ id: cut, task: "facts_evidence", status: "running", started: "2026-10-12T09:00:00.000Z", finished: null, events: [], requests: [] }));
  const caseId = (await state()).case.id;
  await write("/api/cases/close");
  await write("/api/cases/open", { id: caseId });
  const listed = (await state()).runs;
  assert.equal(listed.find(r => r.id === cut)?.status, "failed");
  assert.equal(listed.find(r => r.id === id)?.status, "succeeded");
  assert.deepEqual((await call(port, `/api/runs/${cut}`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal(JSON.parse((await call(port, `/api/runs/${cut}`, { headers: { Cookie: cookie } })).body).error.code, "interrupted");
});

test("adding a case through the page: the originals' folder, then the work folder, then the case", async (t) => {
  const { home, source, cleanup } = await setup();
  const port = await freePort();
  const answers = [];
  const app = await startServer({ port, openBrowser: false, log: () => {}, choose: async () => answers.shift() ?? null });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const cookie = (await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } })).headers["set-cookie"][0].split(";")[0];
  const write = async (path, body) => { const r = await call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body }); return { status: r.status, body: JSON.parse(r.body) }; };
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: cookie } })).body);

  assert.deepEqual((await write("/api/cases/source")).body, { cancelled: true }, "a closed dialog changes nothing");
  answers.push(source);
  const { pending } = (await write("/api/cases/source")).body;
  assert.equal(pending.work, join(home, "CourtOS", "HG.2026.57 Alpenblick"), "the default work folder is proposed");
  assert.equal(await exists(pending.work), false, "nothing is created before the user confirms");

  answers.push(join(source, "Akten 2"));
  await mkdir(join(source, "Akten 2"));
  assert.equal((await write("/api/cases/pending/work")).body.pending.work, join(source, "Akten 2"), "an empty folder is taken as it is");
  assert.equal((await write("/api/cases/create")).status, 409, "but not inside the originals");
  assert.equal((await state()).case, null);

  assert.equal((await write("/api/cases/pending/work", { same: true })).body.pending.same_folder, true);
  answers.push(join(home, "Ablage"));
  await mkdir(join(home, "Ablage"));
  assert.equal((await write("/api/cases/pending/work")).body.pending.work, join(home, "Ablage"));
  assert.equal((await write("/api/cases/create")).status, 200);
  const s = await state();
  assert.equal(s.pending, null);
  assert.equal(s.case.work, join(home, "Ablage"));
  assert.equal(s.case.same_folder, false);
  assert.deepEqual(s.cases.map(c => c.id), [s.case.id]);

  await write("/api/cases/close");
  answers.push(source);
  assert.deepEqual((await write("/api/cases/source")).body, { opened: s.case.id }, "choosing listed originals again opens that case");
});
