// The legal tasks: case-law tools, public passages as authorities, working
// notes as hypothetical assumptions, and the guard around public text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRun } from "../src/agent/runner.mjs";
import { ScriptedProvider, toolUse } from "../src/agent/providers.mjs";
import { systemPrompt } from "../src/agent/tasks.mjs";
import { freshCase } from "./helpers.mjs";

const DECISION_TEXT = [
  "Sachverhalt",
  "A. Die Bauherrin Keller liess ein Wohnhaus sanieren und rügte Mängel an der Abdichtung.",
  "Erwägungen",
  "3.1 Der Besteller hat das Werk nach der Ablieferung zu prüfen und allfällige Mängel dem Unternehmer bekannt zu geben (Art. 367 Abs. 1 OR).",
  "3.2 Bei geheimen Mängeln ist die Rüge sofort nach der Entdeckung zu erheben. Entdeckt ist ein Mangel, sobald der Besteller sichere Kenntnis davon hat.",
].join("\n\n");

function mockCaseLaw() {
  const calls = [];
  return {
    calls,
    async search(query) { calls.push(["search", query]); return { total: 1, results: [{ decision_id: "bge_999_II_1", docket: "BGE 999 II 1", date: "2020-01-01", court: "Bundesgericht", language: "de", regeste: "Mängelrüge; geheime Mängel", snippet: "Bei geheimen Mängeln …" }] }; },
    async decision(id) {
      calls.push(["decision", id]);
      if (id !== "bge_999_II_1") return null;
      return { decision_id: "bge_999_II_1", requested: id, docket: "BGE 999 II 1", date: "2020-01-01", court: "Bundesgericht", language: "de", regeste: null, source_url: null, opencaselaw_url: "https://mcp.opencaselaw.ch/entscheid/bge_999_II_1", text: DECISION_TEXT, text_available: true };
    },
  };
}

/** Section id of the first block in the conversation whose header matches. */
function sectionIn(body, pattern) {
  const texts = body.messages.flatMap(m => typeof m.content === "string" ? [m.content] : m.content.map(b => typeof b.content === "string" ? b.content : b.text ?? ""));
  for (const text of texts) {
    const match = new RegExp(`\\[(S\\d+) · ${pattern}`).exec(text);
    if (match) return match[1];
  }
  throw new Error(`no section for ${pattern}`);
}
const cite = (section_id, exact_quote) => ({ section_id, exact_quote });

test("legal_claims checks a party's argument against a decision it opened", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const caselaw = mockCaseLaw();
    const provider = new ScriptedProvider([
      [toolUse("t1", "list_documents", {})],
      [toolUse("t2", "read", { document: "D1" }), toolUse("t3", "read", { document: "D2" })],
      [toolUse("t4", "search_case_law", { query: "Mängelrüge geheimer Mangel Entdeckung" })],
      [toolUse("t5", "read_decision", { reference: "BGE 999 II 1", focus: "geheimen Mängeln Entdeckung" })],
      (body) => {
        const klage = sectionIn(body, "D1 Klage · S. 2");
        const passage = sectionIn(body, "passage 1");
        return [toolUse("t6", "submit_result", {
          claims: [
            { id: "C1", text: "Die Klägerin macht geltend, bei geheimen Mängeln laufe die Rügefrist ab Entdeckung.", citations: [cite(klage, "Bei geheimen Mängeln läuft die Rügefrist ab Entdeckung.")] },
            { id: "C2", text: "Nach BGE 999 II 1 ist die Rüge bei geheimen Mängeln sofort nach der Entdeckung zu erheben.", citations: [cite(passage, "Bei geheimen Mängeln ist die Rüge sofort nach der Entdeckung zu erheben.")] },
            { id: "C3", text: "Der Ausgangspunkt der Frist ist gestützt; ob die Rüge «sofort» erfolgte, hängt vom Zeitpunkt der sicheren Kenntnis ab.", citations: [cite(klage, "Bei geheimen Mängeln läuft die Rügefrist ab Entdeckung."), cite(passage, "Entdeckt ist ein Mangel, sobald der Besteller sichere Kenntnis davon hat.")] },
          ],
          rows: [{ id: "R1", statement: "C1", party: "P1", authorities: ["C2"], assessment: "supports", reasoning: "C3", manual_source: null }],
          more_claims_reported: false,
        })];
      },
    ]);
    const run = new AgentRun({ store, provider, task: "legal_claims", model: "demo", caselaw });
    await run.run();
    assert.equal(run.status, "succeeded", JSON.stringify(run.error));
    // The decision text names a "Keller": public text may be repeated, the guard did not block it.
    assert.match(JSON.stringify(provider.calls.at(-1)), /Bauherrin Keller/);
    const authority = run.bound.claims.find(c => c.id === "C2").citations[0];
    assert.equal(authority.kind, "authority");
    assert.equal(authority.match, "exact");
    assert.equal(authority.decision_id, "bge_999_II_1");
    assert.deepEqual(caselaw.calls.map(c => c[0]), ["search", "decision"]);
    assert.equal(run.bound.coverage.authorities_read.length, 1);
  } finally { await cleanup(); }
});

