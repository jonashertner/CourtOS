// CourtOS in Word. The draft stays in Word; CourtOS reads only what you ask it
// to (a selection, or the paragraphs for a citation check) and inserts only
// what you choose, at the cursor.
import { api, ApiError, claimPlain, claimText, errorText, events, formatDate, h, icon, label, LANG, LANGUAGES, parseDate, partyLabel, refsPlain, setLang, tr, traceText, trn, refLabel, inLanguage } from "./shared.js";

const pane = document.getElementById("pane");
const S = { st: null, tab: "evidence", selection: "", run: null, latest: new Map(), office: false, citecheck: null, citecheckBusy: false };

const inOffice = () => S.office && typeof Word !== "undefined";
const toast = (message, bad = false) => {
  const el = h("div.toast", { class: bad ? "bad" : null }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), 4500);
};

async function attempt(fn) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError && error.code === "not_paired") return renderPairing();
    toast(errorText(error.code ?? "internal_error"), true);
  }
}

// --- Word host operations -------------------------------------------------------
async function readSelection() {
  if (!inOffice()) return window.getSelection()?.toString() ?? "";
  return Word.run(async (context) => {
    const range = context.document.getSelection();
    range.load("text");
    await context.sync();
    return range.text ?? "";
  });
}

async function readParagraphs() {
  if (!inOffice()) return [];
  return Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items/text");
    await context.sync();
    return paragraphs.items.map(p => p.text);
  });
}

async function selectInDocument(paragraph, written) {
  if (!inOffice()) return;
  await Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs;
    paragraphs.load("items");
    await context.sync();
    const target = paragraphs.items[paragraph];
    if (!target) return;
    const hits = target.search(written.slice(0, 250), { matchCase: true });
    hits.load("items");
    await context.sync();
    (hits.items[0] ?? target).select();
    await context.sync();
  });
}

const footnotes = () => inOffice() && Office.context.requirements.isSetSupported("WordApi", "1.5");

/** Pinpoint reference after the selection; a footnote with the quotation where Word supports it. */
async function insertReference(citation) {
  const where = refLabel(citation);
  const quote = (citation.quote_original ?? "").replace(/\s+/g, " ").trim();
  if (!inOffice()) { await navigator.clipboard?.writeText(`${where}: «${quote}»`); return toast(tr("In die Zwischenablage kopiert.")); }
  await Word.run(async (context) => {
    const end = context.document.getSelection().getRange("End");
    if (footnotes()) end.insertFootnote(`${where}: «${quote}»`);
    else end.insertText(` (${where})`, "After");
    await context.sync();
  });
  toast(footnotes() ? tr("Fussnote eingefügt: {w}", { w: where }) : tr("Fundstelle eingefügt: {w}", { w: where }));
}

async function insertTable(header, rows) {
  if (!inOffice()) {
    await navigator.clipboard?.writeText([header, ...rows].map(r => r.join("\t")).join("\n"));
    return toast(tr("Tabelle in die Zwischenablage kopiert."));
  }
  await Word.run(async (context) => {
    const range = context.document.getSelection().getRange("End");
    const table = range.insertTable(rows.length + 1, header.length, "After", [header, ...rows]);
    table.headerRowCount = 1;
    table.styleBuiltIn = "GridTable1Light";
    await context.sync();
  });
  toast(tr("Tabelle eingefügt."));
}

/** Paragraphs with headings; each claim's references become footnotes (or parentheses). */
async function insertStructured(blocks) {
  if (!inOffice()) {
    await navigator.clipboard?.writeText(blocks.map(b => b.heading ? `\n${b.heading}\n` : `${b.text}${b.refs ? ` (${b.refs})` : ""}`).join("\n"));
    return toast(tr("In die Zwischenablage kopiert."));
  }
  await Word.run(async (context) => {
    let anchor = context.document.getSelection().getRange("End");
    for (const block of blocks) {
      const paragraph = anchor.insertParagraph(block.heading ?? block.text, "After");
      paragraph.styleBuiltIn = block.heading ? Word.BuiltInStyleName?.heading3 ?? "Heading3" : Word.BuiltInStyleName?.normal ?? "Normal";
      if (!block.heading && block.refs) {
        const end = paragraph.getRange("End");
        if (footnotes()) end.insertFootnote(block.refs); else end.insertText(` (${block.refs})`, "Before");
      }
      anchor = paragraph.getRange("End");
    }
    await context.sync();
  });
  toast(tr("In das Dokument eingefügt."));
}

