import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRun } from "../src/agent/runner.mjs";
import { demoProvider } from "../src/agent/demo.mjs";
import { OpenAICompatibleProvider, ScriptedProvider } from "../src/agent/providers.mjs";
import { collectMemory, memoryMarkdown, memoryPrompt, memorySha, memorySnapshot } from "../src/memory.mjs";
import { startServer } from "../src/server.mjs";
import { freshCase, ORIGINAL_IDENTIFIERS } from "./helpers.mjs";

const leaks = (text) => ORIGINAL_IDENTIFIERS.filter(identifier => text.includes(identifier));

/** A chronology produced by "the first model": the scripted demo run through the real loop. */
async function firstRun(store, task = "chronology") {
  await store.release({ model: "claude-opus-5-5", budgetChf: null });
  const run = new AgentRun({ store, provider: new ScriptedProvider(demoProvider(store, task).turns), task, model: "claude-opus-5-5" });
  await run.run();
  const summary = run.summary();
  assert.equal(summary.status, "succeeded", JSON.stringify(summary.error));
  return summary;
}

test("the memory keeps verified findings on unchanged pages; unverified and changed ones become open points", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const run = await firstRun(store);
    const clean = collectMemory(store, [run]);
    assert.equal(clean.groups.length, 1);
    const verifiedEvents = run.result.rows.filter(r => run.result.claims.find(c => c.id === r.event).citations.every(x => x.match === "exact")).length;
    assert.equal(clean.groups[0].rows.length, verifiedEvents);
    assert.ok(clean.groups[0].rows.every(r => r.items[0].sources.every(s => /^S\d+$/.test(s.section))), "every finding points to its pages in this release");

    // One quotation that failed, one page that changed since.
    const altered = structuredClone(run);
    const [first, second] = altered.result.rows;
    altered.result.claims.find(c => c.id === first.event).citations[0].match = "absent";
    altered.result.claims.find(c => c.id === second.event).citations[0].page_sha256 = "0".repeat(64);
    const memory = collectMemory(store, [altered]);
    const group = memory.groups[0];
    assert.equal(group.rows.length, verifiedEvents - 2);
    assert.equal(group.unverified, 1);
    assert.equal(group.stale, 1);
    assert.equal(group.open.length, 1, "an unverified finding is an open point to check");
    assert.deepEqual(group.stale_pages, [`${altered.result.claims.find(c => c.id === second.event).citations[0].label} ${altered.result.claims.find(c => c.id === second.event).citations[0].page_label}`]);

    // The local copy has the real names; what a model may read has none.
    const markdown = memoryMarkdown(memory, store);
    assert.ok(markdown.includes("Anna Keller"), "the judge reads the memory with real names");
    assert.ok(markdown.includes("Offene Punkte"));
    const snapshot = memorySnapshot(store, memory);
    assert.deepEqual(leaks(JSON.stringify(snapshot)), []);
    assert.equal(snapshot.sha256, memorySha(snapshot));
    assert.ok(snapshot.groups[0].text.includes("M1."));
    assert.ok(snapshot.groups.some(g => g.key === "open" && g.text.includes("Not verified")));
  } finally { await cleanup(); }
});

test("a word registered after the run is replaced in the memory before any model reads it", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const run = await firstRun(store);
    assert.ok(collectMemory(store, [run]).groups[0].rows.some(r => r.items.some(i => i.text.includes("Duschrinnen"))));
    await store.changeRegister({ op: "add_entity", kind: "organisation", text: "Duschrinnen" });
    const replacement = store.register.entities.find(e => e.label === "Duschrinnen").replacement;
    const snapshot = memorySnapshot(store, collectMemory(store, [run]));
    const text = snapshot.groups.map(g => g.text).join("\n");
    assert.equal(text.includes("Duschrinnen"), false);
    assert.ok(text.includes(replacement));
    // The earlier release is void, and so is any snapshot taken before the change.
    assert.equal(store.consentValid(), false);
  } finally { await cleanup(); }
});

test("another model continues from the memory the release names; the requests carry it and nothing identifying", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const first = await firstRun(store);
    const snapshot = memorySnapshot(store, collectMemory(store, [first]));
    await store.release({ model: "qwen3:30b", provider: "openai", endpoint: "http://localhost:11434/v1", budgetChf: null, memory: snapshot });
    assert.equal(store.case.consent.memory.sha256, snapshot.sha256);

    const turns = demoProvider(store, "facts_evidence").turns;
    const bodies = [];
    const fetchImpl = async (url, init) => {
      bodies.push(init.body);
      const turn = turns[bodies.length - 1];
      const text = turn.filter(b => b.type === "text").map(b => b.text).join("\n");
      const calls = turn.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }));
      return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: calls.length ? "tool_calls" : "stop", message: { role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) };
    };
    const run = new AgentRun({ store, provider: new OpenAICompatibleProvider({ endpoint: "http://localhost:11434/v1", fetchImpl }), task: "facts_evidence", model: "qwen3:30b" });
    await run.run();
    const summary = run.summary();
    assert.equal(summary.status, "succeeded", JSON.stringify(summary.error));
    assert.equal(summary.memory.sha256, snapshot.sha256);
    assert.ok(summary.memory.findings > 0);
    assert.ok(summary.events.some(e => e.type === "memory"));

    const opening = JSON.parse(bodies[0]).messages[1].content;
    assert.ok(opening.includes("Case memory"), "the memory is in the opening message");
    assert.ok(opening.includes("never cite or quote it"));
    // Every memory line in the request is verbatim from the approved snapshot.
    const approved = new Set(snapshot.groups.flatMap(g => g.text.split("\n")));
    for (const line of opening.split("\n").filter(l => /^M\d+\./.test(l))) assert.ok(approved.has(line), line);
    for (const body of bodies) assert.deepEqual(leaks(body), []);
  } finally { await cleanup(); }
});

