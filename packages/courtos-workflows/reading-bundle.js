"use strict";

/** Direct, typed row links for reading a validated result. These are not added
 * model citations, semantic support, recursive dependencies or packet searches. */
function workflowReadingDependencies(result, claimId) {
  const fail = () => { throw new Error("reading_bundle_invalid"); };
  if (!result || !Array.isArray(result.claims) || !Array.isArray(result.rows)
      || result.claims.length > 1000 || result.rows.length > 1000) return fail();
  const claims = new Set(result.claims.map(c => c.id));
  if (claims.size !== result.claims.length || !claims.has(claimId)) return fail();
  const rows = new Set(), out = [], seen = new Set();
  for (const row of result.rows) {
    if (!row || typeof row.id !== "string" || rows.has(row.id)) return fail();
    rows.add(row.id);
    const add = (id, role, party = null) => {
      if (!claims.has(id) || (party !== null && typeof party !== "string")) return fail();
      if (id === claimId) return;
      const key = JSON.stringify([row.id, id, role, party]);
      if (seen.has(key)) return;
      seen.add(key); out.push({ row_id: row.id, claim_id: id, role, party });
    };
    // Only the analysis/reasoning reads its explicitly linked inputs.
    // A party position never inherits the analysis or its opponent's evidence.
    switch (result.task) {
      case "party_comparison":
        if (row.analysis === claimId) for (const p of row.positions) add(p.claim, "party_position", p.party);
        break;
      case "facts_evidence":
        if (row.reasoning === claimId) {
          add(row.statement, "statement", row.party);
          row.evidence.forEach(id => add(id, "evidence"));
          row.opposing.forEach(id => add(id, "opposing_position"));
        }
        break;
      case "legal_claims":
        if (row.reasoning === claimId) {
          add(row.statement, "statement", row.party);
          row.authorities.forEach(id => add(id, "authority"));
          if (row.manual_source !== null) add(row.manual_source, "manual_pointer");
        }
        break;
      case "chronology": break;
      case "fundamental_questions":
        if (row.analysis === claimId) { add(row.question, "question"); row.contrary.forEach(id => add(id, "counterargument")); }
        break;
      case "hypothetical_impact":
        if (row.analysis === claimId) { add(row.baseline, "baseline"); row.limitations.forEach(id => add(id, "limitation")); }
        // assumption_id is a context note, never an original-source dependency.
        break;
      case "source_chat": case "decision_draft": break;
      default: return fail();
    }
  }
  return out;
}
module.exports = { workflowReadingDependencies };
