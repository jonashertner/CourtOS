// Loopback server for the browser workspace and the Word task pane.
// - binds to 127.0.0.1 only and rejects any other Host header (DNS rebinding);
// - requires a paired session cookie and, for writes, the exact own Origin and
//   a custom header (no CORS is ever granted);
// - exposes no file-path, shell or arbitrary URL operation.
import { execFile } from "node:child_process";
import { randomInt } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdir, readFile, realpath, stat, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CaseStore } from "./caseStore.mjs";
import { addCase, caseForDocument, caseSummary, defaultWorkFolder, loadCases, moveWork, removeCase, updateCase, workFolderFor } from "./cases.mjs";
import { WORKSPACE_DIR, syncWarning } from "./scan.mjs";
import { AgentRun } from "./agent/runner.mjs";
import { AnthropicProvider, DEFAULT_MODEL, OpenAICompatibleProvider, isLocalEndpoint, normaliseEndpoint } from "./agent/providers.mjs";
import { DEMO_QUESTION, demoProvider, isDemoFolder } from "./agent/demo.mjs";
import { TASKS } from "./agent/tasks.mjs";
import { listProducts, productPath, productsFolder, resultMarkdown, runLanguage, writeProducts } from "./products.mjs";
import { collectMemory, memoryMarkdown, memorySnapshot } from "./memory.mjs";
import { OpenCaseLaw } from "./opencaselaw.mjs";
import { checkCitations } from "./citecheck.mjs";
import { backupArchive } from "./backup.mjs";
import { staleness } from "./verify.mjs";
import { citationRects, pageLayouts } from "./layout.mjs";
import { CourtosError, randomId, readJson, writeAtomic } from "./util.mjs";