// --- Data ---------------------------------------------------------------------
async function refresh() {
  S.st = await api("/api/state");
  for (const run of S.st.runs ?? []) {
    if (run.status !== "succeeded" || run.task === "source_chat" || S.latest.has(run.task)) continue;
    S.latest.set(run.task, await api(`/api/runs/${run.id}`));
  }
  render();
}

const claimsOf = (run) => new Map(run.result.claims.map(c => [c.id, c]));

/** Inserted text belongs to the court's document: it is written in the language of the proceedings. */
const caseLang = () => S.st?.case?.language?.code ?? "de";

const INSERTS = {
  chronology: (run) => {
    const claims = claimsOf(run);
    const rows = run.result.rows
      .map(row => ({ row, date: row.date ? parseDate(claims.get(row.date)?.text) : null }))
      .sort((a, b) => (a.date && b.date) ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0)
      .map(({ row }) => [row.date ? claimPlain(claims.get(row.date)) : tr("ohne Datum"), `${partyLabel(S.st, row.party)}, ${label("posture", row.posture)}`, claimPlain(claims.get(row.event)), refsPlain(claims.get(row.event))]);
    return insertTable([tr("Datum"), tr("Partei"), tr("Ereignis"), tr("Fundstelle")], rows);
  },
  facts_evidence: (run) => {
    const claims = claimsOf(run);
    return insertTable([tr("Behauptung"), tr("Partei"), tr("Einschätzung"), tr("Beweismittel"), tr("Fundstellen")], run.result.rows.map(row => [
      claimPlain(claims.get(row.statement)), partyLabel(S.st, row.party), label("facts", row.assessment),
      row.evidence.map(id => claimPlain(claims.get(id))).join(" ") || "–",
      [row.statement, ...row.evidence, ...row.opposing, row.reasoning].map(id => refsPlain(claims.get(id))).filter(Boolean).join("; "),
    ]));
  },
  party_comparison: (run) => {
    const claims = claimsOf(run);
    const parties = [...new Set(run.result.rows.flatMap(r => r.positions.map(p => p.party)).filter(Boolean))].sort();
    return insertTable([tr("Thema"), ...parties.map(p => partyLabel(S.st, p)), tr("Einordnung")], run.result.rows.map(row => [
      label("category", row.category),
      ...parties.map(p => row.positions.filter(x => x.party === p).map(x => `${claimPlain(claims.get(x.claim))} (${refsPlain(claims.get(x.claim))})`).join("\n") || "–"),
      claimPlain(claims.get(row.analysis)),
    ]));
  },
  legal_claims: (run) => {
    const claims = claimsOf(run);
    return insertTable([tr("Rechtsargument"), tr("Partei"), tr("Einschätzung"), tr("Rechtsprechung"), tr("Würdigung")], run.result.rows.map(row => [
      claimPlain(claims.get(row.statement)), partyLabel(S.st, row.party), label("legal", row.assessment),
      row.authorities.map(id => `${claimPlain(claims.get(id))} (${refsPlain(claims.get(id))})`).join("\n") || "–",
      claimPlain(claims.get(row.reasoning)),
    ]));
  },
  fundamental_questions: (run) => {
    const claims = claimsOf(run);
    return insertStructured(run.result.rows.flatMap(row => [
      { heading: claimPlain(claims.get(row.question)) },
      { text: claimPlain(claims.get(row.analysis)), refs: refsPlain(claims.get(row.analysis)) },
      ...row.contrary.map(id => ({ text: `${tr("Gegenargument")}: ${claimPlain(claims.get(id))}`, refs: refsPlain(claims.get(id)) })),
    ]));
  },
  decision_draft: (run) => {
    const claims = claimsOf(run);
    const blocks = [];
    for (const part of ["facts", "issue", "reasoning", "counterargument", "open_issue", "disposition"]) {
      const rows = run.result.rows.filter(r => r.part === part);
      if (!rows.length) continue;
      blocks.push({ heading: label("part", part) });
      rows.forEach((row, i) => blocks.push({ text: `${part === "disposition" ? `${i + 1}. ` : ""}${claimPlain(claims.get(row.claim))}`, refs: refsPlain(claims.get(row.claim)) }));
    }
    return insertStructured(blocks);
  },
  hypothetical_impact: (run) => {
    const claims = claimsOf(run);
    return insertStructured(run.result.rows.flatMap(row => [
      { heading: tr("Ausgangslage") }, { text: claimPlain(claims.get(row.baseline)), refs: refsPlain(claims.get(row.baseline)) },
      { heading: tr("Unter der Annahme (hypothetisch)") }, { text: claimPlain(claims.get(row.analysis)), refs: refsPlain(claims.get(row.analysis)) },
      ...row.limitations.map(id => ({ text: `${tr("Grenze")}: ${claimPlain(claims.get(id))}`, refs: refsPlain(claims.get(id)) })),
    ]));
  },
};

