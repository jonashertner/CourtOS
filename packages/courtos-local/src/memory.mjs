// The case memory: what earlier runs established, kept on this computer so the
// work can continue with any model. Only findings whose every quotation was
// verified against a page that is still unchanged are kept; the judge's adopted
// and disputed notes come with them. A model reads the memory only as a
// snapshot taken at release: the approval names the snapshot's hash, and the
// snapshot is pseudonymised with the register of that release and checked by
// the outbound guard line by line. A line the guard objects to is withheld.
// The memory is a map to the sources, never evidence: it is not a section, so
// nothing in it can be cited or quoted.
import { sha256 } from "./util.mjs";

// The claim a row stands on; a row whose primary claim is not verified is an
// open point, not a finding.
const PRIMARY = {
  chronology: "event", facts_evidence: "statement", party_comparison: "positions", legal_claims: "statement",
  decision_draft: "claim", fundamental_questions: "question", source_chat: "answer",
};
// Order in which earlier results are offered when a run's memory budget is short.
const ORDER = ["facts_evidence", "chronology", "party_comparison", "legal_claims", "fundamental_questions", "decision_draft", "source_chat"];
const SKIP = new Set(["id", "target_id", "assumption_id", "date"]);
const ATTRS = ["category", "part", "status", "posture", "assessment"];
const CHATS = 6;
export const MEMORY_PROMPT_CHARS = 40_000;

const FIELD_DE = {
  event: "", statement: "", claim: "", answer: "", question: "", evidence: "Beweismittel", opposing: "Gegenposition",
  reasoning: "Würdigung", analysis: "Einordnung", contrary: "Gegenargument", authorities: "Rechtsprechung und Literatur",
  manual_source: "Selbst prüfen", positions: "Position", baseline: "Ausgangslage", limitations: "Grenze",
};
const TITLE_DE = {
  chronology: "Chronologie", facts_evidence: "Behauptungen und Beweise", party_comparison: "Positionen vergleichen",
  legal_claims: "Rechtsargumente prüfen", decision_draft: "Würdigung und weiteres Vorgehen", fundamental_questions: "Grundfragen",
  source_chat: "Quellen befragen",
};
const VALUE_DE = {
  allegation: "Behauptung", denial: "Bestreitung", disputed: "strittig", unresolved: "offen", undisputed: "unbestritten",
  supports: "gestützt", contradicts: "widersprochen", inconclusive: "nicht schlüssig", not_found: "kein Beweismittel gefunden",
  contrary: "entgegenstehend", insufficient: "ungenügend", not_found_in_selected_sources: "nicht in der Auswahl", manual_check_required: "selbst prüfen",
  relief: "Rechtsbegehren", fact: "Sachverhalt", legal: "Recht", facts: "Sachverhalt", issue: "Frage", counterargument: "Gegenargument",
  open_issue: "offener Punkt", disposition: "Vorschlag Dispositiv", alleged: "behauptet", working_assumption: "Arbeitsannahme",
  analysis: "Analyse", proposal: "Vorschlag", adopted: "übernommen", proposed: "vorgeschlagen", done: "erledigt",
};

/** Is this bound citation still exactly what was checked? */
function fresh(store, citation) {
  if (citation.match !== "exact") return false;
  if (citation.kind === "authority") return true;
  if (citation.kind === "note") return store.notes.some(n => n.id === citation.note);
  if (!citation.document || !citation.page) return false;
  if (!store.mirror?.documents.some(d => d.id === citation.document && d.pages.some(p => p.n === citation.page && p.section))) return false;
  try { return store.originalPage(citation.document, citation.page).sha256 === citation.page_sha256; } catch { return false; }
}

/** Where a citation points in the current mirror, for the next model and for the reader. */
function pointer(store, citation) {
  if (citation.kind === "authority") return { authority: citation.label, decision_id: citation.decision_id ?? null, page_label: citation.page_label };
  if (citation.kind === "note") return null;
  const section = store.mirror?.documents.find(d => d.id === citation.document)?.pages.find(p => p.n === citation.page)?.section ?? null;
  return { document: citation.document, label: citation.label, page: citation.page, page_label: citation.page_label, section, quote: citation.quote_original ?? null };
}

const claimIds = (value, claims) => typeof value === "string" && claims.has(value) ? [value] : Array.isArray(value) ? value.filter(v => typeof v === "string" && claims.has(v)) : [];

function rowItems(row, claims) {
  const items = [];
  for (const [field, value] of Object.entries(row)) {
    if (SKIP.has(field)) continue;
    if (field === "positions" && Array.isArray(value)) {
      for (const position of value) if (claims.has(position.claim)) items.push({ field, claim: position.claim, party: position.party ?? null, posture: position.posture ?? null });
      continue;
    }
    for (const id of claimIds(value, claims)) items.push({ field, claim: id });
  }
  return items;
}

