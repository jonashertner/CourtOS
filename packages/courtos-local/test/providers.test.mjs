import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRun } from "../src/agent/runner.mjs";
import { demoProvider } from "../src/agent/demo.mjs";
import { OpenAICompatibleProvider, normaliseEndpoint } from "../src/agent/providers.mjs";
import { startServer } from "../src/server.mjs";
import { freePort, freshCase, ORIGINAL_IDENTIFIERS } from "./helpers.mjs";

/** A stand-in for an OpenAI-compatible service that answers with the given Messages-shaped turns. */
function fakeService(turns) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const turn = turns[calls.length - 1];
    const text = turn.filter(b => b.type === "text").map(b => b.text).join("\n");
    const toolCalls = turn.filter(b => b.type === "tool_use").map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }));
    const reply = { choices: [{ finish_reason: toolCalls.length ? "tool_calls" : "stop", message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) } }], usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 400 } } };
    return { ok: true, status: 200, json: async () => reply };
  };
  return { calls, fetchImpl };
}

test("only https, or http on this computer, is accepted as a model address", () => {
  assert.equal(normaliseEndpoint("http://localhost:11434/v1/"), "http://localhost:11434/v1");
  assert.equal(normaliseEndpoint("https://api.mistral.ai/v1"), "https://api.mistral.ai/v1");
  for (const bad of ["http://192.168.1.20:11434/v1", "http://models.example.ch/v1", "https://user:pw@api.example.com/v1", "https://api.example.com/v1?key=x", "ftp://localhost/v1", "localhost:11434"]) {
    assert.throws(() => normaliseEndpoint(bad), { code: "invalid_endpoint" }, bad);
  }
  assert.throws(() => new OpenAICompatibleProvider({ endpoint: "https://api.openai.com/v1" }), { code: "api_key_missing" });
  assert.doesNotThrow(() => new OpenAICompatibleProvider({ endpoint: "http://127.0.0.1:1234/v1" }));
});

test("any model behind an OpenAI-compatible endpoint runs the same loop and checks; what is stored is exactly what was sent", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "llama3.3:70b", provider: "openai", endpoint: "https://models.example.ch/v1", budgetChf: null });
    const turns = demoProvider(store, "chronology").turns;
    const service = fakeService(turns);
    const provider = new OpenAICompatibleProvider({ endpoint: "https://models.example.ch/v1", apiKey: "test-key-123456", fetchImpl: service.fetchImpl });
    const run = new AgentRun({ store, provider, task: "chronology", model: "llama3.3:70b" });
    await run.run();
    const summary = run.summary();
    assert.equal(summary.status, "succeeded", JSON.stringify(summary.error));
    assert.equal(summary.endpoint, "https://models.example.ch/v1");
    assert.ok(summary.events.some(e => e.type === "rejected"), "a rejected submission goes back to the model and is repaired");
    assert.ok(summary.result.claims.length > 0);
    assert.equal(service.calls.length, turns.length);
    for (const [i, call] of service.calls.entries()) {
      assert.equal(call.url, "https://models.example.ch/v1/chat/completions");
      assert.equal(call.headers.Authorization, "Bearer test-key-123456");
      const stored = await readFile(join(store.dir, "runs", summary.id, "requests", `${String(i + 1).padStart(3, "0")}.json`), "utf8");
      assert.equal(stored, call.body, "the audit copy is byte for byte the request that went out");
      for (const identifier of ORIGINAL_IDENTIFIERS) assert.equal(call.body.includes(identifier), false, `request leaks ${identifier}`);
      const body = JSON.parse(call.body);
      assert.equal(body.messages[0].role, "system");
      assert.ok(body.tools.every(t => t.type === "function" && t.function.parameters));
      assert.equal("thinking" in body || "user" in body || "max_tokens" in body, false, "nothing beyond model, messages and tools");
    }
    // Every tool call is answered with its own result, matched by id.
    const last = JSON.parse(service.calls.at(-1).body);
    const asked = last.messages.flatMap(m => m.tool_calls ?? []).map(c => c.id);
    const answered = last.messages.filter(m => m.role === "tool").map(m => m.tool_call_id);
    assert.deepEqual(answered, asked);
    assert.deepEqual(summary.usage, { input_tokens: 600 * turns.length, output_tokens: 100 * turns.length, cache_read_input_tokens: 400 * turns.length, cache_creation_input_tokens: 0 });
  } finally { await cleanup(); }
});

