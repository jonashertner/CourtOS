// Renderers for the eight task results. Every claim keeps its citations; a
// claim can be taken over into the working notes.
import { citationChip, claimText, h, icon, label, parseDate, partyLabel, pg, tr } from "./shared.js";

export function renderResult(run, ctx) {
  const result = run.result;
  const claims = new Map(result.claims.map(c => [c.id, c]));
  const claim = (id, opts = {}) => {
    const c = claims.get(id);
    if (!c) return null;
    const bySection = new Map();
    for (const x of c.citations) bySection.set(x.section_id, [...(bySection.get(x.section_id) ?? []), x]);
    const chips = [...bySection.values()].map(group => citationChip({ ...group[0], match: group.every(x => x.match === "exact") ? "exact" : "unverified", group }, ctx.openCitation));
    const notes = (c.context ?? []).map(x => citationChip(x, ctx.openCitation));
    return h("span.claim", {},
      claimText(c.display),
      h("span.cites", {}, chips, notes),
      opts.noNote ? null : h("button.note-add", { type: "button", title: tr("Als Notiz übernehmen"), "aria-label": tr("Als Notiz übernehmen"), onclick: () => ctx.addNote(c, run) }, icon("note")));
  };
  const party = (p) => partyLabel(ctx.state, p);
  let body;
  switch (run.task) {
    case "chronology": {
      const rows = [...result.rows].map(row => ({ row, date: row.date ? parseDate(claims.get(row.date)?.text) : null }))
        .sort((a, b) => (a.date && b.date) ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0);
      const parties = [...new Set(result.rows.map(r => r.party).filter(Boolean))].sort();
      body = [
        h("div.legend", {}, parties.map((p, i) => h("span", { class: `p${i}` }, h("i"), party(p)))),
        h("ol.timeline", {}, rows.map(({ row }) => h("li", { class: `p${Math.max(0, parties.indexOf(row.party))}` },
          h("div.date", { class: row.date ? null : "none" }, row.date ? claims.get(row.date)?.display.text : tr("ohne Datum")),
          h("div.marker", {}, h("i")),
          h("div", {}, h("div.who", {}, h("b", {}, party(row.party)), `, ${label("posture", row.posture)}`), claim(row.event)),
        ))),
      ];
      break;
    }
    case "facts_evidence":
      body = result.rows.map(row => h("article.fact", {},
        h("div.fact-head", {},
          h("span.verdict", { class: row.assessment }, icon({ supports: "check", contradicts: "cross", inconclusive: "dash", not_found: "ring" }[row.assessment]), label("facts", row.assessment)),
          h("span", {}, `${party(row.party)}, ${label("posture", row.posture)}`)),
        claim(row.statement),
        h("div.fact-grid", {},
          h("div", {}, h("h3", {}, tr("Beweismittel")), row.evidence.length ? row.evidence.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keines im ausgewerteten Material"))),
          h("div", {}, h("h3", {}, tr("Andere Partei")), row.opposing.length ? row.opposing.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keine Stellungnahme im ausgewerteten Material"))),
          h("div", {}, h("h3", {}, tr("Würdigung")), h("p", {}, claim(row.reasoning)))),
      ));
      break;
    case "party_comparison": {
      const parties = [...new Set(result.rows.flatMap(r => r.positions.map(p => p.party)).filter(Boolean))].sort();
      const groups = ["relief", "fact", "legal"].map(cat => [cat, result.rows.filter(r => r.category === cat)]).filter(([, rows]) => rows.length);
      body = groups.map(([cat, rows]) => h("section.compare", {},
        h("h3.group-title", {}, label("category", cat)),
        h("div.compare-table", { style: { "--cols": String(parties.length) } },
          h("div.compare-row.head", {}, parties.map(p => h("div", {}, party(p))), h("div", {}, tr("Einordnung"))),
          rows.map(row => h("div.compare-row", {},
            parties.map(p => {
              const positions = row.positions.filter(x => x.party === p);
              return h("div.cell", {}, positions.length ? positions.map(x => h("p", {}, h("span.posture", {}, label("posture", x.posture)), claim(x.claim))) : h("p.empty", {}, tr("Keine Position in der Auswahl")));
            }),
            h("div.cell.analysis", {}, claim(row.analysis)))))));
      break;
    }
    case "legal_claims":
      body = result.rows.map(row => h("article.fact", {},
        h("div.fact-head", {},
          h("span.verdict", { class: { supports: "supports", contrary: "contradicts", insufficient: "inconclusive", not_found_in_selected_sources: "not_found", manual_check_required: "manual" }[row.assessment] },
            icon({ supports: "check", contrary: "cross", insufficient: "dash", not_found_in_selected_sources: "ring", manual_check_required: "eye" }[row.assessment]), label("legal", row.assessment)),
          h("span", {}, party(row.party))),
        claim(row.statement),
        h("div.fact-grid", {},
          h("div", {}, h("h3", {}, tr("Rechtsprechung und Literatur")), row.authorities.length ? row.authorities.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keine in der Auswahl"))),
          h("div", {}, h("h3", {}, tr("Würdigung")), h("p", {}, claim(row.reasoning))),
          h("div", {}, h("h3", {}, tr("Selbst prüfen")), row.manual_source ? h("p", {}, claim(row.manual_source)) : h("p.empty", {}, "–"))),
      ));
      break;
    case "decision_draft": {
      const order = ["facts", "issue", "reasoning", "counterargument", "open_issue", "disposition"];
      body = h("div.draft-doc", {}, order.map(part => {
        const rows = result.rows.filter(r => r.part === part);
        if (!rows.length) return null;
        const list = part === "disposition" ? "ol" : "div";
        return h("section", {}, h("h3", {}, label("part", part)),
          h(list, {}, rows.map(row => h(part === "disposition" ? "li" : "p", {}, row.status !== "analysis" && row.status !== "proposal" ? h("span.posture", {}, label("draftStatus", row.status)) : null, claim(row.claim)))));
      }));
      break;
    }
    case "fundamental_questions":
      body = result.rows.map(row => h("article.question", {},
        h("h3.q", {}, claim(row.question)),
        h("div.q-body", {},
          h("div", {}, h("h4", {}, tr("Analyse")), h("p", {}, claim(row.analysis))),
          h("div", {}, h("h4", {}, tr("Gegenargumente")), row.contrary.length ? row.contrary.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keine in der Auswahl"))))));
      break;
    case "hypothetical_impact":
      body = result.rows.map(row => h("article.fact", {},
        h("div.fact-grid", {},
          h("div", {}, h("h3", {}, tr("Ausgangslage")), h("p", {}, claim(row.baseline))),
          h("div", {}, h("h3", {}, tr("Unter der Annahme (hypothetisch)")), h("p", {}, claim(row.analysis))),
          h("div", {}, h("h3", {}, tr("Grenzen")), row.limitations.map(id => h("p", {}, claim(id))))),
      ));
      break;
    default:
      body = h("div.answer", {}, result.rows.map(row => h("p", {}, claim(row.answer))));
  }
  const cov = result.coverage;
  const total = result.claims.length, verified = result.claims.filter(c => c.citations.every(x => x.match === "exact")).length;
  return h("div.result", {},
    h("p.draft-note", {}, tr("Arbeitsentwurf. {v} von {t} Aussagen sind wörtlich an ihren Quellen geprüft; ob eine Stelle die Aussage trägt, prüfen Sie. Grün unterstrichene Namen hat CourtOS lokal wiederhergestellt.", { v: verified, t: total })),
    body,
    h("div.coverage", {},
      h("span", {}, tr("Gelesen: {r} von {s} Aktenseiten.", { r: cov.reviewed, s: cov.sections })),
      cov.authorities_read?.length ? h("span", {}, tr("Entscheide gelesen: {l}.", { l: cov.authorities_read.map(a => a.docket ?? a.decision_id).join(", ") })) : null,
      cov.unread.length ? h("span", {}, tr("Nicht gelesen: {l}.", { l: cov.unread.map(u => pg(`${u.label} S. ${u.page}`)).join(", ") })) : null,
      cov.unreadable_pages.length ? h("span.alert", {}, tr("Ohne Text, nicht ausgewertet: {l}.", { l: cov.unreadable_pages.map(u => `${u.label} ${u.page}`).join(", ") })) : null,
      cov.more_claims_reported ? h("span.alert", {}, tr("Claude meldet, nicht alle Aussagen erfasst zu haben.")) : null,
    ),
  );
}