test("a memory snapshot changed on disk voids the release: nothing is sent", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const first = await firstRun(store);
    const snapshot = memorySnapshot(store, collectMemory(store, [first]));
    await store.release({ model: "claude-opus-5-5", budgetChf: null, memory: snapshot });
    const file = join(store.dir, "memory", "released", `${snapshot.sha256}.json`);
    const stored = JSON.parse(await readFile(file, "utf8"));
    stored.groups[0].text += "\nM99. A finding nobody approved.";
    await writeFile(file, JSON.stringify(stored));
    const provider = new ScriptedProvider([]);
    const run = new AgentRun({ store, provider, task: "chronology", model: "claude-opus-5-5" });
    await run.run();
    assert.equal(run.summary().status, "failed");
    assert.equal(run.summary().error.code, "consent_required");
    assert.equal(provider.calls.length, 0);
  } finally { await cleanup(); }
});

test("the memory prompt puts the judge's notes and the same task first and keeps to its budget", () => {
  const snapshot = { groups: [
    { key: "a", task: "chronology", findings: 2, text: "## chronology\nM1. one\nM2. two" },
    { key: "b", task: "facts_evidence", findings: 1, text: "## facts\nM3. three" },
    { key: "notes", task: null, findings: 0, notes: 1, text: "## notes\nN1 (adopted): x" },
    { key: "open", task: null, findings: 0, text: "## open\n- check" },
  ] };
  const prompt = memoryPrompt(snapshot, "facts_evidence");
  assert.deepEqual(prompt.groups.map(g => g.key), ["notes", "b", "a", "open"]);
  assert.equal(prompt.findings, 3);
  const short = memoryPrompt(snapshot, "chronology", 800);
  assert.ok(short.text.length <= 800 + 80);
  assert.ok(short.text.includes("not shown here for length"));
});

function call(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

test("results after a release wait for the next release; the memory is on disk and can be left out", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const { root, cleanup } = await freshCase();
  const port = 4300 + Math.floor(Math.random() * 400);
  const app = await startServer({ port, folder: root, openBrowser: false, log: () => {} });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const paired = await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } });
  const cookie = paired.headers["set-cookie"][0].split(";")[0];
  const post = (path, body) => call(port, path, { method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CourtOS": "1" }, body });
  const get = async (path) => JSON.parse((await call(port, path, { headers: { Cookie: cookie } })).body);

  assert.equal((await post("/api/release", { model: "claude-opus-5-5" })).status, 200);
  let c = (await get("/api/state")).case;
  assert.equal(c.consent.memory, null, "nothing to carry yet");
  assert.equal(c.memory.pending, false);

  const { id } = JSON.parse((await post("/api/runs", { task: "chronology", demo: true })).body);
  for (let i = 0; i < 200 && (await get(`/api/runs/${id}`)).status === "running"; i++) await new Promise(r => setTimeout(r, 100));
  c = (await get("/api/state")).case;
  assert.ok(c.memory.findings > 0);
  assert.equal(c.memory.pending, true, "the new findings are not in the release");
  assert.equal(c.consent_valid, true, "a new result does not void the release");
  const markdown = await readFile(join(root, ".courtos", "memory", "memory.md"), "utf8");
  assert.ok(markdown.includes("Anna Keller"));
  const memory = await get("/api/memory");
  assert.equal(memory.released, null);
  assert.deepEqual(leaks(JSON.stringify(memory.preview)), []);

  assert.equal((await post("/api/release", { model: "claude-opus-5-5" })).status, 200);
  c = (await get("/api/state")).case;
  assert.equal(c.consent.memory.sha256, memory.preview.sha256);
  assert.equal(c.memory.pending, false);
  assert.equal((await get("/api/memory")).released.sha256, memory.preview.sha256);

  assert.equal((await post("/api/release", { model: "claude-opus-5-5", memory: false })).status, 200);
  c = (await get("/api/state")).case;
  assert.equal(c.consent.memory, null);
  assert.equal(c.memory.pending, false, "left out on purpose: no reminder");
});
