// Readable working notes from a verified run, with real names restored.
// Written to .courtos/wiki/ on this computer only.

const POSTURE = { allegation: "Behauptung", denial: "Bestreitung", disputed: "strittig", unresolved: "offen" };
const ASSESSMENT = { supports: "gestützt", contradicts: "widersprochen", inconclusive: "nicht schlüssig", not_found: "kein Beweismittel gefunden" };

const ref = (citation) => `${citation.label}, ${citation.page_label}${citation.match === "exact" ? "" : " (nicht verifiziert)"}`;
const quote = (citation) => `> «${(citation.quote_original ?? citation.quote_pseudonymised).replace(/\s+/g, " ")}» — ${ref(citation)}`;

export function wikiMarkdown(run, store) {
  const result = run.result;
  const claims = new Map(result.claims.map(c => [c.id, c]));
  const text = (id) => claims.get(id)?.display.text ?? "";
  const cites = (id) => (claims.get(id)?.citations ?? []).map(quote).join("\n");
  const party = (p) => p ? `${p}` : "ohne Partei";
  const lines = [
    `# ${{ chronology: "Chronologie", facts_evidence: "Behauptungen und Beweise", source_chat: "Quellen befragen" }[run.task]}`,
    "",
    `Arbeitsentwurf, maschinell erstellt am ${run.finished ?? run.started} mit ${run.model}. Jede Zitatstelle wurde lokal gegen die Originalseite geprüft; ob sie die Aussage trägt, ist nicht geprüft.`,
    "",
  ];
  if (run.question) lines.push(`**Frage:** ${run.question}`, "");
  if (run.task === "chronology") {
    for (const row of result.rows) {
      lines.push(`- **${row.date ? text(row.date) : "ohne Datum"}** · ${party(row.party)} · ${POSTURE[row.posture]}: ${text(row.event)}`, cites(row.event).replace(/^/gm, "  "), "");
    }
  } else if (run.task === "facts_evidence") {
    for (const row of result.rows) {
      lines.push(`## ${row.id} · ${party(row.party)} · ${ASSESSMENT[row.assessment]}`, "", text(row.statement), "", cites(row.statement), "");
      for (const id of row.evidence) lines.push(`**Beweismittel:** ${text(id)}`, "", cites(id), "");
      for (const id of row.opposing) lines.push(`**Gegenposition:** ${text(id)}`, "", cites(id), "");
      lines.push(`**Begründung:** ${text(row.reasoning)}`, "", cites(row.reasoning), "");
    }
  } else {
    for (const row of result.rows) lines.push(text(row.answer), "", cites(row.answer), "");
  }
  const coverage = result.coverage;
  lines.push("---", "", `Gelesen: ${coverage.reviewed} von ${coverage.sections} Seiten.`);
  if (coverage.unread.length) lines.push(`Nicht gelesen: ${coverage.unread.map(u => `${u.label} S. ${u.page}`).join(", ")}.`);
  if (coverage.unreadable_pages.length) lines.push(`Ohne Textschicht, nicht ausgewertet: ${coverage.unreadable_pages.map(u => `${u.label} ${u.page}`).join(", ")}.`);
  lines.push("", `Prüfsumme des Ergebnisses: ${result.integrity.result_sha256}`);
  return lines.join("\n") + "\n";
}