async function ask(question) {
  const c = S.st.case;
  const demo = !S.st.settings.has_key && c.demo;
  const { id } = await api("/api/runs", { method: "POST", body: { task: "source_chat", question, demo, language: LANG } });
  S.run = { id, status: "running", question, events: [] };
  render();
}

async function runCitecheck() {
  S.citecheckBusy = true; render();
  await attempt(async () => {
    const paragraphs = await readParagraphs();
    if (!paragraphs.length) { toast(tr("Kein Text im Dokument."), true); return; }
    S.citecheck = await api("/api/citecheck", { method: "POST", body: { paragraphs } });
  });
  S.citecheckBusy = false; render();
}

// --- Views ----------------------------------------------------------------------
function renderPairing() {
  let code = "";
  pane.replaceChildren(h("div.wp", {},
    h("div.wordmark", {}, h("img", { src: "icon.svg", alt: "" }), "CourtOS"),
    h("div.block", {},
      h("h2", {}, tr("Mit CourtOS verbinden")),
      h("p.hint", {}, tr("Klicken Sie im Browser bei CourtOS auf «Word verbinden» und geben Sie den sechsstelligen Code hier ein.")),
      h("form.block", { onsubmit: (e) => { e.preventDefault(); attempt(async () => { await api("/api/pair", { method: "POST", body: { code } }); await boot(); }); } },
        h("input.code-input", { inputmode: "numeric", autocomplete: "one-time-code", maxlength: "6", "aria-label": tr("Verbindungscode"), oninput: (e) => { code = e.target.value.replace(/\D/g, ""); e.target.value = code; } }),
        h("button.btn.primary", { type: "submit" }, tr("Verbinden"))),
    ),
  ));
}

function render() {
  const c = S.st.case;
  const head = h("div.wp-head", {},
    h("div.row", {}, h("img", { src: "icon.svg", alt: "", width: 18, height: 18 }), h("span.case", {}, c ? c.name : tr("Kein Fall geöffnet")),
      h("select.lang", { "aria-label": tr("Sprache"), onchange: (e) => { setLang(e.target.value); render(); } }, LANGUAGES.map(([code, name]) => h("option", { value: code, selected: code === LANG }, code.toUpperCase())))),
    c ? h("div.state", {},
      h("span.local", {}, icon("lock"), trn(c.register.replace, "{n} Angabe lokal ersetzt", "{n} Angaben lokal ersetzt")),
      c.consent_valid ? h("span.external", {}, icon("out"), tr("freigegeben")) : h("span.alert", {}, tr("nicht freigegeben"))) : null,
  );
  if (!c) return pane.replaceChildren(h("div.wp", {}, head, h("p.hint", {}, tr("Öffnen Sie den Fallordner im Browser. Dieser Bereich zeigt danach denselben Fall.")), openBrowserButton()));
  const tabs = [["evidence", "Belegen"], ["citations", "Zitate"], ["insert", "Einfügen"], ["procedure", "Fristen"]];
  pane.replaceChildren(h("div.wp", {},
    head,
    h("div.wp-tabs", { role: "tablist" }, tabs.map(([id, name]) => h("button", { type: "button", role: "tab", "aria-selected": S.tab === id ? "true" : "false", onclick: () => { S.tab = id; render(); } }, tr(name)))),
    S.tab === "evidence" ? renderEvidence(c) : S.tab === "citations" ? renderCitations() : S.tab === "insert" ? renderInserts() : renderDeadlines(c),
    openBrowserButton(),
  ));
}