test("a case-law query that carries a registered name is never sent", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const caselaw = mockCaseLaw();
    const provider = new ScriptedProvider([
      [toolUse("t1", "search_case_law", { query: "Bianchi Bauleiter Rüge" })],
      [toolUse("t2", "list_documents", {})],
    ]);
    const run = new AgentRun({ store, provider, task: "legal_claims", model: "demo", caselaw });
    await run.run();
    assert.equal(run.status, "blocked");
    assert.equal(caselaw.calls.length, 0, "OpenCaseLaw never saw the query");
  } finally { await cleanup(); }
});

test("a registered name at the end of a search snippet is public text and does not block the next request", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const caselaw = mockCaseLaw();
    // The snippet ends near the name, so the text around it in the request runs into the
    // JSON that carries the results ("Keller.\"},…"), which the bare snippet does not contain.
    caselaw.search = async (query) => { caselaw.calls.push(["search", query]); return { total: 1, results: [{ decision_id: "bge_999_II_1", docket: "BGE 999 II 1", date: "2020-01-01", court: "Bundesgericht", language: "de", regeste: "Mängelrüge", snippet: "vertreten durch Rechtsanwalt Hans-Peter Keller." }] }; };
    const provider = new ScriptedProvider([
      [toolUse("t1", "search_case_law", { query: "Mängelrüge geheimer Mangel" })],
      [toolUse("t2", "list_documents", {})],
    ]);
    const run = new AgentRun({ store, provider, task: "legal_claims", model: "demo", caselaw });
    await run.run();
    assert.notEqual(run.status, "blocked", JSON.stringify(run.error));
    assert.match(JSON.stringify(provider.calls[1]), /Hans-Peter Keller/);
  } finally { await cleanup(); }
});

test("hypothetical_impact uses the user's working note as the assumption", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const note = await store.addNote({ text: "Angenommen, die Klägerin hatte erst am 15. Januar 2025 sichere Kenntnis der Undichtigkeit.", kind: "assumption" });
    await store.release({ model: "demo", budgetChf: null });
    const provider = new ScriptedProvider([
      [toolUse("t1", "list_documents", {})],
      [toolUse("t2", "read", { document: "D1" }), toolUse("t3", "read", { document: "D2" })],
      (body) => {
        const assumption = sectionIn(body, "working note by the user");
        const klage = sectionIn(body, "D1 Klage · S. 2");
        const antwort = sectionIn(body, "D2 Klageantwort · S. 1");
        return [toolUse("t4", "submit_result", {
          claims: [
            { id: "C1", text: "Die Beklagte behauptet Kenntnis der Klägerin spätestens am 6. Dezember 2024.", citations: [cite(antwort, "Die Mängel waren der Klägerin spätestens am 6. Dezember 2024 bekannt.")] },
            { id: "C2", text: "Unter der Annahme lägen zwischen Kenntnis und Rüge nur fünf Tage (hypothetisch).", citations: [cite(klage, "Die Rüge vom 20. Januar 2025 erfolgte unmittelbar nach Entdeckung.")], context_references: [cite(assumption, "Angenommen, die Klägerin hatte erst am 15. Januar 2025 sichere Kenntnis der Undichtigkeit.")] },
            { id: "C3", text: "Die Annahme ersetzt keinen Beweis des Kenntniszeitpunkts.", citations: [cite(antwort, "Die Rüge vom 20. Januar 2025 erfolgte damit rund sechs Wochen nach Entdeckung und ist verspätet.")] },
          ],
          rows: [{ id: "R1", baseline: "C1", assumption_id: assumption, analysis: "C2", limitations: ["C3"] }],
          more_claims_reported: false,
        })];
      },
    ]);
    const run = new AgentRun({ store, provider, task: "hypothetical_impact", model: "demo", notes: [note.id] });
    await run.run();
    assert.equal(run.status, "succeeded", JSON.stringify(run.error));
    const context = run.bound.claims.find(c => c.id === "C2").context[0];
    assert.equal(context.kind, "note");
    assert.equal(context.note, note.id);
  } finally { await cleanup(); }
});

