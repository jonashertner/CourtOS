import type { CaseReviewRecord, CaseReviewStatus } from "@mike/contracts";
import type { Db } from "../../lib/supabase";
import { failure, ok, type ServiceResult } from "../../lib/serviceResult";
import { courtosKnowledgeEnabled } from "../../lib/courtosKnowledge";
import { courtosPilotModel, COURTOS_PILOT_REQUEST_BYTES } from "../../lib/courtosPilot";
import { reserveCourtosQuota, withCourtosQuota } from "../../lib/courtosQuota";
import { getStreamRun, startStreamRun, type StreamRun } from "../../lib/streamRuns";
import { ReviewContextError } from "../../lib/llm/courtosReviewPreflight";
import { streamWithProvider } from "../../lib/llm/providers";
import { createCaseReviewRecord, readCaseReviewRecord, writeCaseReviewRecord, loadCaseReviewEvidence } from "../chat/chat.service";
import { buildReviewPassages, groundReviewOutput, reviewPrompt, ReviewGroundingError } from "./knowledge.reviewGrounding";
import { parseCaseReviewInput } from "./knowledge.reviewSchema";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const active = new Set<CaseReviewStatus>(["queued", "reading", "analysing", "checking"]);
const key = (userId: string) => `courtos-case-review:${userId}`;
type ReviewRun = StreamRun<{ record: CaseReviewRecord }>;
const errorResult = (code: string, detail: string) => ({ code, detail });
const storageFailure = errorResult("review_storage_unavailable", "Der Prüfbericht konnte nicht sicher gespeichert werden. Es wurde kein Ergebnis freigegeben.");
const genericFailure = errorResult("review_unavailable", "Die Teilanalyse konnte nicht abgeschlossen werden. Es wurde kein ungeprüfter Entwurf freigegeben. Ihre Quellen bleiben unverändert.");
const missing = () => failure("not_found", "Dieser Prüfbericht ist für das angemeldete Konto nicht verfügbar.", "review_not_found");
export type StartCaseReviewResult = ServiceResult<CaseReviewRecord> | { ok: false; kind: "usage_limit"; status: 429 | 503; detail: string; retryAfter: number };

function runFor(id: string, userId: string): ReviewRun | undefined {
  const run = getStreamRun<{record: CaseReviewRecord}>(id);
  return run?.userId === userId && run.key === key(userId) ? run : undefined;
}
function savedRecord(value: Record<string, unknown>, id: string): CaseReviewRecord | null {
  if (value.id !== id || !parseCaseReviewInput(value.input) || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at)) || ![...active,"completed","failed","cancelled","interrupted"].includes(String(value.status))) return null;
  // Only this service can create the typed marker. Input equality and owner gates
  // remain mandatory; generic chat content from requests is never promoted.
  return value as unknown as CaseReviewRecord;
}

async function persist(db: Db, userId: string, run: ReviewRun, record: CaseReviewRecord): Promise<boolean> {
  try {
    const saved = await writeCaseReviewRecord(db,userId,record.id,record as unknown as Record<string, unknown>);
    if (!saved.ok) return false;
    run.meta.record = record;
    run.write(`data: ${JSON.stringify({type:"review_status",id:record.id,status:record.status})}\n\n`);
    return true;
  } catch { return false; } // Never release a draft or leak a storage exception.
}

async function executeReview(db: Db, userId: string, run: ReviewRun, model: string): Promise<void> {
  let record = run.meta.record;
  try {
    record = {...record,status:"reading"}; if (!await persist(db,userId,run,record)) throw new Error("review_storage");
    run.signal.throwIfAborted();
    const sources = await loadCaseReviewEvidence(db,userId,record.input.sources);
    run.signal.throwIfAborted();
    const passages = buildReviewPassages(record.input,sources);
    const prompt = reviewPrompt(record.input,passages);
    // Conservative request budget, not a tokenizer claim. Provider context
    // refusal is a failed admission; pages are never silently removed to fit.
    if (Buffer.byteLength(JSON.stringify({messages:[{role:"system",content:prompt.system},{role:"user",content:prompt.user}]}),"utf8") > COURTOS_PILOT_REQUEST_BYTES - 1024) throw new ReviewGroundingError();
    record = {...record,status:"analysing"}; if (!await persist(db,userId,run,record)) throw new Error("review_storage");
    const result = await streamWithProvider({
      model, courtosTask:"case-review", systemPrompt:prompt.system,
      messages:[{role:"user",content:prompt.user}], maxIterations:1,
      reasoning:"none", abortSignal:run.signal, callbacks:{onActivity:()=>run.touch()},
    });
    run.signal.throwIfAborted();
    record = {...record,status:"checking"}; if (!await persist(db,userId,run,record)) throw new Error("review_storage");
    const report = groundReviewOutput(result.fullText,result.finishReason,record.input,sources,model);
    // Revalidate actual immutable bytes and ownership before result release.
    // No model call or source retrieval is delegated to an external service.
    const currentSources = await loadCaseReviewEvidence(db,userId,record.input.sources);
    if (currentSources.length !== sources.length || sources.some(source => !currentSources.some(current =>
      current.document_id === source.document_id && current.version_id === source.version_id &&
      current.pdf_sha256 === source.pdf_sha256 && current.filename === source.filename &&
      current.version_number === source.version_number && JSON.stringify(current.pages) === JSON.stringify(source.pages)))) throw new ReviewGroundingError();
    run.signal.throwIfAborted();
    record = {...record,status:"completed",report,error:null};
    if (!await persist(db,userId,run,record)) throw new Error("review_storage");
    // Result is only published after the durable write succeeds.
    run.write(`data: ${JSON.stringify({type:"review_result",record})}\n\n`);
  } catch (error) {
    const cancelled = run.stopped && run.stopReason === "user";
    const known = error instanceof ReviewGroundingError || (error instanceof Error && "code" in error && error.code === "source_grounding_failed");
    record = {...record,report:null,status:cancelled?"cancelled":"failed",error:cancelled?null:error instanceof ReviewContextError?errorResult(error.code,error.message):known?errorResult("review_grounding_failed", "Die Teilanalyse wurde zurückgehalten: Quellenumfang oder Fundstellen konnten nicht vollständig bestätigt werden. Bitte die ausgewählten Originalfassungen prüfen und den Auftrag enger eingrenzen."):genericFailure};
    if (!await persist(db,userId,run,record)) run.meta.record = {...record,error:storageFailure};
    run.write(`data: ${JSON.stringify({type:"review_error",id:record.id,status:record.status,error:run.meta.record.error})}\n\n`);
  } finally { run.write("data: [DONE]\n\n"); run.finish(); }
}