function renderEvidence(c) {
  const demo = !S.st.settings.has_key && c.demo;
  return [
    !c.consent_valid ? h("p.warning", {}, tr("Der Ordner ist nicht für Claude freigegeben. Prüfen und freigeben im Browser.")) : null,
    h("div.block", {},
      h("h2", {}, tr("Markierte Stelle belegen")),
      h("p.hint", {}, demo ? tr("Im Demo-Modus steht nur die vorbereitete Frage zur Verfügung.") : tr("Markieren Sie im Entwurf einen Satz. CourtOS sucht die Aktenstellen dazu. Namen in der Markierung werden vor dem Senden ersetzt.")),
      S.selection ? h("div.selection", {}, S.selection) : null,
      !demo ? h("div.actions", {}, h("button.btn", { type: "button", disabled: !c.consent_valid || S.run?.status === "running", onclick: () => attempt(async () => {
        const text = (await readSelection()).trim();
        if (!text) return toast(tr("Bitte zuerst im Dokument Text markieren."), true);
        S.selection = text.slice(0, 1500);
        await ask(tr("Welche Stellen in den Akten betreffen diese Passage aus meinem Entwurf? Stützen oder widersprechen sie ihr? Passage: «{p}»", { p: S.selection }));
      }) }, tr("Markierung belegen"))) : null,
      h("form.block", { onsubmit: (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) attempt(() => ask(q)); } },
        h("textarea", { name: "q", placeholder: tr("Oder eine Frage an die Akten"), "aria-label": tr("Frage an die Akten"), value: demo ? S.st.demo_question : "" }),
        h("div.actions", {}, h("button.btn.primary", { type: "submit", disabled: !c.consent_valid || S.run?.status === "running" }, demo ? tr("Demo abspielen") : tr("Fragen")))),
    ),
    S.run ? renderRun() : null,
  ];
}

function renderRun() {
  const run = S.run;
  if (run.status === "running") {
    const last = [...run.events].reverse().map(traceText).find(Boolean) ?? tr("Claude arbeitet …");
    return h("div.block", {}, h("p.progress-text", {}, last));
  }
  if (!run.result) return h("p.warning", {}, errorText(run.error?.code ?? run.status));
  const claims = claimsOf(run);
  return h("div.block", {},
    h("h2", {}, tr("Gefundene Stellen")),
    h("p.hint", {}, tr("Jede Fundstelle ist wörtlich an ihrer Quelle geprüft. Ob sie Ihren Satz trägt, entscheiden Sie.")),
    run.result.rows.map(row => {
      const claim = claims.get(row.answer);
      return h("div.finding", {}, claimText(claim.display), claim.citations.map(citation => h("div.src", {},
        h("div", {}, h("span.where", {}, icon(citation.match === "exact" ? "check" : "cross"), refLabel(citation)), " ", h("q", {}, (citation.quote_original ?? citation.quote_pseudonymised).slice(0, 220))),
        citation.match === "exact" ? h("button.btn.small", { type: "button", onclick: () => attempt(() => inLanguage(caseLang(), () => insertReference(citation))) }, footnotes() ? tr("Als Fussnote") : tr("Einfügen")) : null,
      )));
    }),
  );
}

function renderCitations() {
  const status = { found: ["check", "Gefunden"], date_differs: ["dash", "Datum weicht ab"], not_found: ["cross", "Nicht in OpenCaseLaw"], not_checked: ["ring", "Nicht geprüft"] };
  return h("div.block", {},
    h("h2", {}, tr("Zitate im Entwurf prüfen")),
    h("p.hint", {}, tr("citecheck findet BGE- und Urteilszitate im Dokument und prüft sie an OpenCaseLaw. Übermittelt wird nur die Fundstelle, kein Text des Entwurfs.")),
    h("div.actions", {}, h("button.btn.primary", { type: "button", disabled: S.citecheckBusy, onclick: runCitecheck }, icon("scale"), S.citecheckBusy ? tr("Prüft …") : tr("Zitate prüfen"))),
    S.citecheck ? h("ul.citecheck", {}, S.citecheck.results.map(r => h("li", { class: r.status },
      h("button.link", { type: "button", onclick: () => attempt(() => selectInDocument(r.ref.paragraph, r.written)) }, h("span.cc-status", {}, icon(status[r.status][0]), tr(status[r.status][1])), h("span.cc-written", {}, r.written)),
      r.status === "found" || r.status === "date_differs" ? h("div.cc-detail", {}, `${r.court ?? ""} ${r.docket ?? ""}, ${formatDate(r.date)}`,
        r.pinpoint ? ` · E. ${r.pinpoint} ${r.pinpoint_found === null ? tr("nicht prüfbar") : r.pinpoint_found ? tr("im Text gefunden") : tr("nicht gefunden")}` : "",
        r.url ? [" · ", h("a", { href: r.url, target: "_blank", rel: "noopener noreferrer" }, "OpenCaseLaw")] : null) : null)),
      !S.citecheck.results.length ? h("li", {}, tr("Keine Entscheidzitate gefunden.")) : null) : null,
    h("p.hint", {}, tr("«Nicht gefunden» heisst nicht «falsch». Ob ein Entscheid die Aussage trägt, prüft citecheck nicht.")),
  );
}