/**
 * Collect the memory from the runs on this computer: for each task its latest
 * successful run (the last few questions to the sources), the judge's adopted
 * and disputed notes, and the open points. Texts carry real names: this is the
 * local view. `memorySnapshot` makes the version a model may read.
 */
export function collectMemory(store, runs) {
  const done = runs.filter(r => r.status === "succeeded" && r.result?.claims && PRIMARY[r.task])
    .sort((a, b) => String(b.finished ?? b.started).localeCompare(String(a.finished ?? a.started)));
  const chosen = [];
  for (const task of ORDER) {
    const own = done.filter(r => r.task === task);
    chosen.push(...(task === "source_chat" ? own.slice(0, CHATS) : own.slice(0, 1)));
  }
  const parties = new Map(store.partiesView().map(p => [p.id, p]));
  const groups = chosen.map(run => {
    const claims = new Map(run.result.claims.map(c => [c.id, c]));
    const state = (id) => {
      const claim = claims.get(id);
      const all = [...claim.citations, ...(claim.context ?? [])];
      if (all.some(c => c.match !== "exact")) return "unverified";
      return all.every(c => fresh(store, c)) ? "ok" : "stale";
    };
    const rows = [], open = [];
    let unverified = 0, stale = 0;
    const stalePages = new Set();
    for (const row of run.result.rows) {
      const items = rowItems(row, claims);
      const primary = items.filter(i => i.field === PRIMARY[run.task]);
      const kept = [];
      for (const item of items) {
        const s = state(item.claim);
        if (s === "ok") { kept.push(item); continue; }
        if (s === "unverified") unverified++; else {
          stale++;
          for (const c of claims.get(item.claim).citations) if (c.document && !fresh(store, c)) stalePages.add(`${c.label} ${c.page_label}`);
        }
        if (primary.includes(item) && s === "unverified") open.push(item);
      }
      if (!primary.some(i => kept.includes(i))) continue;
      const date = row.date && claims.has(row.date) && state(row.date) === "ok" ? claims.get(row.date).display.text : null;
      rows.push({
        party: row.party ?? null, date, attrs: Object.fromEntries(ATTRS.filter(a => typeof row[a] === "string").map(a => [a, row[a]])),
        items: kept.map(item => {
          const claim = claims.get(item.claim);
          return { field: item.field, party: item.party ?? null, posture: item.posture ?? null, text: claim.display.text, sources: claim.citations.map(c => pointer(store, c)).filter(Boolean) };
        }),
      });
    }
    return {
      task: run.task, run: run.id, model: run.model, endpoint: run.endpoint ?? null, finished: run.finished ?? run.started, question: run.task === "source_chat" ? run.question : null,
      rows, findings: rows.reduce((n, r) => n + r.items.length, 0), unverified, stale, stale_pages: [...stalePages],
      open: open.map(item => {
        const claim = claims.get(item.claim);
        return { text: claim.display.text, sources: claim.citations.map(c => pointer(store, c)).filter(Boolean) };
      }),
      // A question reads what it needs; unread pages matter for the tasks that read the whole file.
      unread: run.task === "source_chat" ? [] : (run.result.coverage?.unread ?? []).map(u => `${u.label} S. ${u.page}`),
    };
  });
  const notes = store.notes.filter(n => ["adopted", "disputed"].includes(n.status) && n.kind !== "assumption")
    .map(n => ({ id: n.id, status: n.status, kind: n.kind, text: n.text, updated: n.updated }));
  const basis = [...groups.map(g => g.run), ...notes.map(n => `${n.id}@${n.updated}`)].sort();
  return { groups, notes, parties, basis, findings: groups.reduce((n, g) => n + g.findings, 0) };
}

// --- what a model may read --------------------------------------------------

const partyText = (parties, id) => id ? `${id}${parties.get(id)?.term ? ` (${parties.get(id).term})` : ""}` : null;
const unique = (list) => [...new Set(list)];
const where = (sources) => unique(sources.map(s => s.authority ? `${s.authority}, ${s.page_label} (read_decision ${s.decision_id ?? s.authority})` : `${s.section ?? "?"} ${s.label} ${s.page_label}`)).join("; ");