test("a working note with a real name is pseudonymised before it is sent", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const note = await store.addNote({ text: "Frage an Marco Bianchi: Wann wurde die Besichtigung angeboten?", kind: "question" });
    await store.release({ model: "demo", budgetChf: null });
    const provider = new ScriptedProvider([[{ type: "text", text: "…" }], [{ type: "text", text: "…" }]]);
    const run = new AgentRun({ store, provider, task: "fundamental_questions", model: "demo", notes: [note.id], caselaw: mockCaseLaw() });
    await run.run();
    const sent = JSON.stringify(provider.calls[0]);
    assert.equal(sent.includes("Bianchi"), false);
    assert.match(sent, /Frage an [A-Z]\.________/);
  } finally { await cleanup(); }
});

test("a document filed in the case folder cited as context gets a repair message naming the claim and the fix", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const run = new AgentRun({ store, provider: new ScriptedProvider([]), task: "chronology", model: "demo" });
    run.mirror = structuredClone(store.mirror);
    const section = (role) => run.sections().find(s => s.source?.role === role);
    const claim = section("claim"), other = run.sections().find(s => s.kind === "source" && s.source.role !== "claim" && s.source.role !== "response");
    for (const s of run.sections()) run.read.add(s.id);
    const quote = (s) => s.text.split("\n").find(line => line.trim().length > 20 && s.text.indexOf(line) === s.text.lastIndexOf(line)).trim();
    const out = run.toolSubmit({
      claims: [
        { id: "C1", text: "Ereignis", citations: [cite(claim.id, quote(claim))], context_references: [cite(other.id, quote(other))] },
        { id: "C2", text: "Datum", citations: [cite(claim.id, quote(claim))] },
      ],
      rows: [{ id: "R1", event: "C1", party: "P1", posture: "allegation", date: null }],
      more_claims_reported: false,
    });
    assert.equal(out.ok, false);
    assert.match(out.error, /^source_kind: /);
    assert.ok(out.error.includes(`C1 → ${other.id} in context_references: a page of case document ${other.source.document}`), out.error);
    assert.match(out.error, /move it to citations or drop it/);
  } finally { await cleanup(); }
});

test("the court's internal note is context for Claude, never evidence, and its role is part of the release", async () => {
  const { store, cleanup } = await freshCase();
  try {
    const note = store.sources.find(s => s.rel_path === "Instruktionsnotiz.docx");
    assert.equal(note.role, "internal_note", "a file named as an internal note is recognised by its name");
    await store.release({ model: "demo", budgetChf: null });
    const run = new AgentRun({ store, provider: new ScriptedProvider([]), task: "chronology", model: "demo" });
    run.mirror = structuredClone(store.mirror);
    const listed = JSON.parse(run.toolListDocuments());
    const notePage = store.mirror.documents.find(d => d.id === note.id).pages.find(p => p.section);
    assert.deepEqual(listed.working_notes.map(w => w.section), [notePage.section], "list_documents offers the note as a working note");
    assert.match(listed.documents.find(d => d.document === note.id).role, /context only/);
    assert.equal(run.sections().find(s => s.id === notePage.section).kind, "working_note");

    const claim = run.sections().find(s => s.source?.role === "claim");
    for (const s of run.sections()) run.read.add(s.id);
    const quote = (text) => text.split("\n").find(line => line.trim().length > 20 && text.indexOf(line) === text.lastIndexOf(line)).trim();
    const submit = (citations, context) => run.toolSubmit({
      claims: [
        { id: "C1", text: "Ereignis", citations, context_references: context },
        { id: "C2", text: "Datum", citations: [cite(claim.id, quote(claim.text))] },
      ],
      rows: [{ id: "R1", event: "C1", party: "P1", posture: "allegation", date: null }],
      more_claims_reported: false,
    });
    const asEvidence = submit([cite(notePage.section, quote(notePage.text))], []);
    assert.equal(asEvidence.ok, false);
    assert.ok(asEvidence.error.includes(`C1 → ${notePage.section} in citations: a page of an internal note of the court, not a source`), asEvidence.error);
    const asContext = submit([cite(claim.id, quote(claim.text))], [cite(notePage.section, quote(notePage.text))]);
    assert.doesNotMatch(asContext.error ?? "", /source_kind/, "the note is accepted as context");

    // Marking it as an ordinary document changes what Claude reads: the release lapses.
    await store.changeSource(note.id, { role: "other" });
    assert.equal(store.consentValid(), false);
  } finally { await cleanup(); }
});

