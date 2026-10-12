// The agent loop. The model reaches the case only through tools that read the
// released mirror, plus (for legal tasks) OpenCaseLaw search and decision
// reading. There is no file path, shell, URL or general network tool. Every
// request body is checked by the outbound guard and stored verbatim in
// .courtos/runs/<id>/ before it is sent; every OpenCaseLaw query is checked
// the same way.
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { buildIndex, search } from "../search.mjs";
import { bindResult, rehydrator } from "../verify.mjs";
import { decisionPassages } from "../opencaselaw.mjs";
import { lookupId } from "../citecheck.mjs";
import { noteLabel } from "../language.mjs";
import { parseReference } from "../vendor/citecheck/parser.mjs";
import { CourtosError, now, randomId, sha256, writeAtomic, writeJson } from "../util.mjs";
import { systemPrompt, TASKS, tools, validateWorkflowResult } from "./tasks.mjs";

const MAX_READ_CHARS = 60_000;
const MAX_DECISION_CHARS = 24_000;
const ROLE_NAMES = { claim: "Klage/claim", response: "Antwort/response", submission: "Eingabe/submission", exhibit: "Beilage/exhibit", literature: "Literatur/literature", authority: "Entscheid/authority", internal_note: "internal note of the court (context only: cite in context_references, never as evidence)", other: "Sonstiges/other" };
const ID = /^[A-Za-z0-9_.\-]{3,120}$/;
// Reasoning depth per task. Reading and sorting what the parties say (the first
// three tasks, questions to the sources) is extraction and runs at the model's
// default "medium"; weighing law, finding the questions that decide the case and
// drafting a decision run at "high". Effort is fixed per task, never changed
// within a run (a change would invalidate the prompt cache).
export const EFFORT = {
  chronology: "medium", facts_evidence: "medium", party_comparison: "medium", source_chat: "medium",
  legal_claims: "high", fundamental_questions: "high", decision_draft: "high", hypothetical_impact: "high",
};

export class AgentRun extends EventEmitter {
  constructor({ store, provider, task, question = "", language = "de", model, notes = [], caselaw = null, limits = {} }) {
    super();
    if (!TASKS[task]) throw new CourtosError("unknown_task");
    if (task === "source_chat" && !question.trim()) throw new CourtosError("question_required");
    if (task === "hypothetical_impact" && !notes.length) throw new CourtosError("assumption_required");
    this.id = `${new Date().toISOString().slice(0, 10)}-${task}-${randomId(4)}`;
    this.store = store;
    this.provider = provider;
    this.task = task;
    this.question = question.trim().slice(0, 4000);
    this.language = language;
    this.model = model;
    this.noteIds = notes;
    this.caselaw = caselaw;
    this.limits = { maxTurns: 60, maxOutputTokens: 64000, maxTotalTokens: 3_000_000, maxSubmits: 4, maxCaseLawCalls: 24, ...limits };
    this.status = "queued";
    this.events = [];
    this.usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    this.read = new Set();
    this.requests = [];
    this.extra = [];            // working notes and public decision passages, as sections
    this.decisions = new Map(); // canonical id → { meta, sections: [ids] }
    this.caseLawCalls = 0;
    this.controller = new AbortController();
    this.dir = join(store.dir, "runs", this.id);
  }

  summary() {
    return {
      id: this.id, task: this.task, question: this.question, question_sent: this.questionSent ?? null, notes: this.noteIds, language: this.language, model: this.model,
      status: this.status, error: this.error ?? null, started: this.started ?? null, finished: this.finished ?? null,
      usage: this.usage, events: this.events, requests: this.requests.map(({ n, sha256, bytes }) => ({ n, sha256, bytes })),
      read_sections: [...this.read], result: this.bound ?? null,
    };
  }

  trace(type, data = {}) {
    const event = { t: now(), type, ...data };
    this.events.push(event);
    this.emit("event", event);
  }

  cancel() {
    this.controller.abort();
    if (["queued", "running"].includes(this.status)) this.finish("cancelled");
  }

  async finish(status, error = null) {
    if (this.finished) return;
    this.status = status;
    this.error = error;
    this.finished = now();
    this.trace("status", { status, error });
    await writeJson(join(this.dir, "run.json"), this.summary()).catch(() => {});
    this.emit("done", this.summary());
  }

  nextSection() {
    const used = this.mirror.sections.length + this.extra.length;
    if (used >= 9999) throw new CourtosError("too_many_sections");
    return `S${used + 1}`;
  }