/** The model-facing lines of one group, with real names (pseudonymised later, line by line). */
function groupLines(group, parties, next) {
  const head = `## Earlier ${group.task} run ${group.run} · model ${group.model}${group.endpoint ? ` at ${group.endpoint}` : ""} · ${String(group.finished).slice(0, 10)}`;
  const lines = [];
  if (group.question) lines.push(`Question asked: ${group.question}`);
  for (const row of group.rows) {
    const attrs = [partyText(parties, row.party), ...Object.values(row.attrs)].filter(Boolean).join(" · ");
    for (const item of row.items) {
      const label = item.field === PRIMARY[group.task] ? "" : `${item.field}: `;
      const who = item.party ? `${partyText(parties, item.party)}${item.posture ? ` · ${item.posture}` : ""} · ` : "";
      lines.push(`${next()}. ${attrs && item === row.items[0] ? `[${attrs}] ` : ""}${row.date && item === row.items[0] ? `${row.date}: ` : ""}${label}${who}${item.text} (pages: ${where(item.sources) || "none"})`);
    }
  }
  return { head, lines };
}

function openLines(groups) {
  const lines = [];
  for (const group of groups) {
    for (const item of group.open.slice(0, 12)) lines.push(`- Not verified in the earlier ${group.task} run; check before relying on it: ${item.text} (attempted pages: ${where(item.sources) || "none"})`);
    if (group.unread.length) lines.push(`- The earlier ${group.task} run did not read: ${group.unread.slice(0, 40).join(", ")}.`);
    if (group.stale_pages.length) lines.push(`- Findings of the earlier ${group.task} run citing pages that changed since were dropped: ${group.stale_pages.join(", ")}.`);
  }
  return lines;
}

/** Canonical hash of a snapshot: what the release names. */
export function memorySha(snapshot) {
  const { version, mirror_sha256, register_rev, basis, groups } = snapshot;
  return sha256(JSON.stringify({ version, mirror_sha256, register_rev, basis, groups }));
}

/**
 * The pseudonymised memory a model may read after release. Each line is
 * pseudonymised with the current register and must pass the outbound guard;
 * otherwise it is withheld. Returns null when there is nothing to carry.
 */
export function memorySnapshot(store, memory) {
  const guard = store.guard();
  let withheld = 0, n = 0;
  const safe = (line) => {
    try {
      const out = store.pseudonymise(line);
      if (guard.scan(out).length) { withheld++; return null; }
      return out;
    } catch { withheld++; return null; }
  };
  const groups = [];
  for (const group of memory.groups) {
    const { head, lines } = groupLines(group, memory.parties, () => `M${++n}`);
    const kept = lines.map(safe).filter(Boolean);
    const header = safe(head);
    if (!header || !kept.some(l => /^M\d+\./.test(l))) continue;
    groups.push({ key: group.run, task: group.task, model: group.model, findings: kept.filter(l => /^M\d+\./.test(l)).length, text: [header, ...kept].join("\n") });
  }
  if (memory.notes.length) {
    const kept = memory.notes.map(note => safe(`${note.id} (${note.status}${note.kind !== "note" ? `, ${note.kind}` : ""}): ${note.text.replace(/\s+/g, " ")}`)).filter(Boolean);
    if (kept.length) groups.push({ key: "notes", task: null, model: null, findings: 0, notes: kept.length, text: ["## The judge's working notes (the judge's view; context, not evidence)", ...kept].join("\n") });
  }
  const open = openLines(memory.groups).map(safe).filter(Boolean);
  if (open.length) groups.push({ key: "open", task: null, model: null, findings: 0, text: ["## Open points from earlier runs", ...open].join("\n") });
  if (!groups.some(g => g.findings || g.notes)) return null;
  const snapshot = { version: 1, created: new Date().toISOString(), mirror_sha256: store.mirror.sha256, register_rev: store.register.rev, basis: memory.basis, groups, withheld };
  return { ...snapshot, sha256: memorySha(snapshot) };
}

/**
 * The memory block for one run's opening message: the judge's notes, the same
 * task's earlier result, the other results in a fixed order, the open points,
 * within a character budget. Every line comes verbatim from the approved snapshot.
 */
export function memoryPrompt(snapshot, task, budget = MEMORY_PROMPT_CHARS) {
  if (!snapshot?.groups.length) return null;
  const rank = (g) => g.key === "notes" ? 0 : g.task === task ? 1 : g.key === "open" ? 99 : 2 + ORDER.indexOf(g.task);
  const ordered = [...snapshot.groups].sort((a, b) => rank(a) - rank(b));
  const intro = "Case memory: findings from earlier work on this folder, possibly by another model, with the pages they rest on (S-numbers of this release). Each quotation behind a finding was checked against its page; whether the page carries the finding was not. Use the memory as a map: to find the relevant pages fast, to keep distinctions already drawn, and to take up the open points. It is not evidence and not a section: never cite or quote it. Read every page you rely on and quote the page itself; the reading requirements of the task still apply. Where the sources say something else than a finding, follow the sources and say so.";
  let out = intro, used = [], left = 0;
  for (const group of ordered) {
    const lines = group.text.split("\n");
    if (out.length + lines[0].length + 200 > budget) { left += group.findings; continue; }
    let block = lines[0], sent = 0;
    for (const line of lines.slice(1)) {
      if (out.length + block.length + line.length + 2 > budget) { if (/^M\d+\./.test(line)) left++; continue; }
      block += `\n${line}`;
      if (/^M\d+\./.test(line)) sent++;
    }
    out += `\n\n${block}`;
    used.push({ key: group.key, findings: sent });
  }
  if (left) out += `\n\n(${left} further findings are not shown here for length.)`;
  return { text: out, groups: used, findings: used.reduce((n, g) => n + g.findings, 0) };
}

