// Renderers for the eight task results. Every claim keeps its citations; a
// claim can be taken over into the working notes.
import { citationChip, claimText, h, icon, label, parseDate, partyLabel, pg, tr, trn } from "./shared.js";

export function renderResult(run, ctx) {
  const result = run.result;
  const claims = new Map(result.claims.map(c => [c.id, c]));
  // Cited pages whose text is no longer the text that was checked.
  const changed = new Set((run.freshness?.changed ?? []).flatMap(x => x.pages.map(n => `${x.document}:${n}`)));
  const claim = (id, opts = {}) => {
    const c = claims.get(id);
    if (!c) return null;
    const bySection = new Map();
    for (const x of c.citations) bySection.set(x.section_id, [...(bySection.get(x.section_id) ?? []), x]);
    const chips = [...bySection.values()].map(group => citationChip({ ...group[0], match: group.every(x => x.match === "exact") ? "exact" : "unverified", group }, ctx.openCitation, changed));
    const notes = (c.context ?? []).map(x => citationChip(x, ctx.openCitation, changed));
    // A quotation that failed even after Claude's one correction: the claim is not verified.
    const review = [...c.citations, ...(c.context ?? [])].some(x => x.match !== "exact");
    return h("span.claim", { class: review ? "needs-review" : null },
      review ? h("span.review-mark", { title: tr("Mindestens ein Zitat ist nicht an der Quelle verifiziert. Prüfen Sie die Aussage an der Akte.") }, tr("prüfen")) : null,
      claimText(c.display),
      h("span.cites", {}, chips, notes),
      opts.noNote ? null : h("button.note-add", { type: "button", title: tr("Als Notiz übernehmen"), "aria-label": tr("Als Notiz übernehmen"), onclick: () => ctx.addNote(c, run) }, icon("note")),
      ctx.toWord && !review ? h("button.note-add", { type: "button", title: tr("In Word einfügen"), "aria-label": tr("In Word einfügen"), onclick: () => ctx.toWord(c, run) }, icon("insert")) : null);
  };
  const party = (p) => partyLabel(ctx.state, p);
  // The party's name with its colour (P1 blue, P2 orange), the same in every view.
  const partyName = (p) => h("span.party-name", { class: partyClass(p) }, h("i", { "aria-hidden": "true" }), party(p));
  let body;
  switch (run.task) {
    case "chronology": {
      const rows = [...result.rows].map(row => ({ row, date: row.date ? parseDate(claims.get(row.date)?.text) : null }))
        .sort((a, b) => (a.date && b.date) ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0);
      const parties = [...new Set(result.rows.map(r => r.party).filter(Boolean))].sort();
      body = [
        h("div.legend", {}, parties.map(p => partyName(p))),
        h("ol.timeline", {}, rows.map(({ row }) => h("li", { class: partyClass(row.party) },
          h("div.date", { class: row.date ? null : "none" }, row.date ? claims.get(row.date)?.display.text : tr("ohne Datum")),
          h("div.marker", {}, h("i")),
          h("div", {}, h("div.who", {}, h("b", {}, party(row.party)), ", ", h("span.posture", { class: row.posture }, label("posture", row.posture))), claim(row.event)),
        ))),
      ];
      break;
    }
    case "facts_evidence":
      body = [filterBar(FACT_ORDER.map(a => ({ key: a, text: label("facts", a), tone: a })), result.rows.map(r => r.assessment)),
        result.rows.map(row => h("article.fact", { dataset: { filter: row.assessment } },
        h("div.fact-head", {},
          h("span.verdict", { class: row.assessment }, icon({ supports: "check", contradicts: "cross", inconclusive: "dash", not_found: "ring" }[row.assessment]), label("facts", row.assessment)),
          h("span", {}, partyName(row.party), ", ", h("span.posture", { class: row.posture }, label("posture", row.posture)))),
        claim(row.statement),
        h("div.fact-grid", {},
          h("div", {}, h("h3", {}, tr("Beweismittel")), row.evidence.length ? row.evidence.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keines im ausgewerteten Material"))),
          h("div", {}, h("h3", {}, tr("Andere Partei")), row.opposing.length ? row.opposing.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keine Stellungnahme im ausgewerteten Material"))),
          h("div", {}, h("h3", {}, tr("Würdigung")), h("p", {}, claim(row.reasoning)))),
      ))];
      break;
    case "party_comparison": {
      const parties = [...new Set(result.rows.flatMap(r => r.positions.map(p => p.party)).filter(Boolean))].sort();
      const status = new Map(result.rows.map(r => [r, comparisonStatus(r)]));
      const groups = ["relief", "fact", "legal"].map(cat => [cat, result.rows.filter(r => r.category === cat)]).filter(([, rows]) => rows.length);
      body = [filterBar(STATUS_ORDER.map(k => ({ key: k, text: label("compareStatus", k), tone: k })), result.rows.map(r => status.get(r))),
        groups.map(([cat, rows]) => h("section.compare", {},
        h("h3.group-title", {}, h("span.group-name", {}, label("category", cat)),
          h("span.group-count", {}, trn(rows.length, "{n} Punkt", "{n} Punkte"),
            STATUS_ORDER.map(k => [k, rows.filter(r => status.get(r) === k).length]).filter(([, n]) => n)
              .map(([k, n]) => [" · ", h("span", { class: `tone ${k}` }, `${n} ${label("compareStatus", k)}`)]))),
        h("div.compare-table", { style: { "--cols": String(parties.length) }, dataset: { cols: String(Math.min(parties.length, 6)) } },
          h("div.compare-row.head", {}, parties.map(p => h("div", { class: partyClass(p) }, partyName(p))), h("div.analysis-head", {}, tr("Einordnung"))),
          rows.map(row => h("div.compare-row", { dataset: { filter: status.get(row) } },
            parties.map(p => {
              const positions = row.positions.filter(x => x.party === p);
              return h("div.cell", { class: partyClass(p) }, h("span.cell-party", {}, partyName(p)),
                positions.length ? positions.map(x => h("p", {}, h("span.posture", { class: x.posture }, label("posture", x.posture)), claim(x.claim))) : h("p.empty", {}, tr("Keine Position in der Auswahl")));
            }),
            h("div.cell.analysis", {}, h("span.row-status", { class: `tone ${status.get(row)}` }, label("compareStatus", status.get(row))), claim(row.analysis)))))))];
      break;
    }
    case "legal_claims":
      body = [filterBar(LEGAL_ORDER.map(a => ({ key: a, text: label("legal", a), tone: a })), result.rows.map(r => r.assessment)),
        result.rows.map(row => h("article.fact", { dataset: { filter: row.assessment } },
        h("div.fact-head", {},
          h("span.verdict", { class: { supports: "supports", contrary: "contradicts", insufficient: "inconclusive", not_found_in_selected_sources: "not_found", manual_check_required: "manual" }[row.assessment] },
            icon({ supports: "check", contrary: "cross", insufficient: "dash", not_found_in_selected_sources: "ring", manual_check_required: "eye" }[row.assessment]), label("legal", row.assessment)),
          partyName(row.party)),
        claim(row.statement),
        h("div.fact-grid", {},
          h("div", {}, h("h3", {}, tr("Rechtsprechung und Literatur")), row.authorities.length ? row.authorities.map(id => h("p", {}, claim(id))) : h("p.empty", {}, tr("Keine in der Auswahl"))),
          h("div", {}, h("h3", {}, tr("Würdigung")), h("p", {}, claim(row.reasoning))),
          h("div", {}, h("h3", {}, tr("Selbst prüfen")), row.manual_source ? h("p", {}, claim(row.manual_source)) : h("p.empty", {}, "–"))),
      ))];
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
  const total = result.claims.length, verified = result.claims.filter(c => [...c.citations, ...(c.context ?? [])].every(x => x.match === "exact")).length;
  const firstReview = (e) => e.target.closest(".result")?.querySelector(".claim.needs-review")?.scrollIntoView({ behavior: "smooth", block: "center" });
  return h("div.result", {},
    h("p.draft-note", {}, tr("Arbeitsentwurf. {v} von {t} Aussagen sind wörtlich an ihren Quellen geprüft; ob eine Stelle die Aussage trägt, prüfen Sie. Grün unterstrichene Namen hat CourtOS lokal wiederhergestellt.", { v: verified, t: total })),
    verified < total ? h("p.review-note", {}, trn(total - verified, "{n} Aussage ist nicht an der Quelle verifiziert und mit «prüfen» markiert.", "{n} Aussagen sind nicht an der Quelle verifiziert und mit «prüfen» markiert."), " ", h("button.link", { type: "button", onclick: firstReview }, tr("Zur ersten"))) : null,
    body,
    h("div.coverage", {},
      h("span", {}, tr("Gelesen: {r} von {s} Aktenseiten.", { r: cov.reviewed, s: cov.sections })),
      cov.authorities_read?.length ? h("span", {}, tr("Entscheide gelesen: {l}.", { l: cov.authorities_read.map(a => a.docket ?? a.decision_id).join(", ") })) : null,
      cov.unread.length ? h("span", {}, tr("Nicht gelesen: {l}.", { l: cov.unread.map(u => pg(`${u.label} S. ${u.page}`)).join(", ") })) : null,
      cov.unreadable_pages.length ? h("span.alert", {}, tr("Ohne Text, nicht ausgewertet: {l}.", { l: cov.unreadable_pages.map(u => `${u.label} ${u.page}`).join(", ") })) : null,
      cov.more_claims_reported ? h("span.alert", {}, tr("Das Modell meldet, nicht alle Aussagen erfasst zu haben.")) : null,
    ),
  );
}

const FACT_ORDER = ["contradicts", "inconclusive", "not_found", "supports"];
const LEGAL_ORDER = ["contrary", "insufficient", "not_found_in_selected_sources", "manual_check_required", "supports"];
const STATUS_ORDER = ["disputed", "one_sided", "open", "both"];

/** P1 and P2 have their own colour; any other or missing party stays neutral. */
export const partyClass = (p) => (/^P[1-5]$/.test(p ?? "") ? `pty ${p}` : "pty");

/**
 * Where a point of the comparison stands, read off the parties' postures only:
 * a denial or a posture marked disputed makes it disputed; a point only one
 * party addresses is one-sided; otherwise it is open or set out by both.
 * "Both" is not agreement: each party may tell it differently.
 */
export function comparisonStatus(row) {
  const postures = row.positions.map(p => p.posture);
  if (postures.some(p => p === "denial" || p === "disputed")) return "disputed";
  if (new Set(row.positions.map(p => p.party).filter(Boolean)).size < 2) return "one_sided";
  if (postures.includes("unresolved")) return "open";
  return "both";
}

/** Counts per value, in the given order, leaving out values that do not occur. */
export function tally(values, order) {
  return order.map(key => ({ key, count: values.filter(v => v === key).length })).filter(x => x.count);
}

/**
 * The overview above a result: how many rows fall under each value, each a
 * button that shows only those rows. Nothing to choose between, no bar.
 */
function filterBar(items, values) {
  const counts = new Map(tally(values, items.map(i => i.key)).map(x => [x.key, x.count]));
  const shown = items.filter(i => counts.has(i.key));
  if (shown.length < 2) return null;
  let bar;
  const choose = (key) => {
    for (const b of bar.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.key === (key ?? "")));
    const result = bar.closest(".result");
    for (const row of result.querySelectorAll("[data-filter]")) row.hidden = Boolean(key) && row.dataset.filter !== key;
    for (const group of result.querySelectorAll("section.compare")) group.hidden = !group.querySelector("[data-filter]:not([hidden])");
  };
  const button = (key, text, count, tone) => h("button", { type: "button", class: tone ? `tone ${tone}` : null, dataset: { key: key ?? "" }, "aria-pressed": String(!key), onclick: () => choose(key) },
    tone ? h("i", { "aria-hidden": "true" }) : null, text, " ", h("b", {}, String(count)));
  bar = h("div.tally", { role: "group", "aria-label": tr("Übersicht, nach Einordnung filtern") },
    button(null, tr("Alle anzeigen"), values.length), shown.map(i => button(i.key, i.text, counts.get(i.key), i.tone)));
  return bar;
}