  /** Sections in validator shape. */
  sections() {
    const versions = new Map(this.store.sources.map(s => [s.id, s.version]));
    // A document the user marked as the court's internal note is context, like a
    // working note: it may be referenced, never cited as evidence.
    const pages = this.mirror.documents.flatMap(document => document.pages.filter(p => p.section).map(page => document.role === "internal_note" ? {
      id: page.section, kind: "working_note", text: page.text, attribution: { author: "court", status: "internal" },
    } : {
      id: page.section, kind: "source", text: page.text,
      source: { role: document.role, party: document.party, document: document.id, version: `V${versions.get(document.id) ?? 1}` },
    }));
    return [...pages, ...this.extra.map(({ meta, ...section }) => section)];
  }

  // --- tools -------------------------------------------------------------
  toolListDocuments() {
    // The procedural role in the language of the proceedings ("Klägerin", "Gesuchsgegnerin")
    // and the party's name as it appears in the pseudonymised text.
    const known = new Map((this.mirror.parties ?? []).map(p => [p.id, p]));
    const parties = [...new Set([...known.keys(), ...this.mirror.documents.map(d => d.party).filter(Boolean)])].sort();
    return JSON.stringify({
      parties: Object.fromEntries(parties.map(p => [p, {
        role: known.has(p) ? `${known.get(p).term} (${known.get(p).role})` : "unspecified",
        ...(known.get(p)?.name_in_text ? { name_in_text: known.get(p).name_in_text } : {}),
        pleadings: this.mirror.documents.filter(d => d.party === p && ["claim", "response", "submission"].includes(d.role)).map(d => d.label),
      }])),
      documents: this.mirror.documents.map(document => ({
        document: document.id, label: document.label, role: ROLE_NAMES[document.role] ?? document.role, party: document.party,
        pages: document.pages.filter(p => p.section).map(p => ({ page: p.label, section: p.section, ...(p.ocr ? { text_from: "OCR (recognised from a scan; may contain recognition errors)" } : {}) })),
        unreadable_pages: document.pages.filter(p => !p.section).map(p => p.label),
      })),
      working_notes: [
        ...this.mirror.documents.filter(d => d.role === "internal_note").flatMap(d => d.pages.filter(p => p.section).map(p => ({ section: p.section, status: "internal note of the court", document: d.label }))),
        ...this.extra.filter(s => s.kind === "working_note").map(s => ({ section: s.id, status: s.attribution.status })),
      ],
    });
  }

  toolRead(input) {
    let pages = [];
    if (Array.isArray(input.sections) && input.sections.length) {
      const wanted = new Set(input.sections);
      for (const document of this.mirror.documents) for (const page of document.pages) if (page.section && wanted.has(page.section)) pages.push({ document, page });
      for (const section of this.extra) if (wanted.has(section.id)) pages.push({ extra: section });
    } else if (input.document) {
      const document = this.mirror.documents.find(d => d.id === input.document);
      if (!document) return { error: "unknown document" };
      const from = input.from_page ?? 1, to = input.to_page ?? from + 29;
      pages = document.pages.filter(p => p.n >= from && p.n <= to).map(page => ({ document, page }));
    } else return { error: "give sections or a document" };
    let out = "", count = 0;
    const labels = [];
    for (const item of pages.slice(0, 30)) {
      let block, id, label;
      if (item.extra) {
        id = item.extra.id;
        label = item.extra.meta.label;
        block = `\n[${id} · ${label}]\n${item.extra.text}\n`;
      } else {
        const { document, page } = item;
        if (!page.section) { out += `\n[${document.label} · ${page.label}: page not readable, no text]\n`; continue; }
        id = page.section;
        label = `${document.label} ${page.label}`;
        block = `\n[${page.section} · ${document.id} ${document.label} · ${page.label}${page.ocr ? " · OCR" : ""}${document.role === "internal_note" ? " · internal note, context only" : ""}]\n${page.text}\n`;
      }
      if (out.length + block.length > MAX_READ_CHARS) { out += `\n[limit reached; read the remaining pages in another call]\n`; break; }
      out += block;
      this.read.add(id);
      labels.push(label);
      count++;
    }
    return { text: out.trim() || "[no pages in that range]", count, labels };
  }

  toolSearch(input) {
    return { hits: search(this.index, input.query, { documents: input.documents ?? null, limit: 10 }) };
  }