test("a real name written by a local model stops the run before the next request", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "qwen3:32b", provider: "openai", endpoint: "http://localhost:11434/v1", budgetChf: null });
    const service = fakeService([[{ type: "text", text: `Die Klägerin ist ${ORIGINAL_IDENTIFIERS[0]}.` }, { type: "tool_use", id: "c1", name: "list_documents", input: {} }]]);
    const provider = new OpenAICompatibleProvider({ endpoint: "http://localhost:11434/v1", fetchImpl: service.fetchImpl });
    const run = new AgentRun({ store, provider, task: "chronology", model: "qwen3:32b" });
    await run.run();
    assert.equal(run.summary().status, "blocked");
    assert.equal(service.calls.length, 1, "the second request was never sent");
    assert.equal(service.calls[0].headers.Authorization, undefined, "no key goes to a model on this computer");
  } finally { await cleanup(); }
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

test("a release names the model and its address; a remote address needs its own key, a local one none", async (t) => {
  process.env.HOME = await mkdtemp(join(tmpdir(), "courtos-home-"));
  const { root, cleanup } = await freshCase();
  const port = await freePort();
  const app = await startServer({ port, folder: root, openBrowser: false, log: () => {} });
  t.after(async () => { app.close(); await cleanup(); });
  const origin = `http://localhost:${port}`;
  const token = new URL(app.pairUrl).hash.slice("#pair=".length);
  const paired = await call(port, "/api/pair", { method: "POST", headers: { Origin: origin, "X-CourtOS": "1" }, body: { token } });
  const pairedCookie = paired.headers["set-cookie"][0].split(";")[0];
  const post = (path, body) => call(port, path, { method: "POST", headers: { Cookie: pairedCookie, Origin: origin, "X-CourtOS": "1" }, body });
  const state = async () => JSON.parse((await call(port, "/api/state", { headers: { Cookie: pairedCookie } })).body);

  assert.equal((await post("/api/release", { provider: "openai", endpoint: "http://10.0.0.5:11434/v1", model: "llama3.3:70b" })).status, 400, "plain http only on this computer");
  assert.equal((await post("/api/release", { provider: "openai", endpoint: "http://localhost:11434/v1", model: "" })).status, 400, "a model name is required");

  assert.equal((await post("/api/release", { provider: "openai", endpoint: "http://localhost:11434/v1/", model: "llama3.3:70b" })).status, 200);
  let c = (await state()).case;
  assert.deepEqual([c.consent.provider, c.consent.endpoint, c.consent.model, c.consent_valid, c.provider_ready], ["openai", "http://localhost:11434/v1", "llama3.3:70b", true, true]);

  assert.equal((await post("/api/release", { provider: "openai", endpoint: "https://api.mistral.ai/v1", model: "mistral-large-latest" })).status, 200);
  c = (await state()).case;
  assert.equal(c.provider_ready, false, "a remote address needs a key");
  // A key in the environment counts only for the address named with it.
  process.env.COURTOS_API_KEY = "env-test-key-0000";
  process.env.COURTOS_API_ENDPOINT = "https://api.openai.com/v1";
  assert.equal((await state()).case.provider_ready, false, "a key for another address is not used");
  process.env.COURTOS_API_ENDPOINT = "https://api.mistral.ai/v1/";
  assert.equal((await state()).case.provider_ready, true);
  delete process.env.COURTOS_API_KEY; delete process.env.COURTOS_API_ENDPOINT;
  assert.equal((await post("/api/settings/key", { endpoint: "https://api.mistral.ai/v1", key: "short" })).status, 400);
  assert.equal((await post("/api/settings/key", { endpoint: "https://api.mistral.ai/v1", key: "mistral-test-key-0000" })).status, 200);
  assert.equal((await state()).case.provider_ready, true);
  const keyFile = join(process.env.HOME, ".config", "courtos", "endpoint-keys.json");
  assert.equal((await stat(keyFile)).mode & 0o777, 0o600);
  assert.equal(JSON.stringify(await state()).includes("mistral-test-key-0000"), false, "the key never goes back to a page");

  // Claude remains the default when no provider is named.
  assert.equal((await post("/api/release", { model: "claude-opus-5-5" })).status, 200);
  c = (await state()).case;
  assert.deepEqual([c.consent.provider, c.consent.endpoint, c.consent.model], ["anthropic", null, "claude-opus-5-5"]);
});
