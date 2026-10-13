// OpenCaseLaw client. Public court decisions only. Queries come from the
// agent or the user and pass the outbound guard first (the caller's job);
// nothing from the case folder is attached. Responses are public data and are
// cached in .courtos/public/.
import { join } from "node:path";
import { CourtosError, readJson, writeJson } from "./util.mjs";

const MCP = "https://mcp.opencaselaw.ch/";
const API = "https://mcp.opencaselaw.ch/api";
const SEARCH_TIMEOUT = 50_000;
const DETAIL_TIMEOUT = 30_000;
const MAX_SEARCH_BYTES = 600_000;
const MAX_DECISION_BYTES = 4 * 1024 * 1024;
const ID = /^[A-Za-z0-9_.\-]{3,120}$/;

async function boundedText(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { reader.cancel().catch(() => {}); throw new CourtosError("caselaw_response_too_large", undefined, 502); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf8");
}

function payloadFrom(text, rpcId) {
  // The MCP endpoint answers with JSON or with server-sent events.
  const candidates = text.trim().startsWith("{") ? [text] : text.split(/\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim());
  for (const candidate of candidates) {
    let envelope;
    try { envelope = JSON.parse(candidate); } catch { continue; }
    if (envelope?.id !== rpcId) continue;
    if (envelope.error || envelope.result?.isError) throw new CourtosError("caselaw_unavailable", undefined, 502);
    if (envelope.result?.structuredContent) return envelope.result.structuredContent;
  }
  throw new CourtosError("caselaw_unavailable", undefined, 502);
}

const clean = (value, max = 400) => typeof value === "string" ? value.replace(/<\/?mark>/g, "").slice(0, max) : null;

export class OpenCaseLaw {
  constructor({ cacheDir = null, fetchImpl = globalThis.fetch } = {}) {
    this.cacheDir = cacheDir;
    this.fetch = fetchImpl;
  }

  async search(query, { limit = 8, language = null, court = null } = {}) {
    const q = String(query ?? "").replace(/\s+/g, " ").trim();
    if (q.length < 2 || q.length > 300) throw new CourtosError("caselaw_query_invalid");
    const rpcId = `courtos-${Date.now().toString(36)}`;
    const args = { query: q, limit: Math.min(Math.max(Number(limit) || 8, 1), 10), fields: "full", include_pinpoint: false };
    if (language && /^(de|fr|it)$/.test(language)) args.language = language;
    if (court && /^[A-Za-z0-9_-]{1,40}$/.test(court)) args.court = court;
    const response = await this.fetch(MCP, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method: "tools/call", params: { name: "search_decisions", arguments: args } }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT), redirect: "error",
    }).catch(() => { throw new CourtosError("caselaw_unreachable", undefined, 502); });
    if (!response.ok) throw new CourtosError("caselaw_unavailable", undefined, 502);
    const payload = payloadFrom(await boundedText(response, MAX_SEARCH_BYTES), rpcId);
    const rows = Array.isArray(payload.results) ? payload.results : [];
    return {
      total: Number.isFinite(payload.total) ? payload.total : rows.length,
      results: rows.slice(0, args.limit).map(row => ({
        decision_id: clean(row.decision_id, 120), docket: clean(row.docket_number, 80), date: clean(row.decision_date, 20),
        court: clean(row.court_name ?? row.court, 80), language: clean(row.language, 4),
        regeste: clean(row.regeste, 500), snippet: clean(row.snippet, 600),
      })).filter(row => row.decision_id && ID.test(row.decision_id)),
    };
  }

  /** Full decision text. Aliases resolve server-side; the canonical id is returned. */
  async decision(id) {
    if (!ID.test(String(id ?? ""))) throw new CourtosError("caselaw_id_invalid");
    const cachePath = this.cacheDir ? join(this.cacheDir, `${id.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`) : null;
    if (cachePath) {
      const cached = await readJson(cachePath, null).catch(() => null);
      if (cached) return cached;
    }
    const response = await this.fetch(`${API}/decisions/${encodeURIComponent(id)}?full_text=true`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(DETAIL_TIMEOUT), redirect: "error",
    }).catch(() => { throw new CourtosError("caselaw_unreachable", undefined, 502); });
    if (response.status === 404) return null;
    if (!response.ok) throw new CourtosError("caselaw_unavailable", undefined, 502);
    let value;
    try { value = JSON.parse(await boundedText(response, MAX_DECISION_BYTES)); } catch (error) { if (error.code) throw error; throw new CourtosError("caselaw_unavailable", undefined, 502); }
    if (!value || typeof value.decision_id !== "string") return null;
    const text = typeof value.full_text === "string" ? value.full_text.replace(/\r\n?/g, "\n").normalize("NFC") : "";
    const decision = {
      decision_id: value.canonical_decision_id ?? value.decision_id, requested: id,
      docket: value.docket_number ?? null, docket_2: value.docket_number_2 ?? null, date: value.decision_date ?? null,
      date_is_estimated: value.date_is_estimated === true, court: value.court_name ?? value.court ?? null,
      language: value.language ?? null, regeste: typeof value.regeste === "string" ? value.regeste.slice(0, 4000) : null,
      source_url: typeof value.source_url === "string" && /^https:\/\//.test(value.source_url) ? value.source_url : null,
      opencaselaw_url: `https://mcp.opencaselaw.ch/entscheid/${encodeURIComponent(value.decision_id)}`,
      text, text_available: text.length > 0 && value.text_available !== false,
    };
    if (cachePath) await writeJson(cachePath, decision).catch(() => {});
    return decision;
  }
}

/** Split a decision into passages at paragraph boundaries (max ~3500 chars). */
export function decisionPassages(text, size = 3500) {
  const paragraphs = text.split(/\n{2,}|\n(?=\s*(?:\d+(?:\.\d+)*\.?\s|[A-Z]\.\s|E\.\s?\d))/u).map(p => p.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  const passages = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer && buffer.length + paragraph.length + 2 > size) { passages.push(buffer); buffer = ""; }
    if (paragraph.length > size) {
      for (let i = 0; i < paragraph.length; i += size) passages.push(paragraph.slice(i, i + size));
      continue;
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  if (buffer) passages.push(buffer);
  return passages;
}