// --- readable local copy ----------------------------------------------------

const de = (v) => VALUE_DE[v] ?? v;
const partyDe = (parties, id) => {
  const p = parties.get(id);
  return p ? (p.term && p.name ? `${p.term} (${p.name})` : p.term || p.name || id) : id;
};
const refDe = (sources) => [...new Set(sources.map(s => s.authority ? `${s.authority}, ${s.page_label}` : `${s.label}, ${s.page_label}`))].join("; ");

/** The memory as Markdown, with real names: for the judge, on this computer only. */
export function memoryMarkdown(memory, store, released = null) {
  const out = [
    "# Fallgedächtnis",
    "",
    "Was frühere Läufe an diesem Fall erarbeitet haben, mit den Aktenstellen. Aufgenommen sind nur Aussagen, deren Zitate wörtlich an der Seite geprüft sind und deren Seiten sich seither nicht geändert haben; ob eine Stelle die Aussage trägt, prüfen Sie. Ein Modell liest das Gedächtnis nur, wenn Sie es mit einer Freigabe mitgeben, und dann pseudonymisiert.",
    "",
    released ? `Mitgegeben mit der aktuellen Freigabe: Stand ${String(released.created).slice(0, 16).replace("T", " ")}, Prüfsumme ${released.sha256.slice(0, 12)}.` : "Mit der aktuellen Freigabe wird kein Gedächtnis mitgegeben.",
    "",
  ];
  for (const group of memory.groups) {
    out.push(`## ${TITLE_DE[group.task] ?? group.task}`, "", `Lauf ${group.run} · ${group.model}${group.endpoint ? ` (${group.endpoint})` : ""} · ${String(group.finished).slice(0, 16).replace("T", " ")}`, "");
    if (group.question) out.push(`**Frage:** ${group.question}`, "");
    for (const row of group.rows) {
      const attrs = [row.party ? partyDe(memory.parties, row.party) : null, ...Object.values(row.attrs).map(de)].filter(Boolean).join(" · ");
      out.push(`- ${row.date ? `**${row.date}** · ` : ""}${attrs ? `${attrs}: ` : ""}${row.items[0].text}${row.items[0].sources.length ? ` (${refDe(row.items[0].sources)})` : ""}`);
      for (const item of row.items.slice(1)) {
        const field = FIELD_DE[item.field] ?? item.field;
        const who = item.party ? `${partyDe(memory.parties, item.party)}${item.posture ? `, ${de(item.posture)}` : ""}: ` : "";
        out.push(`  - ${field ? `${field}: ` : ""}${who}${item.text}${item.sources.length ? ` (${refDe(item.sources)})` : ""}`);
      }
    }
    const dropped = [group.unverified ? `${group.unverified} nicht verifiziert` : null, group.stale ? `${group.stale} mit seither geänderten Seiten` : null].filter(Boolean);
    if (dropped.length) out.push("", `Nicht aufgenommen: ${dropped.join(", ")}.`);
    out.push("");
  }
  if (memory.notes.length) {
    out.push("## Ihre Notizen", "");
    for (const note of memory.notes) out.push(`- ${note.id} (${de(note.status)}): ${note.text.replace(/\s+/g, " ")}`);
    out.push("");
  }
  const open = [];
  for (const group of memory.groups) {
    for (const item of group.open) open.push(`- Prüfen (${TITLE_DE[group.task]}): ${item.text}${item.sources.length ? ` (${refDe(item.sources)})` : ""}`);
    if (group.unread.length) open.push(`- ${TITLE_DE[group.task]}: nicht gelesen ${group.unread.join(", ")}.`);
    if (group.stale_pages.length) open.push(`- ${TITLE_DE[group.task]}: seither geändert ${group.stale_pages.join(", ")}.`);
  }
  if (open.length) out.push("## Offene Punkte", "", ...open, "");
  if (!memory.groups.length && !memory.notes.length) out.push("Noch nichts gespeichert. Das Gedächtnis füllt sich mit jedem erfolgreichen Lauf.", "");
  return out.join("\n");
}
