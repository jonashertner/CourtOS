const test = require("node:test");
const assert = require("node:assert/strict");
const { WORKFLOW_TASKS, validateWorkflowResult } = require("./index");

const sections = [
  { id: "S1", kind: "source", source: { document: "D1", version: "V1", party: "P1", role: "claim" }, text: "The claimant alleges payment on 3 May 2026. Receipt is contested." },
  { id: "S2", kind: "source", source: { document: "D2", version: "V1", party: "P2", role: "response" }, text: "The respondent denies receipt and disputes the legal argument." },
  { id: "S3", kind: "source", source: { document: "D3", version: "V1", party: "P1", role: "exhibit" }, text: "The bank statement records a transfer on 3 May 2026." },
  { id: "S4", kind: "source", source: { document: "D4", version: "V1", party: null, role: "authority" }, text: "This synthetic authority discusses an opportunity to respond." },
  { id: "S5", kind: "working_note", attribution: { author: "user", status: "proposed" }, text: "Assume the notice arrived later." },
];
function fixture(task) {
  const claims = [];
  const add = (source, text, exact = source.text) => {
    const id = `C${claims.length + 1}`;
    claims.push({ id, text: text ?? exact, citations: [{ section_id: source.id, exact_quote: exact }] }); return id;
  };
  let rows;
  if (task === "chronology") rows = [{ id: "R1", event: add(sections[0]), party: "P1", posture: "allegation", date: add(sections[0], "3 May 2026", "3 May 2026") }, { id: "R2", event: add(sections[1]), party: "P2", posture: "denial", date: null }];
  if (task === "facts_evidence") rows = [{ id: "R1", statement: add(sections[0]), party: "P1", posture: "disputed", evidence: [add(sections[2])], opposing: [add(sections[1])], assessment: "supports", reasoning: add(sections[2], "A transfer is recorded; the recipient remains to be checked.") }];
  if (task === "legal_claims") rows = [{ id: "R1", statement: add(sections[1]), party: "P2", authorities: [add(sections[3])], assessment: "insufficient", reasoning: add(sections[3], "The selected authority does not resolve the payment dispute."), manual_source: null }];
  if (task === "party_comparison") rows = [{ id: "R1", category: "fact", positions: [{ party: "P1", posture: "allegation", claim: add(sections[0]) }, { party: "P2", posture: "denial", claim: add(sections[1]) }], analysis: add(sections[1], "Receipt remains disputed.") }];
  if (task === "source_chat") rows = [{ id: "R1", answer: add(sections[0], "The claimant alleges payment.") }];
  if (task === "decision_draft") rows = [{ id: "R1", part: "facts", claim: add(sections[0]), status: "disputed" }, { id: "R2", part: "disposition", claim: add(sections[3], "Consider giving an opportunity to respond."), status: "proposal" }];
  if (task === "fundamental_questions") rows = [{ id: "R1", question: add(sections[3], "Was there an opportunity to respond?"), analysis: add(sections[3]), contrary: [add(sections[1])] }];
  if (task === "hypothetical_impact") {
    rows = [{ id: "R1", baseline: add(sections[0]), assumption_id: "S5", analysis: add(sections[3], "A later notice may require reconsidering the opportunity to respond."), limitations: [add(sections[3], "The selected passage does not establish the procedural dates.")] }];
    claims[1].context_references = [{ section_id: "S5", exact_quote: sections[4].text }];
  }
  return { version: 1, task, claims, rows, coverage: { source_inventory: sections.filter(section => section.kind === "source").map(section => ({ section_id: section.id, claim_ids: claims.filter(claim => claim.citations.some(citation => citation.section_id === section.id)).map(claim => claim.id), review: "reviewed" })), all_claims_extracted: false, more_claims_reported: false, scope: "selected_sources_only" } };
}
const run = (value, inputSections = sections) => validateWorkflowResult(value, { task: value.task, sections: inputSections });
const rejects = (task, mutate, code) => { const value = fixture(task); mutate(value); assert.throws(() => run(value), { code }); };