  async toolSearchCaseLaw(input) {
    if (!this.caselaw) return { error: "case law search is not available" };
    if (++this.caseLawCalls > this.limits.maxCaseLawCalls) return { error: "case law budget for this run is used up; work with what you have read" };
    const query = String(input.query ?? "");
    this.guard.check(query);
    const result = await this.caselaw.search(query, { limit: 8, language: input.language ?? null, court: input.court ?? null });
    return { results: result.results.map(({ decision_id, docket, date, court, language, regeste, snippet }) => ({ decision_id, docket, date, court, language, regeste, snippet })), note: "Snippets are not quotable. Open a decision with read_decision." };
  }

  async toolReadDecision(input) {
    if (!this.caselaw) return { error: "case law is not available" };
    let reference = String(input.reference ?? "").trim();
    let id = ID.test(reference) && /_/.test(reference) ? reference : lookupId(parseReference(reference));
    if (!id) return { error: "not a recognised decision reference; use search_case_law" };
    this.guard.check(id);
    let entry = [...this.decisions.values()].find(d => d.meta.decision_id === id || d.meta.requested === id);
    if (!entry) {
      if (++this.caseLawCalls > this.limits.maxCaseLawCalls) return { error: "case law budget for this run is used up" };
      const decision = await this.caselaw.decision(id);
      if (!decision) return { error: `decision ${id} not found on OpenCaseLaw` };
      if (!decision.text_available) return { error: "the full text of this decision is not available; use the regeste only as a pointer, never as a quotation" };
      const meta = { decision_id: decision.decision_id, requested: id, docket: decision.docket, date: decision.date, court: decision.court, url: decision.opencaselaw_url, source_url: decision.source_url, language: decision.language };
      const sections = decisionPassages(decision.text).slice(0, 400).map((text, i) => {
        const section = {
          id: this.nextSection(), kind: "source", text,
          source: { role: "authority", party: null, document: `OCL:${decision.decision_id}`, version: "V1" },
          meta: { public: true, decision: meta, passage: i + 1, label: `${decision.docket ?? decision.decision_id}, passage ${i + 1}` },
        };
        this.extra.push(section);
        this.guard.allow(text);
        return section.id;
      });
      entry = { meta: { ...meta, passages: sections.length }, sections };
      this.decisions.set(decision.decision_id, entry);
    }
    const all = entry.sections.map(id => this.extra.find(s => s.id === id));
    let chosen;
    if (Array.isArray(input.passages) && input.passages.length) chosen = input.passages.map(n => all[n - 1]).filter(Boolean);
    else if (input.focus) {
      const terms = String(input.focus).toLocaleLowerCase("de").split(/\s+/).filter(t => t.length > 2);
      chosen = all.map(s => ({ s, score: terms.reduce((n, t) => n + (s.text.toLocaleLowerCase("de").split(t).length - 1), 0) }))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.s);
      if (!chosen.length) chosen = all.slice(0, 2);
    } else chosen = all.slice(0, 3);
    let out = `${entry.meta.court ?? ""} ${entry.meta.docket ?? entry.meta.decision_id} of ${entry.meta.date ?? "unknown date"} (OpenCaseLaw id ${entry.meta.decision_id}). ${all.length} passages; passage numbers 1–${all.length}.\n`;
    const shown = [];
    for (const section of chosen) {
      const block = `\n[${section.id} · passage ${section.meta.passage}]\n${section.text}\n`;
      if (out.length + block.length > MAX_DECISION_CHARS) { out += "\n[more passages available; request them by number]\n"; break; }
      out += block;
      this.read.add(section.id);
      shown.push(section.meta.passage);
    }
    this.guard.allow(out);
    return { text: out, label: `${entry.meta.docket ?? entry.meta.decision_id}`, passages: shown };
  }

  assemble(input) {
    const claims = input.claims ?? [], rows = input.rows ?? [];
    const inventory = this.sections().filter(s => s.kind === "source").map(section => ({
      section_id: section.id,
      claim_ids: claims.filter(c => c.citations?.some(cite => cite.section_id === section.id)).map(c => c.id),
      review: this.read.has(section.id) ? "reviewed" : "unresolved",
    }));
    return { version: 1, task: this.task, claims, rows, coverage: { source_inventory: inventory, all_claims_extracted: false, more_claims_reported: Boolean(input.more_claims_reported), scope: "selected_sources_only" } };
  }

  toolSubmit(input) {
    // Read before writing: a quotation from a section never opened is rejected.
    const unread = new Set();
    for (const claim of input.claims ?? []) for (const cite of [...(claim.citations ?? []), ...(claim.context_references ?? [])]) if (!this.read.has(cite.section_id)) unread.add(cite.section_id);
    if (unread.size) return { ok: false, error: `read_before_quoting: read these sections before quoting them: ${[...unread].slice(0, 20).join(", ")}` };
    const result = this.assemble(input);
    try {
      validateWorkflowResult(result, { task: this.task, sections: this.sections() });
    } catch (error) {
      return { ok: false, error: `${error.code ?? "invalid"}: ${explain(error.code, result, this.sections())}` };
    }
    return { ok: true, result };
  }

  // --- loop ----------------------------------------------------------------
  async run() {
    this.started = now();
    this.status = "running";
    this.trace("status", { status: "running" });
    try {
      if (!this.store.consentValid()) throw new CourtosError("consent_required");
      this.mirror = structuredClone(this.store.mirror);
      this.index = buildIndex(this.mirror);
      this.guard = this.store.guard();
      // Working notes become attributed context sections; their text is the
      // user's own and is pseudonymised with the case register first.
      for (const id of this.noteIds) {
        const note = this.store.notes.find(n => n.id === id);
        if (!note) throw new CourtosError("note_unknown");
        const section = {
          id: this.nextSection(), kind: "working_note", text: this.store.pseudonymise(note.text),
          attribution: { author: "user", status: note.status },
          meta: { note: note.id, label: noteLabel(note.id, this.store.lang) },
        };
        this.extra.push(section);
        this.read.add(section.id);
      }
      if (this.question) this.questionSent = this.store.pseudonymise(this.question);
      const system = systemPrompt(this.task, this.language, this.store.lang);
      const toolDefs = tools(this.task);
      const noteBlock = this.extra.filter(s => s.kind === "working_note").map(s => `[${s.id} · working note by the user · status ${s.attribution.status}${this.task === "hypothetical_impact" ? " · hypothetical assumption" : ""}]\n${s.text}`).join("\n\n");
      const opening = [
        this.task === "source_chat" ? `Question: ${this.questionSent}` : `Prepare the ${this.task} working draft for this case folder.`,
        this.task === "decision_draft" && this.questionSent ? `Drafting direction from the judge (not evidence): ${this.questionSent}` : null,
        noteBlock ? `Selected working notes (context only, never evidence):\n\n${noteBlock}` : null,
        "Start with list_documents.",
      ].filter(Boolean).join("\n\n");
      const messages = [{ role: "user", content: opening }];
      let submits = 0, nudged = false;
      for (let turn = 1; turn <= this.limits.maxTurns; turn++) {
        if (this.controller.signal.aborted) return;
        if (!this.store.consentValid() || this.store.mirror.sha256 !== this.mirror.sha256) throw new CourtosError("folder_changed_during_run");
        // Adaptive thinking with display "updates": reasoning stays hidden, the
        // short progress notes Claude writes between tool calls come back as text.
        const body = {
          model: this.model, max_tokens: this.limits.maxOutputTokens,
          thinking: { type: "adaptive", display: "updates" }, output_config: { effort: EFFORT[this.task] },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools: toolDefs, messages: withCacheBreakpoint(messages),
        };
        this.guard.checkBody(body);
        const json = JSON.stringify(body);
        const n = this.requests.length + 1;
        await writeAtomic(join(this.dir, "requests", `${String(n).padStart(3, "0")}.json`), json);
        this.requests.push({ n, sha256: sha256(json), bytes: Buffer.byteLength(json) });
        this.trace("thinking", { turn });
        const response = await this.provider.create(body, { signal: this.controller.signal });
        for (const key of Object.keys(this.usage)) this.usage[key] += response.usage?.[key] ?? 0;
        this.emit("usage", this.usage);
        const total = this.usage.input_tokens + this.usage.output_tokens + this.usage.cache_read_input_tokens + this.usage.cache_creation_input_tokens;
        if (total > this.limits.maxTotalTokens) throw new CourtosError("token_limit_reached");
        // A refusal ends the run. There is no fallback model: the release names one model.
        if (response.stop_reason === "refusal") throw new CourtosError("model_refused", { category: response.stop_details?.category ?? null });
        messages.push({ role: "assistant", content: response.content });
        // Progress notes and text, shown locally with names restored. Thinking blocks
        // go back to the model unchanged.
        const restore = rehydrator(this.store.register);
        for (const block of response.content) {
          const text = block.type === "text" ? block.text : block.type === "thinking" ? block.thinking : null;
          if (text?.trim()) this.trace("note", { text: restore(text.trim().slice(0, 600)).text });
        }
        const calls = response.content.filter(block => block.type === "tool_use");
        if (!calls.length) {
          if (response.stop_reason === "max_tokens") throw new CourtosError("output_limit_reached");
          if (nudged) throw new CourtosError("no_result_submitted");
          nudged = true;
          messages.push({ role: "user", content: "Continue the task with the tools and finish by calling submit_result." });
          continue;
        }
        const results = [];
        for (const call of calls) {
          let content, isError = false;
          try {
            if (call.name === "list_documents") {
              content = this.toolListDocuments();
              this.trace("list", { documents: this.mirror.documents.length });
            } else if (call.name === "read") {
              const out = this.toolRead(call.input ?? {});
              content = out.error ?? out.text;
              isError = Boolean(out.error);
              this.trace("read", { pages: out.labels ?? [], count: out.count ?? 0 });
            } else if (call.name === "search") {
              const out = this.toolSearch(call.input ?? {});
              content = JSON.stringify(out);
              this.trace("search", { query: String(call.input?.query ?? "").slice(0, 200), hits: out.hits.length });
            } else if (call.name === "search_case_law" && TASKS[this.task].caseLaw) {
              const out = await this.toolSearchCaseLaw(call.input ?? {});
              content = JSON.stringify(out);
              isError = Boolean(out.error);
              for (const r of out.results ?? []) this.guard.allow(`${r.regeste ?? ""} ${r.snippet ?? ""}`);
              this.trace("caselaw_search", { query: String(call.input?.query ?? "").slice(0, 200), hits: out.results?.length ?? 0, error: out.error ?? null });
            } else if (call.name === "read_decision" && TASKS[this.task].caseLaw) {
              const out = await this.toolReadDecision(call.input ?? {});
              content = out.error ?? out.text;
              isError = Boolean(out.error);
              this.trace("caselaw_read", { label: out.label ?? String(call.input?.reference ?? "").slice(0, 80), passages: out.passages ?? [], error: out.error ?? null });
            } else if (call.name === "submit_result") {
              submits++;
              const out = this.toolSubmit(call.input ?? {});
              if (out.ok) {
                this.trace("validated", { claims: out.result.claims.length, rows: out.result.rows.length });
                this.result = out.result;
                this.bound = bindResult(this.store, this.mirror, out.result, this.task, this.extra);
                this.trace("bound", { verified: this.bound.claims.filter(c => c.citations.every(x => x.match === "exact")).length, claims: this.bound.claims.length });
                await writeJson(join(this.dir, "result.json"), { result: out.result, bound: this.bound, decisions: [...this.decisions.values()].map(d => d.meta) });
                await this.finish("succeeded");
                return;
              }
              this.trace("rejected", { reason: out.error.slice(0, 300) });
              if (submits >= this.limits.maxSubmits) throw new CourtosError("result_failed_validation", { reason: out.error });
              content = `Validation failed. Nothing was saved. ${out.error}\nCorrect exactly this and call submit_result again.`;
              isError = true;
            } else {
              content = "Unknown tool.";
              isError = true;
            }
          } catch (error) {
            // Network trouble with OpenCaseLaw is reported to the model; a guard
            // block or an internal error ends the run.
            if (error.code === "outbound_blocked" || !String(error.code ?? "").startsWith("caselaw_")) throw error;
            content = `Case law is temporarily unavailable (${error.code}). Continue with the case documents and say which authorities could not be checked.`;
            isError = true;
            this.trace("caselaw_error", { code: error.code });
          }
          results.push({ type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) });
        }
        messages.push({ role: "user", content: results });
      }
      throw new CourtosError("turn_limit_reached");
    } catch (error) {
      if (this.controller.signal.aborted) return;
      const code = error.code ?? (error.status ? `provider_${error.status}` : "run_failed");
      await this.finish(code === "outbound_blocked" ? "blocked" : "failed", { code, detail: error.detail ?? null });
    }
  }
}