test("effort is fixed per task, Claude's progress notes reach the trace with names restored, and a refusal ends the run", async () => {
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const pseudonym = store.register.entities.find(e => e.label === "Marco Bianchi").replacement;
    const provider = new ScriptedProvider([
      [{ type: "thinking", thinking: `Überblick verschafft; als Nächstes lese ich die Eingaben von ${pseudonym}.`, signature: "sig" }, toolUse("t1", "list_documents", {})],
      { content: [], stop_reason: "refusal", stop_details: { category: null } },
    ]);
    const run = new AgentRun({ store, provider, task: "decision_draft", model: "demo", caselaw: mockCaseLaw() });
    await run.run();
    assert.equal(provider.calls[0].output_config.effort, "high");
    assert.deepEqual(provider.calls[0].thinking, { type: "adaptive", display: "updates" });
    assert.equal(provider.calls[1].messages[1].content[0].type, "thinking", "thinking blocks go back to the model unchanged");
    const note = run.events.find(e => e.type === "note");
    assert.equal(note.text, "Überblick verschafft; als Nächstes lese ich die Eingaben von Marco Bianchi.");
    assert.equal(run.status, "failed");
    assert.equal(run.error.code, "model_refused");

    const extraction = new AgentRun({ store, provider: new ScriptedProvider([]), task: "chronology", model: "demo" });
    await extraction.run();
    assert.equal(extraction.provider.calls[0].output_config.effort, "medium");
  } finally { await cleanup(); }
});

test("a quotation gets one correction; if it still fails, the claim is kept as unverified and needs review", async () => {
  const { bindResult } = await import("../src/verify.mjs");
  const { store, cleanup } = await freshCase();
  try {
    await store.release({ model: "demo", budgetChf: null });
    const run = new AgentRun({ store, provider: new ScriptedProvider([]), task: "source_chat", question: "Was ist streitig?", model: "demo" });
    run.mirror = structuredClone(store.mirror);
    const claim = run.sections().find(s => s.source?.role === "claim");
    for (const s of run.sections()) run.read.add(s.id);
    const good = claim.text.split("\n").find(line => line.trim().length > 20 && claim.text.indexOf(line) === claim.text.lastIndexOf(line)).trim();
    const submit = (claims) => run.toolSubmit({ claims, rows: claims.map((c, i) => ({ id: `R${i + 1}`, answer: c.id })), more_claims_reported: false });

    const first = submit([{ id: "C1", text: "Belegt", citations: [cite(claim.id, good)] }, { id: "C2", text: "Erfunden", citations: [cite(claim.id, "Diese Stelle steht nirgends in der Klage.")] }]);
    assert.equal(first.ok, false);
    assert.match(first.error, /^quotation: these quotations are not found verbatim in the cited section: C2 → S\d+\./);
    assert.match(first.error, /one correction/);

    // A claim that has not had its correction yet is sent back, not accepted.
    const second = submit([
      { id: "C1", text: "Belegt", citations: [cite(claim.id, good)] },
      { id: "C2", text: "Erfunden", citations: [cite(claim.id, "Auch diese Stelle steht nirgends.")] },
      { id: "C3", text: "Neu", citations: [cite(claim.id, "Eine neue erfundene Stelle.")] },
    ]);
    assert.equal(second.ok, false);
    assert.match(second.error, /C3 → /);
    assert.doesNotMatch(second.error, /C2 → /);

    const third = submit([
      { id: "C1", text: "Belegt", citations: [cite(claim.id, good)] },
      { id: "C2", text: "Erfunden", citations: [cite(claim.id, "Auch diese Stelle steht nirgends.")] },
      { id: "C3", text: "Neu", citations: [cite(claim.id, "Immer noch erfunden.")] },
    ]);
    assert.equal(third.ok, true, third.error);
    assert.deepEqual(third.unverified.map(f => [f.claim, f.reason]), [["C2", "absent"], ["C3", "absent"]]);
    const bound = bindResult(store, run.mirror, third.result, "source_chat", run.extra);
    assert.deepEqual(bound.claims.map(c => c.citations[0].match), ["exact", "absent", "absent"], "an unverified quotation is never bound to the original");
    assert.equal(bound.claims[1].citations[0].quote_original, undefined);
  } finally { await cleanup(); }
});

test("progress notes are asked for in the reader's language, a draft in the language of the proceedings", () => {
  assert.match(systemPrompt("chronology", "fr", "de"), /progress note: write it in French,/);
  assert.match(systemPrompt("decision_draft", "fr", "de"), /Write all claim texts in German\./);
  assert.match(systemPrompt("decision_draft", "fr", "de"), /progress note: write it in French,/);
  // A French note read "les claims et les lignes": schema words are not the reader's language.
  assert.match(systemPrompt("chronology", "fr"), /not the names of tools or result fields/);
});
