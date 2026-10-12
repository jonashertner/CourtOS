"use strict";
const schema = require("./schema.json");
const WORKFLOW_TASKS = Object.freeze(schema.properties.task.enum);
class WorkflowResultError extends Error {
  constructor(code) { super(code); this.name = "WorkflowResultError"; this.code = code; }
}
const fail = code => { throw new WorkflowResultError(code); };
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const unsafe = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;

// Only the fixed, bundled response contract is read here. Task rows use the
// same schema as the gateway; this is not an extensible user-supplied schema.
function shape(value, rule) {
  if (rule.anyOf) return rule.anyOf.some(option => shape(value, option));
  if (Object.hasOwn(rule, "const") && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.type === "null") return value === null;
  if (rule.type === "boolean") return typeof value === "boolean";
  if (rule.type === "string") return typeof value === "string" && !unsafe.test(value)
    && Array.from(value).length >= (rule.minLength ?? 0) && Array.from(value).length <= (rule.maxLength ?? Infinity)
    && (!rule.pattern || new RegExp(rule.pattern, "u").test(value));
  if (rule.type === "array") return Array.isArray(value) && value.length >= (rule.minItems ?? 0)
    && value.length <= (rule.maxItems ?? Infinity) && (!rule.uniqueItems || new Set(value.map(item => JSON.stringify(item))).size === value.length)
    && value.every(item => shape(item, rule.items));
  if (rule.type === "object") return record(value) && (!rule.properties || (
    (rule.required ?? []).every(key => Object.hasOwn(value, key))
    && (rule.additionalProperties !== false || Object.keys(value).every(key => Object.hasOwn(rule.properties, key)))
    && Object.entries(rule.properties).every(([key, child]) => !Object.hasOwn(value, key) || shape(value[key], child))));
  return true;
}
const sameSet = (one, two) => one.length === two.length && new Set(one).size === one.length && one.every(value => two.includes(value));
const pleadingRoles = new Set(["claim", "response", "submission"]);
const authorityRoles = new Set(["authority", "literature"]);

/** Source matching and task structure only. Does not establish truth, legal
 * applicability, exhaustive extraction, original bytes or caller ownership. */
const MAX_ASSESSMENT_TARGETS = 40;
const MAX_ASSESSMENT_TARGET_BYTES = 131072;
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const citationKey = citation => canonical(citation);
const sameCitations = (one, two) => sameSet(one.map(citationKey), two.map(citationKey));
function checkQuotes(claim, sections) {
  for (const [citations, context] of [[claim.citations, false], [claim.context_references ?? [], true]]) {
    const seen = new Set();
    for (const citation of citations) {
      const section = sections.get(citation.section_id);
      if (!section || (context ? !["working_note", "conversation_excerpt"].includes(section.kind) : section.kind !== "source")) fail("source_kind");
      const key = citationKey(citation);
      if (seen.has(key)) fail("duplicate_citation"); seen.add(key);
      const start = section.text.indexOf(citation.exact_quote);
      if (!citation.exact_quote.trim() || start < 0) fail("quote_absent");
      if (section.text.indexOf(citation.exact_quote, start + 1) !== -1) fail("quote_ambiguous");
    }
  }
}
/** Prior propositions are selected drafts. Their source anchors are checked;
 * their semantic accuracy is not promoted by this contract. */
function validateAssessmentTargets(value, input) {
  const category = input.task === "facts_evidence" ? "fact" : input.task === "legal_claims" ? "legal" : null;
  const citation = schema.properties.claims.items.properties.citations.items;
  const rule = {type:"array",minItems:1,maxItems:MAX_ASSESSMENT_TARGETS,items:{type:"object",additionalProperties:false,
    required:["id","category","party","text","citations","context_references"],properties:{
      id:{type:"string",pattern:"^T[1-9][0-9]{0,3}$"},category:{const:category},party:{type:"string",pattern:"^P[1-9][0-9]{0,4}$"},
      text:{type:"string",minLength:1,maxLength:4000},citations:{type:"array",minItems:1,maxItems:8,items:citation},
      context_references:{type:"array",maxItems:8,items:citation}}}};
  if (!category || !shape(value, rule)) fail("assessment_targets");
  if (new TextEncoder().encode(canonical(value)).byteLength > MAX_ASSESSMENT_TARGET_BYTES) fail("assessment_targets");
  const sections = new Map(input.sections.map(section => [section.id,section]));
  if (sections.size !== input.sections.length || new Set(value.map(target=>target.id)).size !== value.length) fail("assessment_targets");
  for (const target of value) {
    if (!target.text.trim()) fail("assessment_targets");
    checkQuotes(target,sections);
    if (target.citations.some(c => !pleadingRoles.has(sections.get(c.section_id)?.source?.role) || sections.get(c.section_id)?.source?.party !== target.party)) fail("party_attribution");
  }
  return JSON.parse(JSON.stringify(value));
}
function workflowRequestMessages(packetJson, targets) {
  const messages = [{role:"user",content:packetJson}];
  if (targets !== undefined) messages.push({role:"user",content:canonical({assessment_targets:targets})});
  return messages;
}
/** Same deterministic selection as the provider adapter; no source text edits. */
function legalSourceScope(packet, targets) {
  const scoped = JSON.parse(JSON.stringify(packet));
  const wanted = new Set(targets.flatMap(t => [...t.citations, ...t.context_references].map(c => c.section_id)));
  scoped.sections = scoped.sections.filter(s => wanted.has(s.id) || s.kind === "source" && ["authority", "literature"].includes(s.source.role));
  const pages = new Map();
  for (const s of scoped.sections) if (s.kind === "source" && s.source.format === "pdf") {
    if (!pages.has(s.source.document)) pages.set(s.source.document, new Set());
    pages.get(s.source.document).add(s.source.page);
  }
  scoped.coverage = scoped.coverage.filter(c => pages.has(c.document)).map(c => {
    const included = pages.get(c.document);
    c.selected_pages = c.selected_pages.filter(p => included.has(p));
    c.excluded_pages = Array.from({length:c.total_pages}, (_,i) => i+1).filter(p => !included.has(p));
    if (c.ocr_performed) {
      c.ocr_pages = c.ocr_pages.filter(p => included.has(p));
      if (!c.ocr_pages.length) { delete c.ocr_pages; c.extraction = "pdf_text_only"; c.ocr_performed = false; }
    }
    return c;
  });
  return scoped;
}
/** Reconstruct the provider's additional immutable-source catalogue locally.
 * The browser checks this before approving any outbound request. Hashing is
 * injected to keep this contract usable in both browsers and Node. */