/** Copy of the conversation with one cache breakpoint on its last block, so
 *  each turn reuses the previous prefix (system prompt has its own). */
function withCacheBreakpoint(messages) {
  const copy = messages.map(m => ({ ...m, content: typeof m.content === "string" ? m.content : m.content.map(b => ({ ...b })) }));
  const last = copy[copy.length - 1];
  if (typeof last.content === "string") last.content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
  else if (last.content.length) last.content[last.content.length - 1].cache_control = { type: "ephemeral" };
  return copy;
}

/** Short, actionable validation messages for the model (no original text). */
function explain(code, result, sections) {
  const byId = new Map(sections.map(s => [s.id, s]));
  switch (code) {
    case "quote_absent": {
      const bad = [];
      for (const claim of result.claims) for (const cite of [...claim.citations, ...(claim.context_references ?? [])]) {
        const text = byId.get(cite.section_id)?.text ?? "";
        if (!text.includes(cite.exact_quote)) bad.push(`${claim.id} → ${cite.section_id}`);
      }
      return `these quotations are not found verbatim in the cited section: ${bad.slice(0, 12).join("; ")}. Copy the exact characters from the read text.`;
    }
    case "quote_ambiguous": {
      const bad = [];
      for (const claim of result.claims) for (const cite of [...claim.citations, ...(claim.context_references ?? [])]) {
        const text = byId.get(cite.section_id)?.text ?? "";
        const at = text.indexOf(cite.exact_quote);
        if (at >= 0 && text.indexOf(cite.exact_quote, at + 1) >= 0) bad.push(`${claim.id} → ${cite.section_id}`);
      }
      return `these quotations occur more than once in their section: ${bad.slice(0, 12).join("; ")}. Extend each until it is unique.`;
    }
    case "party_attribution": return "a party-position claim quotes a section that is not a pleading of the row's party (or the row party is wrong). Statement/event/position claims must quote the row party's own claim/response/submission.";
    case "date_quote": return "a chronology date claim must have exactly one citation and its text must equal that exact quotation (max 80 characters).";
    case "date_source": return "a date quotation must come from the same pleading document as the event claim.";
    case "source_role": return "evidence claims must quote an exhibit section; authority claims must quote an authority or literature section (a decision passage opened with read_decision, or a literature document).";
    case "opposing_party": return "opposing claims must quote a pleading of a different, non-null party.";
    case "assessment": return "supports/contradicts (or supports/contrary) need at least one evidence/authority claim; not_found must have no evidence.";
    case "manual_source": return "manual_source must be set exactly when the assessment is manual_check_required, and must quote the party's own reference.";
    case "relief_source": return "a relief position must copy one express prayer verbatim: claim.text equal to its single exact_quote from that party's pleading.";
    case "finding_status": return "decision_draft status is fixed by part: facts → alleged/disputed/working_assumption; disposition → proposal; all other parts → analysis.";
    case "assumption": return "hypothetical_impact: assumption_id must be the working note's S-number, and the analysis claim must include that note's full text as a context_reference.";
    case "unused_claim": return "every claim must be referenced by a row field; remove orphan claims.";
    case "claim_reference": return "a row references a claim id that does not exist.";
    case "duplicate_citation": return "the same citation appears twice in one claim.";
    case "duplicate_id": return "claim or row ids must be unique.";
    case "schema": return "the claims/rows do not match the schema (ids C1.., R1.., S-numbers, required fields; claims and rows must both be empty or both non-empty).";
    case "source_kind": {
      // Name each wrong reference and its direction: a document in the case
      // folder is a source unless the user marked it as an internal note.
      const bad = [];
      for (const claim of result.claims) {
        for (const cite of claim.citations) {
          const section = byId.get(cite.section_id);
          if (!section) bad.push(`${claim.id} → ${cite.section_id} in citations: no such section`);
          else if (section.kind !== "source") bad.push(`${claim.id} → ${cite.section_id} in citations: ${section.attribution?.author === "court" ? "a page of an internal note of the court" : "a user working note"}, not a source; move it to context_references or drop it`);
        }
        for (const cite of claim.context_references ?? []) {
          const section = byId.get(cite.section_id);
          if (!section) bad.push(`${claim.id} → ${cite.section_id} in context_references: no such section`);
          else if (section.kind === "source") bad.push(`${claim.id} → ${cite.section_id} in context_references: a page of case document ${section.source?.document ?? "?"}, which is a source (it is not listed under working_notes); move it to citations or drop it`);
        }
      }
      return `${bad.slice(0, 12).join("; ")}. context_references take only the sections listed under working_notes by list_documents (user notes and internal notes of the court); every other document of the case folder is a source.`;
    }
    default: return "the result does not satisfy the workflow contract.";
  }
}
