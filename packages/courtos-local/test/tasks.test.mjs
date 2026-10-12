// The legal tasks: case-law tools, public passages as authorities, working
// notes as hypothetical assumptions, and the guard around public text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRun } from "../src/agent/runner.mjs";
import { ScriptedProvider, toolUse } from "../src/agent/providers.mjs";
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