async function workflowPassageRequestMessages(request, sha256) {
  if (request.task !== "legal_claims" || request.assessment_targets === undefined) return workflowRequestMessages(request.packet_json, request.assessment_targets);
  const original = JSON.parse(request.packet_json), packet = legalSourceScope(original, request.assessment_targets), catalogue = [];
  const messages = workflowRequestMessages(canonical(packet), request.assessment_targets);
  for (const section of packet.sections) {
    const length = Array.from(section.text).length;
    const authority = section.kind === "source" && ["authority", "literature"].includes(section.source.role);
    if (length > (authority ? 4000 : 8000)) fail("source_packet_too_large");
    const digest = await sha256(canonical(section));
    catalogue.push({anchor_id: section.id + "-" + digest, section_id: section.id,
      kind: section.kind, section_sha256: digest, start: 0, end: length});
  }
  const request_binding = await sha256(canonical({mode: "selected_legal_target_source_scope_v2", request}));
  const included_source_ids = packet.sections.filter(s => s.kind === "source").map(s => s.id);
  const source_scope = {purpose: "selected_legal_targets_and_authorities", included_source_ids, excluded_source_ids: original.sections.filter(s => s.kind === "source" && !included_source_ids.includes(s.id)).map(s => s.id)};
  messages.push({role: "user", content: canonical({request_binding, source_passage_catalogue: catalogue, source_scope})});
  return messages;
}
function validateWorkflowResult(value, input) {
  if (!input || !WORKFLOW_TASKS.includes(input.task) || !Array.isArray(input.sections)) fail("input");
  let result;
  try {
    const json = JSON.stringify(value);
    if (new TextEncoder().encode(json).byteLength > 1_000_000) fail("schema");
    result = JSON.parse(json);
  } catch { fail("schema"); }
  const rowsRule = schema.allOf.find(rule => rule.if.properties.task.const === input.task).then.properties.rows;
  if (!shape(result, schema) || result.task !== input.task || !shape(result.rows, rowsRule)) fail("schema");
  if ((result.claims.length === 0) !== (result.rows.length === 0)) fail("schema");
  const sections = new Map(input.sections.map(section => [section.id, section]));
  if (sections.size !== input.sections.length || input.sections.some(s => !/^S[1-9][0-9]{0,3}$/.test(s.id) || typeof s.text !== "string")) fail("input");
  const sources = input.sections.filter(section => section.kind === "source");
  if (sources.some(section => !record(section.source) || typeof section.source.role !== "string" || typeof section.source.document !== "string" || typeof section.source.version !== "string" || section.source.party !== null && typeof section.source.party !== "string")) fail("input");
  const claims = new Map(result.claims.map(claim => [claim.id, claim]));
  if (claims.size !== result.claims.length || new Set(result.rows.map(row => row.id)).size !== result.rows.length) fail("duplicate_id");
  for (const claim of result.claims) checkQuotes(claim,sections);
  const targets = input.assessment_targets === undefined ? null : validateAssessmentTargets(input.assessment_targets,input);
  const targetIds = new Set();
  for (const row of result.rows) {
    if (targets === null) { if (Object.hasOwn(row,"target_id")) fail("assessment_target_binding"); continue; }
    const target = targets.find(t => t.id === row.target_id), statement = claims.get(row.statement);
    if (!target || targetIds.has(target.id) || !statement || row.party !== target.party || statement.text !== target.text
      || !sameCitations(statement.citations,target.citations)
      || !sameCitations(statement.context_references ?? [],target.context_references)) fail("assessment_target_binding");
    targetIds.add(target.id);
  }
  if (targets !== null && targetIds.size !== targets.length) fail("assessment_target_binding");
  const used = new Set();
  const claim = id => { const found = claims.get(id); if (!found) fail("claim_reference"); used.add(id); return found; };
  const sourceSections = id => claim(id).citations.map(citation => sections.get(citation.section_id));
  const role = (id, allowed) => { if (!sourceSections(id).some(section => allowed.has(section.source?.role))) fail("source_role"); };
  const party = (id, expected) => {
    const positions = sourceSections(id).filter(section => pleadingRoles.has(section.source?.role));
    if (!positions.length || positions.some(section => section.source.party !== expected)) fail("party_attribution");
  };
  for (const row of result.rows) {
    switch (input.task) {
      case "chronology": {
        party(row.event, row.party);
        if (row.date !== null) {
          const date = claim(row.date); party(row.date, row.party);
          if (date.citations.length !== 1 || date.text !== date.citations[0].exact_quote || Array.from(date.text).length > 80) fail("date_quote");
          const eventDocuments = sourceSections(row.event).map(section => `${section.source.document}:${section.source.version}`);
          if (!sourceSections(row.date).every(section => eventDocuments.includes(`${section.source.document}:${section.source.version}`))) fail("date_source");
        }
        break;
      }
      case "facts_evidence":
        party(row.statement, row.party); claim(row.reasoning);
        row.evidence.forEach(id => role(id, new Set(["exhibit"])));
        row.opposing.forEach(id => {
          const positions = sourceSections(id).filter(section => pleadingRoles.has(section.source?.role));
          if (!positions.length || positions.some(section => section.source.party === null || section.source.party === row.party)) fail("opposing_party");
        });
        if (["supports", "contradicts"].includes(row.assessment) && !row.evidence.length || row.assessment === "not_found" && row.evidence.length) fail("assessment");
        break;
      case "legal_claims":
        party(row.statement, row.party); claim(row.reasoning); row.authorities.forEach(id => role(id, authorityRoles));
        if (["supports", "contrary"].includes(row.assessment) && !row.authorities.length) fail("assessment");
        if (row.assessment === "manual_check_required" ? row.manual_source === null : row.manual_source !== null) fail("manual_source");
        if (row.manual_source !== null) party(row.manual_source, row.party);
        break;
      case "party_comparison":
        row.positions.forEach(position => { if (position.party === null) fail("party_attribution"); party(position.claim, position.party); });
        if (row.category === "relief") {
          // A prayer for relief is copied, not an inferred legal conclusion or
          // a suggested disposition. A silent opponent is never invented.
          for (const position of row.positions) {
            const request = claim(position.claim);
            if (request.citations.length !== 1 || request.text !== request.citations[0].exact_quote
              || (request.context_references ?? []).length !== 0
              || sourceSections(position.claim).some(section => !pleadingRoles.has(section.source?.role)
                || section.source.party !== position.party)) fail("relief_source");
          }
        }
        if (new Set(row.positions.map(position => `${position.party}:${position.claim}`)).size !== row.positions.length) fail("duplicate_id");
        claim(row.analysis); break;
      case "source_chat": claim(row.answer); break;
      case "decision_draft":
        claim(row.claim);
        if (row.part === "disposition" ? row.status !== "proposal" : row.part === "facts" ? !["alleged", "disputed", "working_assumption"].includes(row.status) : row.status !== "analysis") fail("finding_status");
        break;
      case "fundamental_questions": claim(row.question); claim(row.analysis); row.contrary.forEach(claim); break;
      case "hypothetical_impact": {
        claim(row.baseline); const analysis = claim(row.analysis); row.limitations.forEach(claim);
        const assumption = sections.get(row.assumption_id);
        if (assumption?.kind !== "working_note" || assumption.attribution?.author !== "user"
          || !(analysis.context_references ?? []).some(citation => citation.section_id === row.assumption_id)) fail("assumption");
        break;
      }
    }
  }
  if (used.size !== claims.size) fail("unused_claim");
  const inventory = result.coverage.source_inventory;
  if (!sameSet(inventory.map(entry => entry.section_id), sources.map(section => section.id))) fail("coverage");
  for (const entry of inventory) {
    const cited = result.claims.filter(claim => claim.citations.some(citation => citation.section_id === entry.section_id)).map(claim => claim.id);
    if (!sameSet(entry.claim_ids, cited)) fail("coverage");
  }
  return result;
}

module.exports = { WORKFLOW_TASKS, WorkflowResultError, validateWorkflowResult, validateAssessmentTargets, workflowRequestMessages, workflowPassageRequestMessages, MAX_ASSESSMENT_TARGETS, MAX_ASSESSMENT_TARGET_BYTES, ...require("./source-context"), ...require("./reading-bundle") };