const WEB = new URL("../web/", import.meta.url);
// pdf.js for showing original pages in the browser, served from the installed package.
const PDFJS = pathToFileURL(dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json")) + "/");
const VENDOR = { "vendor/pdf.min.mjs": "build/pdf.min.mjs", "vendor/pdf.worker.min.mjs": "build/pdf.worker.min.mjs" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".pfb": "application/octet-stream", ".ttf": "font/ttf", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml" };
// Resolved at call time so HOME can be redirected (tests, managed installs).
const CONFIG = () => join(homedir(), ".config", "courtos");
const KEY = () => join(CONFIG(), "anthropic-key");
const PREFS = () => join(CONFIG(), "preferences.json");
const ENDPOINT_KEYS = () => join(CONFIG(), "endpoint-keys.json");
const UI_LANGUAGES = ["de", "fr", "it", "en"];

/** Where the certificate for https://localhost is looked for: COURTOS_CERT_DIR, the Office
 *  developer certificates, then the ones the CourtOS installer made for this computer. */
export function certificateDirs(env = process.env, platform = process.platform) {
  const installed = platform === "darwin" ? "/Library/Application Support/CourtOS/certs"
    : platform === "win32" && env.ProgramData ? join(env.ProgramData, "CourtOS", "certs") : null;
  return [env.COURTOS_CERT_DIR, join(homedir(), ".office-addin-dev-certs"), installed].filter(Boolean);
}

/** The first folder with a PEM pair (localhost.crt, localhost.key). */
export async function loadCertificates(dirs = certificateDirs()) {
  for (const dir of dirs) {
    try { return { cert: await readFile(join(dir, "localhost.crt")), key: await readFile(join(dir, "localhost.key")) }; } catch { /* next folder */ }
  }
  return null;
}

async function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try { return (await readFile(KEY(), "utf8")).trim() || null; } catch { return null; }
}

/** The key saved for exactly this endpoint, or COURTOS_API_KEY when COURTOS_API_ENDPOINT names it. A key never goes to another address. */
async function endpointKey(endpoint) {
  if (process.env.COURTOS_API_KEY && process.env.COURTOS_API_ENDPOINT) {
    try { if (normaliseEndpoint(process.env.COURTOS_API_ENDPOINT) === endpoint) return process.env.COURTOS_API_KEY; } catch { /* an unusable address in the environment names no endpoint */ }
  }
  const keys = await readJson(ENDPOINT_KEYS(), {}).catch(() => ({}));
  return typeof keys[endpoint] === "string" ? keys[endpoint] : null;
}

/** Whether a run under this release can start: a key where the endpoint needs one. */
async function providerReady(consent) {
  if (!consent) return false;
  if ((consent.provider ?? "anthropic") === "anthropic") return Boolean(await apiKey());
  return isLocalEndpoint(consent.endpoint) || Boolean(await endpointKey(consent.endpoint));
}

/** The system's own folder dialog; the page never names a path. Resolves to null when cancelled. */
function chooseFolder(prompt) {
  const timeout = 5 * 60 * 1000;
  return new Promise((resolve, reject) => {
    const done = (error, stdout) => resolve(error ? null : String(stdout).trim().split(/\r?\n/).at(-1) || null);
    if (process.platform === "darwin") {
      execFile("osascript", ["-e", `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`], { timeout }, done);
    } else if (process.platform === "win32") {
      const script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; " +
        "$d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='" + prompt.replace(/'/g, "''") + "'; $d.ShowNewFolderButton=$true; " +
        "$o=New-Object System.Windows.Forms.Form -Property @{TopMost=$true}; if($d.ShowDialog($o) -eq [System.Windows.Forms.DialogResult]::OK){ $d.SelectedPath }";
      execFile("powershell.exe", ["-NoProfile", "-STA", "-Command", script], { timeout, windowsHide: true }, done);
    } else {
      execFile("zenity", ["--file-selection", "--directory", `--title=${prompt}`], { timeout }, (error, stdout) =>
        error?.code === "ENOENT" ? reject(new CourtosError("native_dialog_unavailable")) : done(error, stdout));
    }
  });
}

/** Shows a file or folder with the system's own program (Finder, Explorer, the PDF viewer). */
function openPath(path) {
  if (process.platform === "darwin") execFile("open", [path]);
  else if (process.platform === "win32" && /^https?:/.test(path)) execFile("cmd.exe", ["/c", "start", "", path], { windowsHide: true }, () => {});
  else if (process.platform === "win32") execFile("explorer.exe", [path], { windowsHide: true }, () => { /* Explorer exits with 1 even on success */ });
  else execFile("xdg-open", [path], () => {});
}

export async function startServer({ port = 4311, folder = null, openBrowser = true, samples = [], log = console.log, choose = chooseFolder, show = openPath, certDirs = certificateDirs() } = {}) {
  const tls = await loadCertificates(certDirs);
  const scheme = tls ? "https" : "http";
  const origin = `${scheme}://localhost:${port}`;
  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
  const allowedOrigins = new Set([`${scheme}://localhost:${port}`, `${scheme}://127.0.0.1:${port}`]);
  // The startup link pairs one browser; a second browser needs a restart or a code.
  let pairToken = randomId(24);
  const layout = pageLayouts();
  const sessions = new Set();
  const codes = new Map(); // code → expiry
  const clients = new Set(); // { res, kind: "web" | "word" }
  let failedPairs = 0;
  let store = null;
  let current = null;   // the open case: { id, source, work, sample? }
  let pending = null;   // a case being added: { source, work }
  let caseList = null;  // summaries for the list, rebuilt after a change
  let currentRun = null;
  // A run is finished for everyone once its memory and work products are on disk.
  const settled = new WeakSet();
  const busy = () => Boolean(currentRun && !settled.has(currentRun));
  const runs = new Map();

  /** Send an event to every open view, or only to the browser ("web") or Word ("word") views. Returns how many received it. */
  const broadcast = (type, data, kind = null) => {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    let delivered = 0;
    for (const client of clients) if (!kind || client.kind === kind) { client.res.write(payload); delivered++; }
    return delivered;
  };
  const connected = () => ({ web: [...clients].filter(c => c.kind === "web").length, word: [...clients].filter(c => c.kind === "word").length });
  /** A citation of a stored result, by position: the views exchange references, never content. */
  const storedCitation = (runId, claimId, index) => {
    const claim = runs.get(String(runId))?.result?.claims.find(c => c.id === claimId);
    if (!claim) return null;
    const all = [...claim.citations, ...(claim.context ?? [])];
    return Number.isInteger(index) && index >= 0 && index < all.length ? { claim, citation: all[index] } : { claim, citation: null };
  };

  async function cases() {
    // A drive or share comes and goes without telling CourtOS: whether each folder is there is checked on every request.
    const reachable = (c) => Promise.all([stat(c.source).then(() => true, () => false), stat(join(c.work, WORKSPACE_DIR)).then(() => true, () => false)]);
    if (caseList && (await Promise.all(caseList.map(reachable))).some(([source, work], i) => source !== caseList[i].source_available || work !== caseList[i].started)) caseList = null;
    return (caseList ??= await Promise.all((await loadCases()).map(caseSummary)));
  }
  const casesChanged = () => { caseList = null; };

  async function openCase(entry) {
    if (busy()) throw new CourtosError("run_in_progress", undefined, 409);
    store?.close();
    store = null; current = null;
    store = await CaseStore.open(entry.source, { work: entry.work });
    current = entry;
    casesChanged();
    store.on("change", (change) => { casesChanged(); broadcast("case", change); if (["notes", "consent"].includes(change.kind)) writeMemory(); });
    broadcast("case", { kind: "opening" });
    await store.ensureLoaded();
    await store.scan({ progress: (p) => broadcast("scan", p) });
    store.watch();
    runs.clear();
    for (const run of await listRuns(store)) runs.set(run.id, run);
    await saveProducts([...runs.values()]);
    if (!entry.sample) await updateCase(entry.id, { opened: new Date().toISOString() }).catch(() => {});
    broadcast("case", { kind: "opened" });
  }

  /** The work products of finished runs, as files in the work folder. A folder that cannot be written (a read-only share) leaves the results in CourtOS only. */
  // The failure stays visible, with a retry, until a write succeeds.
  let productsFailed = false;
  async function saveProducts(list) {
    const before = productsFailed;
    try {
      const written = (await writeProducts(store, list, { case: { parties: store.partiesView() } })).length;
      productsFailed = false;
      if (written || before) { casesChanged(); broadcast("products", {}); }
    } catch (error) {
      log(`Arbeitsprodukte nicht geschrieben (${error.code ?? "Fehler"})`);
      productsFailed = true;
      broadcast("products", {});
    }
  }

  function closeCase() {
    if (busy()) throw new CourtosError("run_in_progress", undefined, 409);
    queue.length = 0;
    store?.close();
    store = null; current = null; productsFailed = false;
    runs.clear();
    casesChanged();
    broadcast("case", { kind: "closed" });
  }

  const listed = async (id) => {
    const entry = (await loadCases()).find(c => c.id === id);
    if (!entry) throw new CourtosError("case_unknown", undefined, 404);
    return entry;
  };
  const pendingView = () => pending && { name: basename(pending.source), source: pending.source, work: pending.work, same_folder: pending.work === pending.source, sync: syncWarning(pending.work) };

  // The case memory: collected from the runs on this computer, readable in
  // .courtos/memory/memory.md; a model reads only the snapshot a release names.
  const liveMemory = (finishing = []) => collectMemory(store, [...runs.values(), ...finishing]);
  async function writeMemory(finishing) {
    try { await writeAtomic(join(store.dir, "memory", "memory.md"), memoryMarkdown(liveMemory(finishing), store, store.case.consent?.memory ?? null)); } catch { /* derived */ }
  }
  function memoryState() {
    const live = liveMemory();
    const consent = store.case.consent;
    const released = consent?.memory ?? null;
    return {
      findings: live.findings, notes: live.notes.length,
      runs: live.groups.filter(g => g.findings).map(g => ({ task: g.task, model: g.model, endpoint: g.endpoint, findings: g.findings, finished: g.finished })),
      released,
      // Results or notes the current release does not carry yet.
      pending: Boolean(consent && !consent.memory_off && (live.findings || live.notes.length) && JSON.stringify(live.basis) !== JSON.stringify(released?.basis ?? [])),
    };
  }

  const queue = [];   // pending pipeline steps: { task, question, notes, language, demo }
  let caselaw = null;

  async function state() {
    const key = Boolean(await apiKey());
    const prefs = await readJson(PREFS(), {}).catch(() => ({}));
    const base = { origin, settings: { has_key: key, model: DEFAULT_MODEL, language: UI_LANGUAGES.includes(prefs.language) ? prefs.language : null }, clients: connected(), tasks: Object.keys(TASKS), demo_question: DEMO_QUESTION };
    base.cases = await cases();
    base.pending = pendingView();
    base.samples = samples.map(({ id, language, court, matter, offline }) => ({ id, language, court, matter, offline: Boolean(offline) }));
    if (!store) return { ...base, case: null };
    const register = store.register.entities;
    return {
      ...base,
      case: {
        id: current.id, sample: Boolean(current.sample), name: basename(store.root), root: store.root, work: store.work, same_folder: store.work === store.root,
        sync: store.case.sync, consent: store.case.consent, products: store.case.products_dir ? join(store.work, store.case.products_dir) : null, products_failed: productsFailed,
        consent_valid: store.consentValid(), provider_ready: await providerReady(store.case.consent), issues: store.issues, demo: isDemoFolder(store.mirror),
        mirror: { sha256: store.mirror?.sha256, sections: store.mirror?.sections.length ?? 0, register_rev: store.register.rev },
        register: { total: register.length, replace: register.filter(e => e.decision === "replace").length },
        anonymisation: store.anonymisationReport ?? null,
        parties: store.partiesView(),
        language: { code: store.lang, source: store.case.language?.source ?? "default" },
        sources: store.sources.filter(s => !s.missing).map(({ id, rel_path, name, ext, label, role, party, pages, text_pages, ocr_pages, status, include, version, guess }) => ({ id, rel_path, name, ext, label, role, party, pages, text_pages, ocr_pages, status, include, version, guess })),
        missing: store.sources.filter(s => s.missing).map(s => ({ id: s.id, name: s.name })),
        notes: store.notes,
        procedure: store.procedure,
        memory: memoryState(),
      },
      queue: queue.map(q => q.task),
      current: busy() ? currentRun.id : null,
      runs: [...runs.values()].map(r => ({ id: r.id, task: r.task, question: r.question, status: r.status, started: r.started, finished: r.finished, model: r.model, endpoint: r.endpoint ?? null, stale: staleness(store, r.result)?.stale ?? false })).sort((a, b) => String(b.started).localeCompare(String(a.started))),
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
      // The run uses exactly the model and endpoint the release names.
      const consent = store.case.consent;
      provider = (consent.provider ?? "anthropic") === "anthropic" ? new AnthropicProvider(launch.key) : new OpenAICompatibleProvider({ endpoint: consent.endpoint, apiKey: launch.key });
      model = consent.model || DEFAULT_MODEL;
    }
    caselaw ??= new OpenCaseLaw({ cacheDir: join(store.dir, "public") });
    const run = new AgentRun({ store, provider, task, question, language, model, notes, caselaw: demo ? null : caselaw, limits: { maxTotalTokens: store.case.consent.token_limit ?? 3_000_000 } });
    currentRun = run;
    runs.set(run.id, run.summary());
    run.on("event", (event) => broadcast("run", { id: run.id, event }));
    run.on("usage", (usage) => broadcast("usage", { id: run.id, usage }));
    run.on("done", async (summary) => {
      try {
        if (summary.status === "succeeded") {
          await writeMemory([summary]);
          await saveProducts([summary]);
        }
      } finally {
        runs.set(run.id, summary);
        settled.add(run);
      }
      casesChanged();
      broadcast("run_done", { id: run.id, status: summary.status });
      // The pipeline continues only after a success; a failure stops it visibly.
      const next = queue.shift();
      if (next && summary.status === "succeeded" && store.consentValid()) {
        try { const started = launch(next); broadcast("run_started", { id: started.id, task: next.task }); }
        catch { queue.length = 0; }
      } else queue.length = 0;
      broadcast("case", { kind: "queue" });
    });
    run.run();
    return { id: run.id, recorded: run.recorded };
  }

  async function startRuns(request) {
    if (!store) throw new CourtosError("no_case", undefined, 409);
    if (busy()) throw new CourtosError("run_in_progress", undefined, 409);
    if (!store.consentValid()) throw new CourtosError("consent_required", undefined, 409);
    const steps = Array.isArray(request.pipeline) ? request.pipeline : [request.task];
    if (!steps.length || steps.length > 8 || steps.some(t => !TASKS[t])) throw new CourtosError("unknown_task");
    const notes = Array.isArray(request.notes) ? request.notes.filter(id => typeof id === "string").slice(0, 40) : [];
    const language = ["de", "fr", "it", "en"].includes(request.language) ? request.language : "de";
    if (!request.demo) {
      const consent = store.case.consent;
      const anthropic = (consent.provider ?? "anthropic") === "anthropic";
      launch.key = anthropic ? await apiKey() : await endpointKey(consent.endpoint);
      if (!launch.key && (anthropic || !isLocalEndpoint(consent.endpoint))) throw new CourtosError("api_key_missing", undefined, 409);
    }
    const [first, ...rest] = steps.map(task => ({ task, question: typeof request.question === "string" ? request.question : "", language, demo: Boolean(request.demo), notes }));
    queue.length = 0;
    queue.push(...rest);
    const { id, recorded } = launch(first);
    await recorded;
    return { id };
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
      const vendored = VENDOR[path.slice(1)] ?? (/^\/vendor\/standard_fonts\/[A-Za-z0-9_-]+\.(pfb|ttf)$/.test(path) ? `standard_fonts/${path.split("/").pop()}` : null);
      if (vendored) {
        try {
          const data = await readFile(new URL(vendored, PDFJS));
          res.writeHead(200, { "Content-Type": MIME[extname(vendored)] ?? "application/octet-stream", "Cache-Control": "max-age=86400" });
          return res.end(data);
        } catch { return send(res, 404, { error: "not_found" }); }
      }
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
      if (code) codes.delete(code); else pairToken = null;
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
        const client = { res, kind: url.searchParams.get("client") === "word" ? "word" : "web" };
        clients.add(client);
        broadcast("clients", connected());
        const ping = setInterval(() => res.write(": ping\n\n"), 20000);
        req.on("close", () => { clearInterval(ping); clients.delete(client); broadcast("clients", connected()); });
        return;
      }
      if (path === "/api/pair/code" && req.method === "POST") {
        const code = String(randomInt(100000, 1000000));
        codes.clear(); // only the newest code is valid
        codes.set(code, Date.now() + 5 * 60 * 1000);
        return send(res, 200, { code, expires_in: 300 });
      }
      if (path === "/api/folder" && req.method === "POST") {
        // A sample is opened by its id only; its path is never taken from the page.
        const { demo, sample: sampleId } = await body(req);
        const sample = samples.find(s => (demo ? s.offline : s.id === sampleId));
        if (!sample) throw new CourtosError("demo_not_available");
        await openCase({ id: `sample:${sample.id}`, source: sample.path, work: sample.path, sample: true });
        return send(res, 200, { ok: true });
      }
      // Adding a case: the originals' folder and the work folder come from the
      // system's folder dialog, never from the page.
      if (path === "/api/cases/source" && req.method === "POST") {
        const chosen = await choose("Ordner mit den Akten des Falls wählen");
        if (!chosen) return send(res, 200, { cancelled: true });
        const realSource = await realpath(chosen);
        const known = (await loadCases()).find(c => c.source === realSource);
        if (known) { pending = null; await openCase(known); return send(res, 200, { opened: known.id }); }
        const continuing = Boolean(await stat(join(realSource, WORKSPACE_DIR)).catch(() => null));
        pending = { source: realSource, work: continuing ? realSource : await defaultWorkFolder(realSource) };
        return send(res, 200, { pending: pendingView() });
      }
      if (path === "/api/cases/pending/work" && req.method === "POST") {
        if (!pending) throw new CourtosError("case_unknown", undefined, 404);
        const { same } = await body(req);
        if (same) pending.work = pending.source;
        else {
          const chosen = await choose("Arbeitsordner für CourtOS wählen");
          if (!chosen) return send(res, 200, { cancelled: true, pending: pendingView() });
          pending.work = await workFolderFor(chosen, pending.source);
        }
        return send(res, 200, { pending: pendingView() });
      }
      if (path === "/api/cases/pending/cancel" && req.method === "POST") { pending = null; return send(res, 200, { ok: true }); }
      if (path === "/api/cases/create" && req.method === "POST") {
        if (!pending) throw new CourtosError("case_unknown", undefined, 404);
        const entry = await addCase(pending);
        pending = null;
        casesChanged();
        await openCase(entry);
        return send(res, 200, { opened: entry.id });
      }
      if (path === "/api/cases/open" && req.method === "POST") {
        await openCase(await listed((await body(req)).id));
        return send(res, 200, { ok: true });
      }
      if (path === "/api/cases/close" && req.method === "POST") { closeCase(); return send(res, 200, { ok: true }); }
      if (path === "/api/cases/remove" && req.method === "POST") {
        const entry = await listed((await body(req)).id);
        if (current?.id === entry.id) closeCase();
        await removeCase(entry.id);
        casesChanged();
        return send(res, 200, { ok: true });
      }
      if (path === "/api/cases/move" && req.method === "POST") {
        const entry = await listed((await body(req)).id);
        const chosen = await choose("Neuen Arbeitsordner für CourtOS wählen");
        if (!chosen) return send(res, 200, { cancelled: true });
        const open = current?.id === entry.id;
        if (open) closeCase();
        let moved = entry;
        try { moved = await moveWork(entry, await workFolderFor(chosen, entry.source)); }
        finally { casesChanged(); if (open) await openCase(moved); }
        return send(res, 200, { work: moved.work });
      }
      if (path === "/api/cases/reveal" && req.method === "POST") {
        const { id, place } = await body(req);
        const entry = current?.id === id ? current : await listed(id);
        if (!["source", "work", "products"].includes(place)) throw new CourtosError("invalid_request");
        if (place === "products") {
          if (current?.id !== id || !store) throw new CourtosError("case_unknown", undefined, 404);
          const folder = await productsFolder(store);
          await mkdir(folder, { recursive: true });
          show(folder);
        } else show(entry[place]);
        return send(res, 200, { ok: true });
      }
      // The Word pane asks which case the document it runs in belongs to. The answer is an id; the path stays here.
      if (path === "/api/cases/for-document" && req.method === "POST") {
        const entry = await caseForDocument(await loadCases(), (await body(req)).url);
        return send(res, 200, { id: entry?.id ?? null });
      }
      if (path === "/api/products" && req.method === "GET") {
        if (!store) throw new CourtosError("case_unknown", undefined, 404);
        return send(res, 200, await listProducts(store));
      }
      if (path === "/api/products/retry" && req.method === "POST") {
        if (!store) throw new CourtosError("case_unknown", undefined, 404);
        await saveProducts([...runs.values()]);
        return send(res, 200, { ok: !productsFailed });
      }
      if (path === "/api/products/open" && req.method === "POST") {
        if (!store) throw new CourtosError("case_unknown", undefined, 404);
        show(await productPath(store, (await body(req)).name));
        return send(res, 200, { ok: true });
      }
      if (path === "/api/settings/key" && req.method === "POST") {
        const { key, endpoint } = await body(req);
        await mkdir(CONFIG(), { recursive: true, mode: 0o700 });
        // A key for an OpenAI-compatible endpoint is saved for exactly that endpoint.
        if (endpoint !== undefined) {
          const target = normaliseEndpoint(endpoint);
          if (typeof key !== "string" || !/^[\x21-\x7e]{8,512}$/.test(key.trim())) throw new CourtosError("invalid_endpoint_key");
          const keys = await readJson(ENDPOINT_KEYS(), {}).catch(() => ({}));
          await writeFile(ENDPOINT_KEYS(), JSON.stringify({ ...keys, [target]: key.trim() }), { mode: 0o600 });
          await chmod(ENDPOINT_KEYS(), 0o600);
          return send(res, 200, { ok: true });
        }
        if (typeof key !== "string" || !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) throw new CourtosError("invalid_key");
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
      if ((match = /^\/api\/highlight\/(D\d{1,4})\/(\d{1,4})$/.exec(path)) && req.method === "GET") {
        const q = url.searchParams;
        return send(res, 200, await citationRects(store, layout, { document: match[1], page: Number(match[2]), start: Number(q.get("start")), end: Number(q.get("end")), sha256: q.get("sha") }));
      }
      if (path === "/api/open-original" && req.method === "POST") {
        const { id } = await body(req);
        const { source } = await store.originalFile(id);
        openPath(join(store.root, ...source.rel_path.split("/")));
        return send(res, 200, { ok: true });
      }
      if (path === "/api/release" && req.method === "POST") {
        const { model, token_limit, provider, endpoint, memory } = await body(req);
        // Anthropic, or any model behind an OpenAI-compatible endpoint (a cloud
        // service or a model on this computer). The release names both.
        const release = provider === "openai"
          ? { provider: "openai", endpoint: normaliseEndpoint(endpoint), model: typeof model === "string" && /^[A-Za-z0-9._:\/@-]{1,120}$/.test(model) ? model : (() => { throw new CourtosError("invalid_model"); })() }
          : { provider: "anthropic", endpoint: null, model: typeof model === "string" && /^[a-z0-9.-]{3,60}$/.test(model) ? model : DEFAULT_MODEL };
        // The case memory goes with the release unless the user leaves it out.
        const snapshot = memory === false ? null : memorySnapshot(store, liveMemory());
        const consent = await store.release({ ...release, budgetChf: null, memory: snapshot });
        if (memory === false) consent.memory_off = true;
        consent.token_limit = Math.min(Math.max(Number(token_limit) || 1_500_000, 100_000), 10_000_000);
        await store.save();
        return send(res, 200, { ok: true, consent });
      }
      if (path === "/api/revoke" && req.method === "POST") { await store.revoke(); return send(res, 200, { ok: true }); }
      if (path === "/api/runs" && req.method === "POST") return send(res, 200, await startRuns(await body(req)));
      // The browser and Word follow each other: one interface language, and a passage or claim handed across.
      if (path === "/api/language" && req.method === "POST") {
        const { language } = await body(req, 1024);
        if (!UI_LANGUAGES.includes(language)) throw new CourtosError("invalid_language");
        await mkdir(CONFIG(), { recursive: true, mode: 0o700 });
        await writeFile(PREFS(), JSON.stringify({ ...(await readJson(PREFS(), {}).catch(() => ({}))), language }));
        broadcast("language", { language });
        return send(res, 200, { ok: true });
      }
      if (path === "/api/show" && req.method === "POST") {
        const { run, claim, citation } = await body(req, 1024);
        const found = storedCitation(run, claim, citation);
        if (!found?.citation) return send(res, 404, { error: "not_found" });
        return send(res, 200, { delivered: broadcast("show", { run, claim, citation: found.citation }, "web") });
      }
      if (path === "/api/word/insert" && req.method === "POST") {
        const { run, claim } = await body(req, 1024);
        if (!storedCitation(run, claim, -1)) return send(res, 404, { error: "not_found" });
        return send(res, 200, { delivered: broadcast("insert", { run, claim }, "word") });
      }
      if (path === "/api/queue/cancel" && req.method === "POST") { queue.length = 0; currentRun?.cancel(); return send(res, 200, { ok: true }); }
      if ((match = /^\/api\/register\/(E[0-9a-f]{12})\/occurrences$/.exec(path)) && req.method === "GET") return send(res, 200, { occurrences: store.occurrences(match[1]) });
      if (path === "/api/register/occurrence" && req.method === "POST") { await store.setOccurrence(await body(req)); return send(res, 200, { ok: true }); }
      if (path === "/api/case/language" && req.method === "POST") {
        const { language } = await body(req);
        if (busy() || queue.length) throw new CourtosError("run_in_progress", undefined, 409);
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
        const run = currentRun?.id === match[1] && busy() ? { ...currentRun.summary(), status: "running" } : runs.get(match[1]);
        if (!run) throw new CourtosError("run_unknown", undefined, 404);
        return send(res, 200, { ...run, freshness: staleness(store, run.result) });
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
      if (path === "/api/memory" && req.method === "GET") {
        // What a model reads: the released snapshot, and what a new release would carry.
        const live = liveMemory();
        let released = null;
        try { released = await store.releasedMemory(); } catch { /* void release: shown as none */ }
        let preview = null;
        try { preview = memorySnapshot(store, live); } catch { /* nothing to carry */ }
        return send(res, 200, { markdown: memoryMarkdown(live, store, store.case.consent?.memory ?? null), released, preview });
      }
      if ((match = /^\/api\/runs\/([\w-]{8,80})\/markdown$/.exec(path)) && req.method === "GET") {
        const run = runs.get(match[1]);
        if (!run?.result) throw new CourtosError("run_unknown", undefined, 404);
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(resultMarkdown(run, { case: { parties: store.partiesView() } }, runLanguage(run, store.lang)));
      }
      return send(res, 404, { error: "not_found" });
    } catch (error) {
      const status = error.status ?? 500;
      return send(res, status, { error: error.code ?? "internal_error", detail: error.code ? error.detail ?? null : null });
    }
  }

  const server = tls ? createHttpsServer(tls, handle) : createHttpServer(handle);
  server.on("clientError", (_error, socket) => { try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch { /* closed */ } });
  await new Promise((resolve, reject) => {
    server.once("error", (error) => reject(error.code === "EADDRINUSE" ? new CourtosError("port_in_use", { port }) : error));
    server.listen(port, "127.0.0.1", resolve);
  });
  if (folder) await openCase(await addCase({ source: folder }));
  const pairUrl = `${origin}/#pair=${pairToken}`;
  log(`CourtOS läuft auf ${origin}`);
  log(`Im Browser öffnen (gilt einmal): ${pairUrl}`);
  if (!tls) {
    // Word loads add-ins over https only; the browser works either way.
    log("Hinweis: Kein Entwicklerzertifikat für localhost gefunden. Der Browser funktioniert, Word nicht.");
    log(process.env.COURTOS_APP
      ? "Für Word im CourtOS-Menü „Zertifikat für Word einrichten …“ wählen."
      : "Für Word einmal ausführen: npx office-addin-dev-certs install, dann CourtOS neu starten.");
  }
  if (openBrowser) openPath(pairUrl);
  /** A new one-time link for the menu-bar app; an unused earlier link stops working. */
  const newPairUrl = () => { pairToken = randomId(24); failedPairs = 0; return `${origin}/#pair=${pairToken}`; };
  const status = () => ({ origin, busy: busy(), case: current ? basename(current.source) : null, clients: connected() });
  return { server, origin, pairUrl, newPairUrl, status, close: () => { store?.close(); for (const c of clients) c.res.end(); server.close(); } };
}

async function listRuns(store) {
  const { readdir } = await import("node:fs/promises");
  const out = [];
  try {
    for (const entry of await readdir(join(store.dir, "runs"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const run = await readJson(join(store.dir, "runs", entry.name, "run.json"), null).catch(() => null);
      // A run still marked as running was cut off when CourtOS stopped; none runs while a case is being opened.
      if (run) out.push(["queued", "running"].includes(run.status) ? { ...run, status: "failed", error: { code: "interrupted", detail: null } } : run);
    }
  } catch { /* none yet */ }
  return out;
}

export { stat };