for (const task of WORKFLOW_TASKS) test(`${task}: one source-bound engine, explicit inventory, no semantic/completeness claim`, () => {
  const value = fixture(task), result = run(value); assert.deepEqual(result, value); assert.notEqual(result, value);
  assert.equal(result.coverage.all_claims_extracted, false); assert.equal(result.coverage.scope, "selected_sources_only");
});
test("rejects unknown/free text row fields and a result for another task", () => {
  rejects("source_chat", value => { value.rows[0].uncited_text = "model memory"; }, "schema");
  assert.throws(() => validateWorkflowResult(fixture("source_chat"), { task: "chronology", sections }), { code: "schema" });
});
test("permits an honest empty result with full coverage instead of forcing an invented assertion", () => {
  const result = fixture("source_chat"); result.claims = []; result.rows = [];
  result.coverage.source_inventory.forEach(entry => { entry.claim_ids = []; entry.review = "unresolved"; });
  assert.deepEqual(run(result), result);
  const mixed = fixture("source_chat"); mixed.rows = []; assert.throws(() => run(mixed), { code: "schema" });
});
test("does not accept quote normalisation, overlapping ambiguity or note-as-evidence", () => {
  rejects("source_chat", value => { value.claims[0].citations[0].exact_quote = "the claimant alleges payment"; }, "quote_absent");
  const value = fixture("source_chat"); value.claims[0].citations[0].exact_quote = "aa";
  assert.throws(() => run(value, [{ ...sections[0], text: "aaa" }, ...sections.slice(1)]), { code: "quote_ambiguous" });
  rejects("source_chat", value => { value.claims[0].citations[0] = { section_id: "S5", exact_quote: sections[4].text }; }, "source_kind");
});
test("a quotation the caller marks unverified is exempt only from the quotation match", () => {
  const value = fixture("source_chat"); value.claims[0].citations[0].exact_quote = "the claimant alleges payment";
  const unverified_citations = [{ claim: "C1", section_id: "S1", exact_quote: "the claimant alleges payment" }];
  assert.deepEqual(validateWorkflowResult(value, { task: "source_chat", sections, unverified_citations }), value);
  // The exemption is scoped to one claim and one citation: anything else is still checked.
  assert.throws(() => validateWorkflowResult(value, { task: "source_chat", sections, unverified_citations: [{ ...unverified_citations[0], claim: "C2" }] }), { code: "quote_absent" });
  const note = fixture("source_chat"); note.claims[0].citations[0] = { section_id: "S5", exact_quote: "not in the note" };
  assert.throws(() => validateWorkflowResult(note, { task: "source_chat", sections, unverified_citations: [{ claim: "C1", section_id: "S5", exact_quote: "not in the note" }] }), { code: "source_kind" });
});
test("rejects missing/free-floating/duplicate claims and duplicate references", () => {
  rejects("source_chat", value => { value.rows[0].answer = "C99"; }, "claim_reference");
  rejects("source_chat", value => { value.claims.push({ ...value.claims[0], id: "C2" }); }, "unused_claim");
  rejects("source_chat", value => { value.claims.push(value.claims[0]); }, "duplicate_id");
  rejects("facts_evidence", value => { value.rows[0].evidence.push(value.rows[0].evidence[0]); }, "schema");
  rejects("source_chat", value => { value.claims[0].citations.push(value.claims[0].citations[0]); }, "duplicate_citation");
});
test("coverage cannot silently omit pages, add notes, invent complete extraction or misassign claims", () => {
  rejects("source_chat", value => { value.coverage.source_inventory.pop(); }, "coverage");
  rejects("source_chat", value => { value.coverage.source_inventory.push({ section_id: "S5", claim_ids: [], review: "reviewed" }); }, "coverage");
  rejects("source_chat", value => { value.coverage.all_claims_extracted = true; }, "schema");
  rejects("source_chat", value => { value.coverage.source_inventory[0].claim_ids = []; }, "coverage");
  rejects("source_chat", value => { value.coverage.source_inventory[1].claim_ids = ["C1"]; }, "coverage");
});
test("factual and legal assessments require the right original source roles", () => {
  rejects("facts_evidence", value => { value.rows[0].evidence = [value.rows[0].statement]; }, "source_role");
  rejects("facts_evidence", value => { value.rows[0].evidence = []; }, "assessment");
  rejects("facts_evidence", value => { value.rows[0].assessment = "not_found"; }, "assessment");
  rejects("legal_claims", value => { value.rows[0].authorities = [value.rows[0].statement]; }, "source_role");
  rejects("legal_claims", value => { value.rows[0].assessment = "manual_check_required"; }, "manual_source");
});
test("preserves party identity and never compares a party with itself", () => {
  rejects("facts_evidence", value => { value.rows[0].party = "P2"; }, "party_attribution");
  rejects("facts_evidence", value => { value.rows[0].opposing = [value.rows[0].statement]; }, "opposing_party");
  rejects("party_comparison", value => { value.rows[0].positions[1] = { ...value.rows[0].positions[0] }; }, "duplicate_id");
});
test("a chronology retains the literal date and cannot borrow one from another document", () => {
  rejects("chronology", value => { value.claims[1].text = "2026-05-03"; }, "date_quote");
  const value = fixture("chronology"), altered = [...sections, { ...sections[0], id: "S6", source: { ...sections[0].source, document: "D6" } }];
  value.claims[1].citations[0].section_id = "S6";
  assert.throws(() => run(value, altered), { code: "date_source" });
});
test("future decision and impact views preserve proposal and hypothetical status", () => {
  rejects("decision_draft", value => { value.rows[1].status = "analysis"; }, "schema");
  rejects("hypothetical_impact", value => { value.rows[0].assumption_id = "S1"; }, "assumption");
  rejects("hypothetical_impact", value => { value.claims[1].context_references = []; }, "assumption");
});
