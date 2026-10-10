import { courtosKnowledgeEnabled } from "../../lib/courtosKnowledge";
import { failure, ok, type ServiceResult } from "../../lib/serviceResult";

const MAX_PUBLIC_RESPONSE_BYTES = 150_000;
const PUBLIC_SEARCH_TIMEOUT_MS = 47_000; //45s sidecar budget plus loopback/response margin.
const PUBLIC_DETAIL_TIMEOUT_MS = 26_000;
const publicTimeout = () => failure("unavailable", "Die Suche hat zu lange gedauert. Bitte präzisere Begriffe verwenden oder die Sprache eingrenzen.", "public_research_timeout");
async function readBoundedResponse(response: Response): Promise<string> {
  const announced = Number(response.headers.get("content-length"));
  if (announced > MAX_PUBLIC_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Public response exceeds byte limit");
  }
  if (!response.body) throw new Error("Missing public response body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PUBLIC_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Public response exceeds byte limit");
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } finally { reader.releaseLock(); }
}

/** Fixed loopback public-source adapter. No cookie, document, history or URL forwarding. */
export async function publicKnowledgeRequest(kind: "search" | "decision", input: Record<string, unknown>): Promise<ServiceResult<unknown>> {
  if (!courtosKnowledgeEnabled()) return failure("not_found", "Wissensbasis nicht aktiviert.");
  let path: string;
  let body: string | undefined;
  if (kind === "search") {
    if (Object.keys(input).some(k => !["query","limit","language","court","canton"].includes(k)) || typeof input.query !== "string" || !input.query.trim() || input.query.length > 180) return failure("validation", "Bitte eine öffentliche Suchfrage bis 180 Zeichen eingeben.");
    const limit = input.limit ?? 5;
    if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 8 || (input.language !== undefined && !["de","fr","it"].includes(String(input.language))) || (input.court !== undefined && (typeof input.court !== "string" || !/^[a-z0-9_-]{1,60}$/i.test(input.court))) || (input.canton !== undefined && (typeof input.canton !== "string" || !/^[A-Z]{2}$/.test(input.canton)))) return failure("validation", "Ungültiger öffentlicher Suchfilter.");
    path = "/search"; body = JSON.stringify({ ...input, query: input.query.trim(), limit });
  } else {
    if (typeof input.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:# -]{0,239}$/.test(input.id)) return failure("validation", "Ungültige öffentliche Entscheid-ID.");
    const start = Number(input.start ?? 0), length = Number(input.length ?? 4000);
    if (!Number.isInteger(start) || start < 0 || start > 10_000_000 || !Number.isInteger(length) || length < 1 || length > 6000) return failure("validation", "Ungültiger Textabschnitt.");
    path = `/decisions/${encodeURIComponent(input.id)}?start=${start}&length=${length}`;
  }
  const deadline = AbortSignal.timeout(kind === "search" ? PUBLIC_SEARCH_TIMEOUT_MS : PUBLIC_DETAIL_TIMEOUT_MS);
  try {
    const response = await fetch("http://127.0.0.1:18184" + path, { method: body ? "POST" : "GET", body, headers: body ? { "Content-Type": "application/json" } : {}, redirect: "error", signal: deadline });
    if (response.status === 404) return failure("not_found", "Entscheid im öffentlichen Quellenbestand nicht gefunden.");
    const text = await readBoundedResponse(response);
    if (!response.ok) {
      // Only recognise fixed service codes. Never forward upstream detail text.
      let code: unknown;
      try { code = (JSON.parse(text) as { code?: unknown })?.code; } catch { /* generic failure below */ }
      if (response.status === 422) return failure("validation", "Bitte ein bis acht kurze Suchbegriffe verwenden.", "public_research_invalid_query");
      if (response.status === 429 && code === "public_research_busy") return failure("unavailable", "Die öffentliche Suche ist ausgelastet. Bitte kurz warten.", "public_research_busy");
      if (response.status === 503 && code === "public_research_timeout") return publicTimeout();
      return failure("unavailable", "Die öffentliche Recherche ist gerade nicht verfügbar.", "public_research_unavailable");
    }
    return ok(JSON.parse(text));
  } catch { return deadline.aborted ? publicTimeout() : failure("unavailable", "Die öffentliche Recherche ist gerade nicht verfügbar.", "public_research_unavailable"); }
}
