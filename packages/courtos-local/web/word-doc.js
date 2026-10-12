// What CourtOS puts into the court's document, as plain data: a table or an
// outline of headings and paragraphs. word.js typesets it with the document's
// own styles. Every string is built here, synchronously, so that it can be
// produced in the language of the proceedings (see inLanguage in shared.js).
import { claimPlain, label, parseDate, refLabel, tr } from "./shared.js";

const NBSP = " ";
/** "Klage, S. 1; KB 1, S. 3", with the page number bound to its abbreviation. */
export const sources = (claim) => [...new Set((claim?.citations ?? []).map(refLabel))].join("; ").replace(/\b(S|p|pag)\. (\d)/g, `$1.${NBSP}$2`);
const text = (claim) => claimPlain(claim) || "–";
/** A cell starts with a capital, as a line in a court document does. */
const cap = (value) => value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value;

/**
 * A party as a court document names it: by its procedural role in the
 * language of the proceedings ("Klägerin", "Beklagte"), numbered when two
 * parties share a role. The register name stays out of the cell; the
 * document names the parties once, in its own rubrum.
 */
export function partyName(state, id) {
  const parties = state?.case?.parties ?? [];
  const party = parties.find(p => p.id === id);
  if (!party) return id ? id : tr("ohne Partei");
  const term = party.term ? cap(party.term) : party.name ?? party.id;
  const same = parties.filter(p => p.role === party.role && p.term === party.term);
  return same.length > 1 ? `${term} ${same.indexOf(party) + 1}` : term;
}

const claimsOf = (run) => new Map(run.result.claims.map(c => [c.id, c]));

function chronology(run, state) {
  const claims = claimsOf(run);
  const rows = run.result.rows
    .map(row => ({ row, date: row.date ? parseDate(claims.get(row.date)?.text) : null }))
    .sort((a, b) => (a.date && b.date) ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0)
    .map(({ row }) => [
      { text: row.date ? text(claims.get(row.date)) : tr("ohne Datum") },
      { text: partyName(state, row.party), sub: cap(label("posture", row.posture)) },
      { text: text(claims.get(row.event)) },
      { text: sources(claims.get(row.event)) || "–" },
    ]);
  return { kind: "table", columns: [
    { head: tr("Datum"), width: 0.16 }, { head: tr("Partei"), width: 0.16 }, { head: tr("Ereignis"), width: 0.48 }, { head: tr("Fundstelle"), width: 0.20 },
  ], rows };
}

function factsEvidence(run, state) {
  const claims = claimsOf(run);
  return { kind: "table", columns: [
    { head: tr("Partei"), width: 0.14 }, { head: tr("Behauptung"), width: 0.32 }, { head: tr("Beweismittel"), width: 0.27 }, { head: tr("Einschätzung"), width: 0.12 }, { head: tr("Fundstellen"), width: 0.15 },
  ], rows: run.result.rows.map(row => [
    { text: partyName(state, row.party) },
    { text: text(claims.get(row.statement)) },
    { text: row.evidence.map(id => text(claims.get(id))).join("\n") || "–" },
    { text: cap(label("facts", row.assessment)) },
    { text: [row.statement, ...row.evidence, ...row.opposing, row.reasoning].map(id => sources(claims.get(id))).filter(Boolean).join("; ") || "–" },
  ]) };
}

function partyComparison(run, state) {
  const claims = claimsOf(run);
  const parties = [...new Set(run.result.rows.flatMap(r => r.positions.map(p => p.party)).filter(Boolean))].sort();
  const share = 0.6 / Math.max(parties.length, 1);
  const position = (x) => { const refs = sources(claims.get(x.claim)); return refs ? `${text(claims.get(x.claim))} (${refs})` : text(claims.get(x.claim)); };
  return { kind: "table", columns: [
    { head: tr("Thema"), width: 0.15 }, ...parties.map(p => ({ head: partyName(state, p), width: share })), { head: tr("Einordnung"), width: 0.25 },
  ], rows: run.result.rows.map(row => [
    { text: label("category", row.category) },
    ...parties.map(p => ({ text: row.positions.filter(x => x.party === p).map(position).join("\n") || "–" })),
    { text: text(claims.get(row.analysis)) },
  ]) };
}

function legalClaims(run, state) {
  const claims = claimsOf(run);
  const authority = (id) => { const refs = sources(claims.get(id)); return refs ? `${text(claims.get(id))} (${refs})` : text(claims.get(id)); };
  return { kind: "table", columns: [
    { head: tr("Partei"), width: 0.13 }, { head: tr("Rechtsargument"), width: 0.29 }, { head: tr("Rechtsprechung"), width: 0.26 }, { head: tr("Würdigung"), width: 0.20 }, { head: tr("Einschätzung"), width: 0.12 },
  ], rows: run.result.rows.map(row => [
    { text: partyName(state, row.party) },
    { text: text(claims.get(row.statement)) },
    { text: row.authorities.map(authority).join("\n") || "–" },
    { text: text(claims.get(row.reasoning)) },
    { text: cap(label("legal", row.assessment)) },
  ]) };
}

const para = (claim, lead = null) => ({ text: text(claim), lead, note: sources(claim) });

function fundamentalQuestions(run) {
  const claims = claimsOf(run);
  return { kind: "outline", blocks: run.result.rows.flatMap(row => [
    { heading: text(claims.get(row.question)) },
    para(claims.get(row.analysis)),
    ...row.contrary.map(id => para(claims.get(id), tr("Gegenargument"))),
  ]) };
}

function decisionDraft(run) {
  const claims = claimsOf(run);
  const blocks = [];
  for (const part of ["facts", "issue", "reasoning", "counterargument", "open_issue", "disposition"]) {
    const rows = run.result.rows.filter(r => r.part === part);
    if (!rows.length) continue;
    blocks.push({ heading: label("part", part) });
    // A fact the draft rests on says whether it is alleged, disputed or only a working assumption.
    const lead = (row) => part === "facts" && row.status !== "analysis" ? cap(label("draftStatus", row.status)) : null;
    rows.forEach((row, i) => blocks.push({ ...para(claims.get(row.claim), lead(row)), number: part === "disposition" ? i + 1 : null }));
  }
  return { kind: "outline", blocks };
}

function hypotheticalImpact(run) {
  const claims = claimsOf(run);
  return { kind: "outline", blocks: run.result.rows.flatMap(row => [
    { heading: tr("Ausgangslage") }, para(claims.get(row.baseline)),
    { heading: tr("Unter der Annahme (hypothetisch)") }, para(claims.get(row.analysis)),
    ...row.limitations.map(id => para(claims.get(id), tr("Grenze"))),
  ]) };
}

export const BUILD = {
  chronology, facts_evidence: factsEvidence, party_comparison: partyComparison, legal_claims: legalClaims,
  fundamental_questions: fundamentalQuestions, decision_draft: decisionDraft, hypothetical_impact: hypotheticalImpact,
};

/** A plain-text rendering for the clipboard, when the pane runs outside Word. */
export function plainText(spec) {
  if (spec.kind === "table") return [spec.columns.map(c => c.head), ...spec.rows.map(r => r.map(c => [c.text, c.sub].filter(Boolean).join(" – ")))].map(r => r.map(v => v.replace(/\s*\n\s*/g, " / ")).join("\t")).join("\n");
  return spec.blocks.map(b => b.heading ? `\n${b.heading}\n` : `${b.number ? `${b.number}. ` : ""}${b.lead ? `${b.lead}: ` : ""}${b.text}${b.note ? ` (${b.note})` : ""}`).join("\n");
}