function renderInserts() {
  const names = ["decision_draft", "chronology", "facts_evidence", "party_comparison", "legal_claims", "fundamental_questions", "hypothetical_impact"];
  const available = names.filter(n => S.latest.has(n));
  const orders = S.st.case.procedure.orders;
  return h("div.block", {},
    h("h2", {}, tr("An der Cursorposition einfügen")),
    available.length ? h("div.inserts", {}, available.map(n => h("button.btn", { type: "button", onclick: () => attempt(() => inLanguage(caseLang(), () => INSERTS[n](S.latest.get(n)))) }, label("task", n), h("span.faint", {}, trn(S.latest.get(n).result.rows.length, "{n} Zeile", "{n} Zeilen")))))
      : h("p.hint", {}, tr("Analysen erstellen Sie im Browser. Danach können Sie sie hier einfügen.")),
    orders.length ? [h("h2", {}, tr("Verfügungen")), h("div.inserts", {}, orders.map(o => h("button.btn", { type: "button", onclick: () => attempt(() => insertStructured(o.text.split(/\n{2,}/).map(text => ({ text })))) }, o.title, h("span.faint", {}, o.status === "issued" ? tr("erlassen") : tr("Entwurf")))))] : null,
    h("p.hint", {}, tr("Eingefügt wird mit echten Namen; Fundstellen werden zu Fussnoten. Der Text bleibt in Ihrem Dokument; CourtOS speichert nichts darin.")),
  );
}

function renderDeadlines(c) {
  const today = new Date().toISOString().slice(0, 10);
  const open = c.procedure.deadlines.filter(d => d.status === "open");
  return h("div.block", {},
    h("h2", {}, tr("Offene Fristen")),
    open.length ? h("ul.deadlines", {}, open.map(d => h("li", { class: d.date < today ? "overdue" : null }, h("span.d-date", {}, formatDate(d.date)), h("span.d-title", {}, d.title), d.ref ? h("span.faint", {}, d.ref) : null)))
      : h("p.hint", {}, tr("Keine offenen Fristen erfasst.")),
    h("p.hint", {}, tr("Fristen erfassen und ändern Sie im Browser unter Verfahren. CourtOS berechnet keine gesetzlichen Fristen.")),
  );
}

function openBrowserButton() {
  return h("button.link", { type: "button", onclick: () => {
    const url = location.origin + "/";
    if (inOffice() && Office.context.ui?.openBrowserWindow) Office.context.ui.openBrowserWindow(url); else window.open(url, "_blank", "noopener");
  } }, tr("Im Browser öffnen"));
}

async function boot() {
  try { S.st = await api("/api/state"); } catch (error) { if (error.code === "not_paired") return renderPairing(); throw error; }
  events({
    // Another case was opened: never offer the previous case's results.
    case: (change) => { if (change.kind === "opened") { S.latest.clear(); S.run = null; S.selection = ""; S.citecheck = null; } refresh(); },
    run: ({ id, event }) => { if (S.run?.id === id) { S.run.events.push(event); render(); } },
    run_done: async ({ id }) => {
      const summary = await api(`/api/runs/${id}`);
      if (S.run?.id === id) S.run = summary;
      if (summary.status === "succeeded" && summary.task !== "source_chat") S.latest.set(summary.task, summary);
      render();
    },
  });
  await refresh();
}

const start = () => boot().catch(() => renderPairing());
if (window.Office?.onReady) Office.onReady((info) => { S.office = info.host === Office.HostType.Word; start(); });
else start();
