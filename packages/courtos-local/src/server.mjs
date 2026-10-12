// Loopback server for the browser workspace and the Word task pane.
// - binds to 127.0.0.1 only and rejects any other Host header (DNS rebinding);
// - requires a paired session cookie and, for writes, the exact own Origin and
//   a custom header (no CORS is ever granted);
// - exposes no file-path, shell or arbitrary URL operation.
import { execFile } from "node:child_process";
import { randomInt } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdir, readFile, stat, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { CaseStore } from "./caseStore.mjs";
import { AgentRun } from "./agent/runner.mjs";
import { AnthropicProvider, DEFAULT_MODEL } from "./agent/providers.mjs";
import { DEMO_QUESTION, demoProvider, isDemoFolder } from "./agent/demo.mjs";
import { TASKS } from "./agent/tasks.mjs";
import { wikiMarkdown } from "./wiki.mjs";
import { OpenCaseLaw } from "./opencaselaw.mjs";
import { checkCitations } from "./citecheck.mjs";
import { backupArchive } from "./backup.mjs";
import { CourtosError, randomId, readJson, writeAtomic } from "./util.mjs";

const WEB = new URL("../web/", import.meta.url);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml" };
// Resolved at call time so HOME can be redirected (tests, managed installs).
const CONFIG = () => join(homedir(), ".config", "courtos");
const KEY = () => join(CONFIG(), "anthropic-key");
const RECENT = () => join(CONFIG(), "recent.json");

export async function loadCertificates() {
  const dir = join(homedir(), ".office-addin-dev-certs");
  try {
    return { cert: await readFile(join(dir, "localhost.crt")), key: await readFile(join(dir, "localhost.key")) };
  } catch { return null; }
}

async function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try { return (await readFile(KEY(), "utf8")).trim() || null; } catch { return null; }
}

function chooseFolderMac() {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", 'POSIX path of (choose folder with prompt "Fallordner für CourtOS wählen")'], { timeout: 5 * 60 * 1000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim());
    });
  });
}