/** Idempotency is an account-owned report identity, never an access grant. */
export async function startCaseReview(db: Db, userId: string, raw: unknown): Promise<StartCaseReviewResult> {
  if (!courtosKnowledgeEnabled()) return missing();
  const input = parseCaseReviewInput(raw);
  if (!input) return failure("validation", "Bitte einen Auftrag und höchstens fünf eigene PDF-Fassungen mit Dokumentrolle auswählen.", "review_invalid");
  const model = courtosPilotModel(); if (!model) return missing();
  const existing = await readCaseReviewRecord(db,userId,input.request_id);
  if (existing.ok) {
    const record = savedRecord(existing.data.record,input.request_id);
    if (!record) return failure("unavailable",storageFailure.detail,storageFailure.code);
    if (JSON.stringify(record.input) !== JSON.stringify(input)) return failure("conflict", "Diese Auftragskennung gehört zu einer anderen Auswahl. Bitte einen neuen Auftrag beginnen.", "review_request_conflict");
    return getCaseReview(db,userId,input.request_id);
  }
  if (existing.kind !== "not_found") return existing;
  const quota = await reserveCourtosQuota(db,userId);
  if (!quota.ok) return {ok:false,kind:"usage_limit",status:quota.status,detail:quota.detail,retryAfter:quota.retryAfter};
  const record: CaseReviewRecord = {id:input.request_id,status:"queued",created_at:new Date().toISOString(),input,report:null,error:null};
  let created: Awaited<ReturnType<typeof createCaseReviewRecord>>;
  try { created = await createCaseReviewRecord(db,userId,record.id,model.id,record as unknown as Record<string, unknown>); }
  catch { await quota.reservation.release(); return failure("unavailable",storageFailure.detail,storageFailure.code); }
  if (!created.ok) { await quota.reservation.release(); return created; }
  return withCourtosQuota(quota.reservation,() => {
    const run = startStreamRun({id:record.id,key:key(userId),userId,meta:{record},forcedStopFrames:[`data: ${JSON.stringify({type:"review_error",id:record.id,status:"interrupted",error:errorResult("review_interrupted","Der Auftrag wurde unterbrochen. Er wird nicht automatisch wiederholt.")})}\n\n`,"data: [DONE]\n\n"]});
    if (!run) { void quota.reservation.release(); return failure("conflict", "Für Ihr Konto läuft bereits eine Teilanalyse.", "review_in_progress"); }
    // Execution belongs to the server run, not the initiating HTTP connection.
    void executeReview(db,userId,run,model.id);
    return ok(record);
  });
}

export async function getCaseReview(db: Db, userId: string, id: string): Promise<ServiceResult<CaseReviewRecord>> {
  if (!courtosKnowledgeEnabled() || !UUID.test(id)) return missing();
  const saved = await readCaseReviewRecord(db,userId,id); if (!saved.ok) return saved;
  const record = savedRecord(saved.data.record,id); if (!record) return failure("unavailable",storageFailure.detail,storageFailure.code);
  const running = runFor(id,userId);
  if (running) return ok(running.meta.record);
  // A short creation window avoids a GET racing between the durable insert and
  // run registration. A lost process is never restarted or charged again.
  if (active.has(record.status) && Date.parse(record.created_at) < Date.now()-30_000) {
    const interrupted: CaseReviewRecord = {...record,status:"interrupted",report:null,error:errorResult("review_interrupted","Der Auftrag wurde durch einen Neustart oder Verbindungsfehler unterbrochen. Er wird nicht automatisch wiederholt.")};
    const written = await writeCaseReviewRecord(db,userId,id,interrupted as unknown as Record<string,unknown>);
    if (!written.ok) return written;
    return ok(interrupted);
  }
  return ok(record);
}

export async function stopCaseReview(db: Db, userId: string, id: string): Promise<ServiceResult<CaseReviewRecord>> {
  const record = await getCaseReview(db,userId,id); if (!record.ok) return record;
  const run = runFor(id,userId); if (run && !run.finished) run.stop();
  return ok(record.data);
}

/** The route can attach SSE only after the durable owner check above. */
export function caseReviewRun(id: string, userId: string): ReviewRun | undefined { return runFor(id,userId); }