export async function startServer({ port = 4311, folder = null, openBrowser = true, demoFolder = null, log = console.log } = {}) {
  const tls = await loadCertificates();
  const scheme = tls ? "https" : "http";
  const origin = `${scheme}://localhost:${port}`;
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const allowedOrigins = new Set([`${scheme}://localhost:${port}`, `${scheme}://127.0.0.1:${port}`]);
  const pairToken = randomId(24);
  const sessions = new Set();
  const codes = new Map(); // code → expiry
  const clients = new Set();
  let failedPairs = 0;
  let store = null;
  let currentRun = null;
  const runs = new Map();

  const broadcast = (type, data) => {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.write(payload);
  };

  async function openFolder(path) {
    if (currentRun?.status === "running") throw new CourtosError("run_in_progress", undefined, 409);
    store?.close();
    store = await CaseStore.open(path);
    store.on("change", (change) => broadcast("case", change));
    broadcast("case", { kind: "opening" });
    await store.ensureLoaded();
    await store.scan({ progress: (p) => broadcast("scan", p) });
    store.watch();
    runs.clear();
    for (const run of await listRuns(store)) runs.set(run.id, run);
    try {
      await mkdir(CONFIG(), { recursive: true });
      const recent = (await readJson(RECENT(), [])).filter(p => p !== store.root);
      await writeFile(RECENT(), JSON.stringify([store.root, ...recent].slice(0, 6)));
    } catch { /* recent list is a convenience */ }
    broadcast("case", { kind: "opened" });
  }

  const queue = [];   // pending pipeline steps: { task, question, notes, language, demo }
  let caselaw = null;

  async function state() {
    const key = Boolean(await apiKey());
    const base = { origin, settings: { has_key: key, model: DEFAULT_MODEL }, tasks: Object.keys(TASKS), demo_question: DEMO_QUESTION };
    if (!store) return { ...base, case: null, recent: await readJson(RECENT(), []).catch(() => []) };
    const register = store.register.entities;
    return {
      ...base,
      case: {
        name: store.root.split("/").at(-1), root: store.root, sync: store.case.sync, consent: store.case.consent,
        consent_valid: store.consentValid(), issues: store.issues, demo: isDemoFolder(store.mirror),
        mirror: { sha256: store.mirror?.sha256, sections: store.mirror?.sections.length ?? 0, register_rev: store.register.rev },
        register: { total: register.length, replace: register.filter(e => e.decision === "replace").length },
        anonymisation: store.anonymisationReport ?? null,
        parties: store.case.parties,
        language: { code: store.lang, source: store.case.language?.source ?? "default" },
        sources: store.sources.filter(s => !s.missing).map(({ id, rel_path, name, ext, label, role, party, pages, text_pages, ocr_pages, status, include, version, guess }) => ({ id, rel_path, name, ext, label, role, party, pages, text_pages, ocr_pages, status, include, version, guess })),
        missing: store.sources.filter(s => s.missing).map(s => ({ id: s.id, name: s.name })),
        notes: store.notes,
        procedure: store.procedure,
      },
      queue: queue.map(q => q.task),
      current: currentRun?.status === "running" ? currentRun.id : null,
      runs: [...runs.values()].map(r => ({ id: r.id, task: r.task, question: r.question, status: r.status, started: r.started, finished: r.finished, model: r.model })).sort((a, b) => String(b.started).localeCompare(String(a.started))),
    };
  }

  function launch({ task, question = "", language = "de", demo = false, notes = [] }) {
    let provider, model;
    if (demo) {
      if (!isDemoFolder(store.mirror) || !["chronology", "facts_evidence", "source_chat"].includes(task)) throw new CourtosError("demo_not_available");
      if (task === "source_chat" && question.trim() !== DEMO_QUESTION) throw new CourtosError("demo_question_only");
      provider = demoProvider(store, task);
      model = "demo-replay";
    } else {
      provider = new AnthropicProvider(launch.key);
      model = store.case.consent.model || DEFAULT_MODEL;
    }
    caselaw ??= new OpenCaseLaw({ cacheDir: join(store.dir, "public") });
    const run = new AgentRun({ store, provider, task, question, language, model, notes, caselaw: demo ? null : caselaw, limits: { maxTotalTokens: store.case.consent.token_limit ?? 3_000_000 } });
    currentRun = run;
    runs.set(run.id, run.summary());
    run.on("event", (event) => broadcast("run", { id: run.id, event }));
    run.on("usage", (usage) => broadcast("usage", { id: run.id, usage }));
    run.on("done", async (summary) => {
      runs.set(run.id, summary);
      broadcast("run_done", { id: run.id, status: summary.status });
      if (summary.status === "succeeded") {
        try { await writeAtomic(join(store.dir, "wiki", `${task}.md`), wikiMarkdown(summary, store)); } catch { /* wiki is derived */ }
      }
      // The pipeline continues only after a success; a failure stops it visibly.
      const next = queue.shift();
      if (next && summary.status === "succeeded" && store.consentValid()) {
        try { const started = launch(next); broadcast("run_started", { id: started.id, task: next.task }); }
        catch { queue.length = 0; }
      } else queue.length = 0;
      broadcast("case", { kind: "queue" });
    });
    run.run();
    return { id: run.id };
  }

  async function startRuns(request) {
    if (!store) throw new CourtosError("no_case", undefined, 409);
    if (currentRun?.status === "running") throw new CourtosError("run_in_progress", undefined, 409);
    if (!store.consentValid()) throw new CourtosError("consent_required", undefined, 409);
    const steps = Array.isArray(request.pipeline) ? request.pipeline : [request.task];
    if (!steps.length || steps.length > 8 || steps.some(t => !TASKS[t])) throw new CourtosError("unknown_task");
    const notes = Array.isArray(request.notes) ? request.notes.filter(id => typeof id === "string").slice(0, 40) : [];
    const language = ["de", "fr", "it", "en"].includes(request.language) ? request.language : "de";
    if (!request.demo) {
      launch.key = await apiKey();
      if (!launch.key) throw new CourtosError("api_key_missing", undefined, 409);
    }
    const [first, ...rest] = steps.map(task => ({ task, question: typeof request.question === "string" ? request.question : "", language, demo: Boolean(request.demo), notes }));
    queue.length = 0;
    queue.push(...rest);
    return launch(first);
  }

  async function body(req, limit = 64 * 1024) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw new CourtosError("body_too_large", undefined, 413);
      chunks.push(chunk);
    }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CourtosError("invalid_json"); }
  }

  const cookie = (req) => /(?:^|;\s*)courtos_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? "")?.[1];
  const securityHeaders = (res, path) => {
    const word = path === "/word.html" || path === "/word.js";
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'",
      // Office.js is loaded from Microsoft in the Word pane only.
      `script-src 'self'${word ? " https://appsforoffice.microsoft.com https://*.office.net https://*.microsoft.com" : ""}`,
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      `connect-src 'self'${word ? " https://appsforoffice.microsoft.com https://*.office.net https://*.microsoft.com" : ""}`,
      "frame-src 'self' blob:", "object-src 'self'",
      `frame-ancestors ${word ? "'self' https://*.officeapps.live.com https://*.office.com https://*.office365.com https://*.microsoft.com https://*.sharepoint.com" : "'self'"}`,
    ].join("; "));
  };
  const send = (res, status, value) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  };

  async function handle(req, res) {
    try {
      await route(req, res);
    } catch (error) {
      // One place for every failure; never a second set of headers, never a crash.
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status ?? 500;
      send(res, status, { error: error.code ?? "internal_error", detail: error.code ? error.detail ?? null : null });
    }
  }

  async function route(req, res) {
    const url = new URL(req.url, origin);
    const path = url.pathname;
    securityHeaders(res, path);
    if (!allowedHosts.has(req.headers.host ?? "")) return send(res, 421, { error: "host_rejected" });

    if (!path.startsWith("/api/")) {
      const file = path === "/" ? "index.html" : path.slice(1);
      if (!/^[a-z0-9_-]+\.(html|js|css|svg|png|xml)$/i.test(file)) return send(res, 404, { error: "not_found" });
      try {
        const data = await readFile(new URL(file, WEB));
        res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
        return res.end(data);
      } catch { return send(res, 404, { error: "not_found" }); }
    }

    // Requests from other sites (including other localhost ports) are refused,
    // also for GET, so no foreign page can drive or probe this server.
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") return send(res, 403, { error: "cross_site_rejected" });
    const write = req.method !== "GET";
    if (write) {
      if (!allowedOrigins.has(req.headers.origin ?? "") || req.headers["x-courtos"] !== "1") return send(res, 403, { error: "origin_rejected" });
    }
    if (path === "/api/pair" && req.method === "POST") {
      // After 10 failed attempts pairing is closed until CourtOS is restarted.
      if (failedPairs >= 10) { codes.clear(); return send(res, 429, { error: "too_many_attempts" }); }
      const { token, code } = await body(req, 1024);
      const now = Date.now();
      for (const [key, expiry] of codes) if (expiry <= now) codes.delete(key);
      const valid = (typeof token === "string" && token === pairToken) || (typeof code === "string" && codes.has(code));
      if (!valid) {
        failedPairs++;
        return send(res, 403, { error: "pairing_failed" });
      }
      if (code) codes.delete(code);
      const session = randomId(24);
      sessions.add(session);
      res.setHeader("Set-Cookie", `courtos_session=${session}; Path=/; HttpOnly; SameSite=${tls ? "None; Secure" : "Strict"}`);
      return send(res, 200, { ok: true });
    }
    if (!sessions.has(cookie(req))) return send(res, 401, { error: "not_paired" });

    try {
      if (path === "/api/state" && req.method === "GET") return send(res, 200, await state());
      if (path === "/api/events" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 20000);
        req.on("close", () => { clearInterval(ping); clients.delete(res); });
        return;
      }
      if (path === "/api/pair/code" && req.method === "POST") {
        const code = String(randomInt(100000, 1000000));
        codes.clear(); // only the newest code is valid
        codes.set(code, Date.now() + 5 * 60 * 1000);
        return send(res, 200, { code, expires_in: 300 });
      }
      if (path === "/api/folder/choose" && req.method === "POST") {
        if (process.platform !== "darwin") throw new CourtosError("native_dialog_unavailable");
        const chosen = await chooseFolderMac();
        if (!chosen) return send(res, 200, { cancelled: true });
        await openFolder(chosen);
        return send(res, 200, { ok: true });
      }
      if (path === "/api/folder" && req.method === "POST") {
        const { path: folderPath, demo } = await body(req);
        if (demo) {
          if (!demoFolder) throw new CourtosError("demo_not_available");
          await openFolder(demoFolder);
        } else {
          const recent = await readJson(RECENT(), []).catch(() => []);
          // Only a folder chosen natively, given on the command line or listed
          // as recent may be opened; arbitrary paths from a page are refused.
          if (!recent.includes(folderPath) && folderPath !== folder) throw new CourtosError("folder_not_allowed", undefined, 403);
          await openFolder(folderPath);
        }
        return send(res, 200, { ok: true });
      }
      if (path === "/api/settings/key" && req.method === "POST") {
        const { key } = await body(req);
        if (typeof key !== "string" || !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) throw new CourtosError("invalid_key");
        await mkdir(CONFIG(), { recursive: true, mode: 0o700 });
        await writeFile(KEY(), key.trim(), { mode: 0o600 });
        await chmod(KEY(), 0o600);
        return send(res, 200, { ok: true });
      }
      if (!store) throw new CourtosError("no_case", undefined, 409);

      if (path === "/api/scan" && req.method === "POST") { await store.scan({ progress: (p) => broadcast("scan", p) }); return send(res, 200, { ok: true }); }
      if (path === "/api/register" && req.method === "GET") return send(res, 200, { entities: store.registerView(), rev: store.register.rev });
      if (path === "/api/register" && req.method === "POST") { await store.changeRegister(await body(req)); return send(res, 200, { ok: true, rev: store.register.rev }); }
      let match;
      if ((match = /^\/api\/sources\/(D\d{1,4})$/.exec(path)) && req.method === "POST") { await store.changeSource(match[1], await body(req)); return send(res, 200, { ok: true }); }
      if ((match = /^\/api\/view\/(D\d{1,4})$/.exec(path)) && req.method === "GET") {
        const mirrorDoc = store.mirror.documents.find(d => d.id === match[1]);
        const extracted = store.documents.get(match[1]);
        const map = store.maps[match[1]];
        if (!extracted) throw new CourtosError("source_unknown", undefined, 404);
        return send(res, 200, {
          id: match[1], pages: extracted.pages.map(page => ({
            n: page.n, label: page.label, has_text: page.has_text, original: page.text, sha256: page.sha256,
            mirror: mirrorDoc?.pages.find(p => p.n === page.n) ?? null,
            spans: (map?.pages.find(p => p.n === page.n)?.spans ?? []).map(s => ({ o: [s.original_start, s.original_end], d: [s.derivative_start, s.derivative_end], entity: s.entity_id, replacement: s.replacement })),
          })),
        });
      }
      if ((match = /^\/api\/original\/(D\d{1,4})$/.exec(path)) && req.method === "GET") {
        const { bytes, source } = await store.originalFile(match[1]);
        if (source.ext !== ".pdf") throw new CourtosError("not_a_pdf");
        res.writeHead(200, { "Content-Type": "application/pdf", "Cache-Control": "no-store", "Content-Disposition": "inline" });
        return res.end(bytes);
      }
      if (path === "/api/open-original" && req.method === "POST") {
        const { id } = await body(req);
        const { source } = await store.originalFile(id);
        if (process.platform === "darwin") execFile("open", [join(store.root, ...source.rel_path.split("/"))]);
        return send(res, 200, { ok: true });
      }
      if (path === "/api/release" && req.method === "POST") {
        const { model, token_limit } = await body(req);
        const consent = await store.release({ model: typeof model === "string" && /^[a-z0-9.-]{3,60}$/.test(model) ? model : DEFAULT_MODEL, budgetChf: null });
        consent.token_limit = Math.min(Math.max(Number(token_limit) || 1_500_000, 100_000), 10_000_000);
        await store.save();
        return send(res, 200, { ok: true, consent });
      }
      if (path === "/api/revoke" && req.method === "POST") { await store.revoke(); return send(res, 200, { ok: true }); }
      if (path === "/api/runs" && req.method === "POST") return send(res, 200, await startRuns(await body(req)));
      if (path === "/api/queue/cancel" && req.method === "POST") { queue.length = 0; currentRun?.cancel(); return send(res, 200, { ok: true }); }
      if ((match = /^\/api\/register\/(E[0-9a-f]{12})\/occurrences$/.exec(path)) && req.method === "GET") return send(res, 200, { occurrences: store.occurrences(match[1]) });
      if (path === "/api/register/occurrence" && req.method === "POST") { await store.setOccurrence(await body(req)); return send(res, 200, { ok: true }); }
      if (path === "/api/case/language" && req.method === "POST") {
        const { language } = await body(req);
        if (currentRun?.status === "running" || queue.length) throw new CourtosError("run_in_progress", undefined, 409);
        await store.setLanguage(String(language ?? ""));
        return send(res, 200, { ok: true, language: store.lang });
      }
      if (path === "/api/parties" && req.method === "POST") { await store.setParties((await body(req)).parties); return send(res, 200, { ok: true }); }
      if (path === "/api/notes" && req.method === "POST") return send(res, 200, await store.addNote(await body(req, 128 * 1024)));
      if ((match = /^\/api\/notes\/(N\d{1,5})$/.exec(path)) && req.method === "POST") return send(res, 200, await store.updateNote(match[1], await body(req, 128 * 1024)));
      if ((match = /^\/api\/notes\/(N\d{1,5})\/delete$/.exec(path)) && req.method === "POST") { await store.deleteNote(match[1]); return send(res, 200, { ok: true }); }
      if (path === "/api/procedure" && req.method === "POST") { await store.changeProcedure(await body(req, 256 * 1024)); return send(res, 200, { ok: true }); }
      if (path === "/api/caselaw/search" && req.method === "POST") {
        const { query, language } = await body(req);
        store.guard().check(String(query ?? ""));
        caselaw ??= new OpenCaseLaw({ cacheDir: join(store.dir, "public") });
        return send(res, 200, await caselaw.search(query, { limit: 10, language }));
      }
      if ((match = /^\/api\/caselaw\/decision\/([A-Za-z0-9_.\-]{3,120})$/.exec(path)) && req.method === "GET") {
        caselaw ??= new OpenCaseLaw({ cacheDir: join(store.dir, "public") });
        const decision = await caselaw.decision(match[1]);
        if (!decision) throw new CourtosError("decision_not_found", undefined, 404);
        return send(res, 200, decision);
      }
      if (path === "/api/citecheck" && req.method === "POST") {
        // Either the case documents (originals stay local) or text sent by the Word pane.
        const input = await body(req, 2 * 1024 * 1024);
        caselaw ??= new OpenCaseLaw({ cacheDir: join(store.dir, "public") });
        let paragraphs;
        if (Array.isArray(input.paragraphs)) paragraphs = input.paragraphs.slice(0, 5000).map((text, i) => ({ ref: { paragraph: i }, text: String(text ?? "").slice(0, 20000) }));
        else paragraphs = store.includedDocuments().flatMap(d => d.pages.filter(p => p.has_text).map(p => ({ ref: { doc: d.id, label: d.label, page: p.n }, text: p.text })));
        return send(res, 200, await checkCitations(paragraphs, { decision: (id) => caselaw.decision(id), guard: store.guard(), limit: 120 }));
      }
      if (path === "/api/backup" && req.method === "GET") {
        const archive = await backupArchive(store);
        res.writeHead(200, { "Content-Type": "application/zip", "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="courtos-${store.root.split("/").at(-1).replace(/[^A-Za-z0-9._-]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.zip"` });
        return res.end(archive);
      }
      if ((match = /^\/api\/runs\/([\w-]{8,80})$/.exec(path)) && req.method === "GET") {
        const run = currentRun?.id === match[1] ? currentRun.summary() : runs.get(match[1]);
        if (!run) throw new CourtosError("run_unknown", undefined, 404);
        return send(res, 200, run);
      }
      if ((match = /^\/api\/runs\/([\w-]{8,80})\/cancel$/.exec(path)) && req.method === "POST") {
        if (currentRun?.id === match[1]) { queue.length = 0; currentRun.cancel(); }
        return send(res, 200, { ok: true });
      }
      if ((match = /^\/api\/runs\/([\w-]{8,80})\/requests\/(\d{1,3})$/.exec(path)) && req.method === "GET") {
        const file = join(store.dir, "runs", match[1], "requests", `${match[2].padStart(3, "0")}.json`);
        const data = await readFile(file).catch(() => { throw new CourtosError("request_unknown", undefined, 404); });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(data);
      }
      if ((match = /^\/api\/runs\/([\w-]{8,80})\/markdown$/.exec(path)) && req.method === "GET") {
        const run = runs.get(match[1]);
        if (!run?.result) throw new CourtosError("run_unknown", undefined, 404);
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(wikiMarkdown(run, store));
      }
      return send(res, 404, { error: "not_found" });
    } catch (error) {
      const status = error.status ?? 500;
      return send(res, status, { error: error.code ?? "internal_error", detail: error.code ? error.detail ?? null : null });
    }
  }

  const server = tls ? createHttpsServer(tls, handle) : createHttpServer(handle);
  server.on("clientError", (_error, socket) => { try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch { /* closed */ } });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  if (folder) await openFolder(folder);
  const pairUrl = `${origin}/#pair=${pairToken}`;
  log(`CourtOS läuft auf ${origin}`);
  log(`Im Browser öffnen: ${pairUrl}`);
  if (openBrowser && process.platform === "darwin") execFile("open", [pairUrl]);
  return { server, origin, pairUrl, close: () => { store?.close(); for (const c of clients) c.end(); server.close(); } };
}

async function listRuns(store) {
  const { readdir } = await import("node:fs/promises");
  const out = [];
  try {
    for (const entry of await readdir(join(store.dir, "runs"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const run = await readJson(join(store.dir, "runs", entry.name, "run.json"), null).catch(() => null);
      if (run) out.push(run);
    }
  } catch { /* none yet */ }
  return out;
}

export { stat };
