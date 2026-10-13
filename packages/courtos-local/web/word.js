// CourtOS in Word. The draft stays in Word; CourtOS reads only what you ask it
// to (a selection, or the paragraphs for a citation check) and inserts only
// what you choose, at the cursor.
import { adoptLang, api, ApiError, chooseLang, claimPlain, claimText, errorText, events, formatDate, h, icon, label, LANG, LANGUAGES, setLang, themeToggle, tr, traceText, trn, refLabel, inLanguage } from "./shared.js";
import { BUILD, plainText, sources } from "./word-doc.js";

const pane = document.getElementById("pane");
const S = { st: null, tab: "evidence", selection: "", run: null, latest: new Map(), office: false, citecheck: null, citecheckBusy: false, choosing: false, docCase: null, products: null };

const inOffice = () => S.office && typeof Word !== "undefined";
const toast = (message, bad = false, action = null) => {
  const el = h("div.toast", { class: bad ? "bad" : null }, message,
    action ? h("button.link", { type: "button", onclick: () => { el.remove(); action.run(); } }, action.label) : null);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), action ? 9000 : 4500);
};
// What Claude is doing for the browser, updated in place so typing in the pane is never interrupted.
const live = h("p.live", { role: "status", hidden: true });

async function attempt(fn) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError && error.code === "not_paired") return renderPairing();
    toast(errorText(error.code ?? "internal_error"), true);
  }
}
/** Server events arrive outside any click: a failure in one shows the pairing page or a message, never an unhandled rejection. */
const guarded = (handlers) => Object.fromEntries(Object.entries(handlers).map(([type, handler]) => [type, (data) => attempt(() => handler(data))]));

// --- Which case the document belongs to ------------------------------------------
/** Where the document is saved: a path or file URL on this computer, a web address, or nothing for a new document. */
function documentUrl() {
  try { return inOffice() ? Office.context.document.url ?? "" : ""; } catch { return ""; }
}
async function findDocumentCase() {
  const url = documentUrl();
  S.docCase = url ? (await api("/api/cases/for-document", { method: "POST", body: { url } })).id : null;
}
/** The document lies in another case's folder than the open case's: nothing of the open case may go into it. */
const foreignDocument = () => Boolean(S.docCase && S.st?.case && S.docCase !== S.st.case.id);
function refuseForeign() {
  if (foreignDocument()) throw new ApiError("document_other_case", 409);
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
  refuseForeign();
  const where = refLabel(citation);
  const quote = (citation.quote_original ?? "").replace(/\s+/g, " ").trim();
  if (!inOffice()) { await navigator.clipboard?.writeText(`${where}: «${quote}»`); return toast(tr("In die Zwischenablage kopiert.")); }
  await Word.run(async (context) => {
    const end = context.document.getSelection().getRange("End");
    if (footnotes()) end.insertFootnote(`${where}: «${quote}».`);
    else end.insertText(` (${where})`, "After");
    await context.sync();
  });
  toast(footnotes() ? tr("Fussnote eingefügt: {w}", { w: where }) : tr("Fundstelle eingefügt: {w}", { w: where }));
}

/** One statement at the cursor, its sources as a footnote (or in parentheses). Strings are built before any await. */
async function insertClaim(claim) {
  refuseForeign();
  const text = claimPlain(claim), refs = sources(claim);
  if (!inOffice()) { await navigator.clipboard?.writeText(refs ? `${text} (${refs})` : text); return toast(tr("In die Zwischenablage kopiert.")); }
  await Word.run(async (context) => {
    const inserted = context.document.getSelection().getRange("End").insertText(text, "After");
    if (refs) { if (footnotes()) inserted.getRange("End").insertFootnote(`${refs}.`); else inserted.getRange("End").insertText(` (${refs})`, "After"); }
    inserted.getRange("End").select();
    await context.sync();
  });
  toast(tr("Aus dem Browser eingefügt."));
}

const INK = "#1A1A1A", HAIRLINE = "#BFBFBF", MUTED = "#595959";
const HANG = 21; // points: room for "10." before the text of a numbered paragraph

/**
 * A table set like a court document: the document's own font one point below
 * the text, a rule above and below, a rule under the header (repeated on each
 * page) and hairlines between rows; no vertical lines, cells aligned at the top.
 */
async function insertTable(spec) {
  refuseForeign();
  // A cell's second line (the posture under the party) goes in with the value
  // and is styled afterwards; inserting it separately lands in the wrong cell on Mac.
  const values = [spec.columns.map(c => c.head), ...spec.rows.map(r => r.map(c => c.sub ? `${c.text}\n${c.sub}` : c.text))];
  if (!inOffice()) { await navigator.clipboard?.writeText(plainText(spec)); return toast(tr("Tabelle in die Zwischenablage kopiert.")); }
  const done = tr("Tabelle eingefügt.");
  await Word.run(async (context) => {
    const selection = context.document.getSelection();
    const here = selection.paragraphs.getLast();
    here.load("font/size");
    await context.sync();
    const size = typeof here.font.size === "number" ? Math.max(8, here.font.size - 1) : null;
    const table = selection.getRange("End").insertTable(values.length, spec.columns.length, "After", values);
    table.styleBuiltIn = Word.BuiltInStyleName?.tableGrid ?? "TableGrid";
    table.headerRowCount = 1;
    table.verticalAlignment = "Top";
    table.alignment = "Left";
    if (size) table.font.size = size;
    const rule = (border, width, color) => { border.type = "Single"; border.width = width; border.color = color; };
    for (const side of ["Left", "Right", "InsideVertical"]) table.getBorder(side).type = "None";
    rule(table.getBorder("Top"), 1, INK);
    rule(table.getBorder("Bottom"), 1, INK);
    rule(table.getBorder("InsideHorizontal"), 0.5, HAIRLINE);
    const header = table.rows.getFirst();
    header.font.bold = true;
    rule(header.getBorder("Bottom"), 0.75, INK);
    table.setCellPadding("Top", 4); table.setCellPadding("Bottom", 4);
    table.setCellPadding("Left", 0); table.setCellPadding("Right", 8);
    const paragraphs = table.getRange("Whole").paragraphs;
    paragraphs.load("items");
    table.load("width");
    await context.sync();
    for (const p of paragraphs.items) {
      p.spaceBefore = 0; p.spaceAfter = 0; p.firstLineIndent = 0; p.leftIndent = 0; p.alignment = "Left";
      if (size) p.lineSpacing = Math.round(size * 1.2 * 2) / 2;
    }
    spec.columns.forEach((column, i) => { table.getCell(0, i).columnWidth = table.width * column.width; });
    // The second line is set quieter than the first.
    const subs = [];
    spec.rows.forEach((row, r) => row.forEach((cell, i) => {
      if (!cell.sub) return;
      const found = table.getCell(r + 1, i).body.search(cell.sub, { matchCase: true });
      found.load("items");
      subs.push(found);
    }));
    await context.sync();
    for (const found of subs) {
      const line = found.items.at(-1);
      if (!line) continue;
      line.font.italic = true; line.font.bold = false; line.font.color = MUTED;
    }
    await context.sync();
  });
  toast(done);
}

/**
 * Headings and paragraphs in the document's own styles. Headings keep with the
 * next paragraph; each paragraph's sources become a footnote (or parentheses
 * where Word has no footnotes), ending with a full stop as Swiss footnotes do.
 */
async function insertOutline(spec) {
  refuseForeign();
  if (!inOffice()) { await navigator.clipboard?.writeText(plainText(spec)); return toast(tr("In die Zwischenablage kopiert.")); }
  const done = tr("In das Dokument eingefügt.");
  await Word.run(async (context) => {
    // Every paragraph goes in as body text first; the headings are styled only
    // afterwards. Word copies a paragraph's run formatting into the paragraph
    // inserted after it, so a heading styled first would set the size of the
    // text that follows it.
    let anchor = context.document.getSelection().getRange("End");
    const headings = [];
    for (const block of spec.blocks) {
      const paragraph = anchor.insertParagraph("", "After");
      paragraph.styleBuiltIn = Word.BuiltInStyleName?.normal ?? "Normal";
      if (block.heading) {
        paragraph.insertText(block.heading, "Start");
        headings.push(paragraph);
      } else {
        if (block.number) paragraph.insertText(`${block.number}.\t`, "End");
        // Numbered proposals hang their text at the tab; every other paragraph
        // is reset, since Word carries indents into the paragraph after.
        paragraph.leftIndent = block.number ? HANG : 0;
        paragraph.firstLineIndent = block.number ? -HANG : 0;
        if (block.lead) paragraph.insertText(`${block.lead}: `, "End").font.bold = true;
        paragraph.insertText(block.text, "End").font.bold = false;
        if (block.note) {
          const end = paragraph.getRange("End");
          if (footnotes()) end.insertFootnote(`${block.note}.`); else paragraph.insertText(` (${block.note})`, "End");
        }
      }
      anchor = paragraph.getRange("End");
    }
    await context.sync();
    for (const heading of headings) {
      heading.styleBuiltIn = Word.BuiltInStyleName?.heading3 ?? "Heading3";
      heading.font.color = INK;
      heading.keepWithNext = true;
    }
    await context.sync();
  });
  toast(done);
}

// --- Data ---------------------------------------------------------------------
async function refresh() {
  S.st = await api("/api/state");
  await findDocumentCase().catch(() => { S.docCase = null; });
  // A document saved in a case's folder brings its case along, when no case is open. An open case is never switched from here unasked.
  if (!S.st.case && S.docCase && S.followed !== S.docCase && S.st.cases?.some(x => x.id === S.docCase && x.source_available)) {
    S.followed = S.docCase;
    return attempt(() => openCase(S.docCase));
  }
  await loadProducts();
  for (const run of S.st.runs ?? []) {
    if (run.status !== "succeeded" || run.task === "source_chat" || S.latest.has(run.task)) continue;
    S.latest.set(run.task, await api(`/api/runs/${run.id}`));
  }
  const current = S.st.current && S.st.runs?.find(r => r.id === S.st.current);
  if (current && current.id !== S.run?.id) { S.liveTask = current.task; if (live.hidden) showLive(tr("Im Browser: {t} · läuft", { t: label("task", current.task) })); }
  else if (!S.st.current) showLive(null);
  render();
}

async function loadProducts() {
  S.products = S.st.case ? await api("/api/products").catch(() => null) : null;
}

async function openCase(id) {
  if (S.st.case?.id !== id) await api("/api/cases/open", { method: "POST", body: { id } });
  S.choosing = false;
  await refresh();
}

const claimsOf = (run) => new Map(run.result.claims.map(c => [c.id, c]));

/** Inserted text belongs to the court's document: it is written in the language of the proceedings. */
const caseLang = () => S.st?.case?.language?.code ?? "de";

const TABLES = new Set(["chronology", "facts_evidence", "party_comparison", "legal_claims"]);
/** A work product goes in written in the language of the proceedings, typeset for the document. */
function insertWork(task) {
  const spec = inLanguage(caseLang(), () => BUILD[task](S.latest.get(task), S.st));
  return spec.kind === "table" ? insertTable(spec) : insertOutline(spec);
}

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
  // The mark sits beside the case name; the status lines up under the name, not under the mark.
  const head = h("header.wp-head", {},
    h("img.mark", { src: "icon.svg", alt: "CourtOS", width: 20, height: 20 }),
    c ? h("button.case", { type: "button", "aria-expanded": String(S.choosing), title: tr("Fall wechseln"), onclick: () => { S.choosing = !S.choosing; render(); } }, h("span", {}, c.name), icon(S.choosing ? "up" : "down"))
      : h("span.case", {}, tr("Kein Fall geöffnet")),
    h("select.lang", { "aria-label": tr("Sprache"), onchange: (e) => { chooseLang(e.target.value); render(); } }, LANGUAGES.map(([code]) => h("option", { value: code, selected: code === LANG }, code.toUpperCase()))),
    themeToggle(),
    c ? h("div.state", {},
      h("span.local", {}, icon("lock"), trn(c.register.replace, "{n} Angabe lokal ersetzt", "{n} Angaben lokal ersetzt")),
      c.consent_valid ? h("span.external", {}, icon("out"), tr("freigegeben")) : h("span.alert", {}, tr("nicht freigegeben"))) : null,
    live,
  );
  if (!c || S.choosing) return pane.replaceChildren(h("div.wp.no-tabs", {}, head, h("div.wp-body", {}, documentNotice(), renderCases()), h("footer.wp-foot", {}, openBrowserButton())));
  const tabs = [["evidence", "Belegen"], ["citations", "Zitate"], ["insert", "Einfügen"], ["files", "Dateien"], ["procedure", "Fristen"]];
  pane.replaceChildren(h("div.wp", {},
    head,
    h("nav.wp-tabs", { role: "tablist", "aria-label": tr("Bereiche") }, tabs.map(([id, name]) => h("button", { type: "button", role: "tab", "aria-selected": S.tab === id ? "true" : "false", onclick: () => { S.tab = id; render(); if (id === "files") attempt(async () => { await loadProducts(); render(); }); } }, tr(name)))),
    h("div.wp-body", { role: "tabpanel" }, documentNotice(), S.tab === "evidence" ? renderEvidence(c) : S.tab === "citations" ? renderCitations() : S.tab === "insert" ? renderInserts() : S.tab === "files" ? renderFiles(c) : renderDeadlines(c)),
    h("footer.wp-foot", {}, openBrowserButton()),
  ));
}

/** The case list. Choosing a case here opens it for the browser as well: there is one open case. */
function renderCases() {
  const c = S.st.case, list = S.st.cases ?? [];
  return h("div.block", {},
    h("h2", {}, tr("Fälle")),
    list.length ? h("ul.inserts.cases", {}, list.map(x => h("li", {}, h("button", { type: "button", "aria-current": c?.id === x.id ? "true" : null, disabled: !x.source_available, onclick: () => attempt(() => openCase(x.id)) },
        h("span.i-title", {}, x.name),
        h("span.i-meta", {}, [
          c?.id === x.id ? tr("geöffnet") : null,
          S.docCase === x.id ? tr("zu diesem Dokument") : null,
          x.started ? trn(x.documents, "{n} Dokument", "{n} Dokumente") : tr("noch nicht eingelesen"),
          !x.source_available ? tr("Akten nicht erreichbar. Ist das Laufwerk verbunden?") : null,
          // Two cases of the same name are told apart by their work folder.
          list.some(y => y !== x && y.name === x.name) ? x.work : null,
        ].filter(Boolean).join(" · ")),
        c?.id === x.id ? icon("check") : icon("arrow")))))
      : h("p.hint", {}, tr("Fälle fügen Sie im Browser hinzu. Danach wählen Sie sie hier.")),
  );
}

/** A document saved in a case's folder names its case. If another case is open, nothing can be inserted until its own case is. */
function documentNotice() {
  const c = S.st.case;
  if (!S.docCase || S.docCase === c?.id) return null;
  const owner = S.st.cases?.find(x => x.id === S.docCase);
  if (!owner) return null;
  return h("div.doc-case", { role: "status" },
    h("p", {}, c ? tr("Dieses Dokument liegt im Ordner des Falls «{n}». Geöffnet ist ein anderer Fall; Einfügen ist gesperrt.", { n: owner.name }) : tr("Dieses Dokument liegt im Ordner des Falls «{n}».", { n: owner.name })),
    owner.source_available ? h("button.btn.small", { type: "button", onclick: () => attempt(() => openCase(owner.id)) }, tr("Diesen Fall öffnen")) : null);
}

/** "12. Okt. 2026, 16:05": several results of one day are told apart by the hour. */
const whenOf = (iso) => (iso ? new Date(iso).toLocaleString(`${LANG}-CH`, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const FORMAT = { docx: "Word", md: "Markdown" };

/** The work-products folder: each result as a Word and a Markdown file, opened with the computer's own programs. */
function renderFiles(c) {
  const groups = new Map();
  for (const file of S.products?.files ?? []) {
    const [, base, ext] = file.name.match(/^(.*)\.(docx|md)$/i) ?? [null, file.name, null];
    if (!groups.has(base)) groups.set(base, { base, modified: file.modified, files: [] });
    groups.get(base).files.push({ ...file, format: ext ? FORMAT[ext.toLowerCase()] : null });
  }
  const order = (f) => (f.format === "Word" ? 0 : f.format ? 1 : 2);
  return h("div.block", {},
    h("h2", {}, tr("Arbeitsprodukte")),
    groups.size ? h("ul.files", {}, [...groups.values()].map(g => h("li", {},
      // "2026-10-12 Chronologie": the date stands below, as on the other rows.
      h("span.f-title", {}, g.base.replace(/^\d{4}-\d{2}-\d{2} (?=\S)/, "")),
      h("span.f-meta", {}, whenOf(g.modified)),
      h("span.f-actions", {}, g.files.sort((a, b) => order(a) - order(b)).map(file => h("button.btn.small", { type: "button", "aria-label": tr("{f} öffnen: {n}", { f: file.format ?? tr("Datei"), n: file.name }), onclick: () => attempt(() => api("/api/products/open", { method: "POST", body: { name: file.name } })) }, file.format ?? file.name)))))
    ) : h("p.hint", {}, tr("Noch keine. Jede Analyse legt hier eine Word- und eine Markdown-Datei ab.")),
    c.products_failed ? h("p.alert", {}, tr("Die Word- und Markdown-Dateien konnten nicht in den Ordner der Arbeitsprodukte geschrieben werden. Die Ergebnisse bleiben in CourtOS. Ist der Ordner schreibgeschützt oder das Laufwerk voll?"), " ", h("button.link", { type: "button", onclick: () => attempt(async () => { await api("/api/products/retry", { method: "POST" }); await refresh(); }) }, tr("Erneut versuchen"))) : null,
    h("p.hint", {}, tr("Die Dateien gehören Ihnen: Sie können sie umbenennen, ändern oder löschen. CourtOS überschreibt sie nicht.")),
    h("div.actions", {}, h("button.link", { type: "button", onclick: () => attempt(() => api("/api/cases/reveal", { method: "POST", body: { id: c.id, place: "products" } })) }, icon("folder"), tr("Ordner zeigen"))),
  );
}

function renderEvidence(c) {
  const demo = !S.st.settings.has_key && c.demo;
  return [
    !c.consent_valid ? h("p.warning", {}, tr("Der Ordner ist für kein Modell freigegeben. Prüfen und freigeben im Browser.")) : null,
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
    const last = [...run.events].reverse().map(traceText).find(Boolean) ?? tr("Das Modell arbeitet …");
    return h("div.block", {}, h("p.progress-text", {}, last));
  }
  if (!run.result) return h("p.warning", {}, errorText(run.error?.code ?? run.status));
  const claims = claimsOf(run);
  return h("div.block", {},
    h("h2", {}, tr("Gefundene Stellen")),
    h("p.hint", {}, tr("Jede Fundstelle ist wörtlich an ihrer Quelle geprüft. Ob sie Ihren Satz trägt, entscheiden Sie.")),
    run.result.rows.map(row => {
      const claim = claims.get(row.answer);
      return h("div.finding", {}, claimText(claim.display), claim.citations.map((citation, index) => h("div.src", {},
        h("div", {}, h("span.where", {}, icon(citation.match === "exact" ? "check" : "cross"), refLabel(citation)), " ", h("q", {}, (citation.quote_original ?? citation.quote_pseudonymised).slice(0, 220))),
        h("div.src-actions", {},
          citation.match === "exact" ? h("button.btn.small", { type: "button", onclick: () => attempt(() => inLanguage(caseLang(), () => insertReference(citation))) }, footnotes() ? tr("Als Fussnote") : tr("Einfügen")) : null,
          citation.document ? h("button.link.small", { type: "button", onclick: () => attempt(() => showInBrowser(run.id, claim.id, index)) }, tr("Im Browser zeigen")) : null),
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
  const names = Object.keys(BUILD).sort((a, b) => (a === "decision_draft" ? -1 : b === "decision_draft" ? 1 : 0));
  const available = names.filter(n => S.latest.has(n));
  const orders = S.st.case.procedure.orders;
  return h("div.block", {},
    h("h2", {}, tr("An der Cursorposition einfügen")),
    available.length ? h("ul.inserts", {}, available.map(n => h("li", {}, h("button", { type: "button", onclick: () => attempt(() => insertWork(n)) },
        h("span.i-title", {}, label("task", n)),
        h("span.i-meta", {}, TABLES.has(n) ? trn(S.latest.get(n).result.rows.length, "Tabelle · {n} Zeile", "Tabelle · {n} Zeilen") : tr("Text mit Überschriften und Fussnoten")),
        icon("insert")))))
      : h("p.hint", {}, tr("Analysen erstellen Sie im Browser. Danach können Sie sie hier einfügen.")),
    orders.length ? [h("h2", {}, tr("Verfügungen")), h("ul.inserts", {}, orders.map(o => h("li", {}, h("button", { type: "button", onclick: () => attempt(() => insertOutline({ kind: "outline", blocks: o.text.split(/\n{2,}/).map(text => ({ text })) })) },
        h("span.i-title", {}, o.title), h("span.i-meta", {}, o.status === "issued" ? tr("erlassen") : tr("Entwurf")), icon("insert")))))] : null,
    h("p.hint", {}, tr("Eingefügt wird mit echten Namen. Im Text werden Fundstellen zu Fussnoten, in einer Tabelle stehen sie in einer eigenen Spalte. Der Text bleibt in Ihrem Dokument; CourtOS speichert nichts darin.")),
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

function openBrowser() {
  const url = location.origin + "/";
  if (inOffice() && Office.context.ui?.openBrowserWindow) Office.context.ui.openBrowserWindow(url); else window.open(url, "_blank", "noopener");
}
function openBrowserButton() {
  return h("button.link", { type: "button", onclick: openBrowser }, icon("out"), tr("Im Browser öffnen"));
}

/** The cited page opens in the browser, with the passage marked. Without an open browser window, one is opened. */
async function showInBrowser(run, claim, citation) {
  const { delivered } = await api("/api/show", { method: "POST", body: { run, claim, citation } });
  if (delivered) toast(tr("Im Browser geöffnet."));
  else { openBrowser(); toast(tr("Der Browser wird geöffnet. Wählen Sie die Stelle dort erneut.")); }
}

/** One line on what Claude is doing for the browser: the same run, seen from Word. */
function showLive(text) {
  live.hidden = !text;
  live.textContent = text ?? "";
}

async function boot() {
  try { S.st = await api("/api/state"); } catch (error) { if (error.code === "not_paired") return renderPairing(); throw error; }
  adoptLang(S.st);
  events(guarded({
    // Another case was opened: never offer the previous case's results.
    case: (change) => { if (change.kind === "opened") { S.latest.clear(); S.run = null; S.selection = ""; S.citecheck = null; } return refresh(); },
    run: ({ id, event }) => {
      if (S.run?.id === id) { S.run.events.push(event); return render(); }
      const text = traceText(event);
      if (text) showLive(tr("Im Browser: {t} · {s}", { t: label("task", S.liveTask ?? "source_chat"), s: text }));
    },
    run_started: ({ id, task }) => { if (S.run?.id !== id) { S.liveTask = task; showLive(tr("Im Browser: {t} · gestartet", { t: label("task", task) })); } },
    run_done: async ({ id }) => {
      const summary = await api(`/api/runs/${id}`);
      if (S.run?.id === id) S.run = summary;
      else {
        showLive(null);
        if (summary.status === "succeeded" && summary.task !== "source_chat") toast(tr("Neues Ergebnis: {t}", { t: label("task", summary.task) }), false, { label: tr("Einfügen …"), run: () => { S.tab = "insert"; render(); } });
      }
      if (summary.status === "succeeded" && summary.task !== "source_chat") S.latest.set(summary.task, summary);
      render();
    },
    products: () => attempt(async () => { await loadProducts(); render(); }),
    language: ({ language }) => { if (language !== LANG) { setLang(language); render(); } },
    // A statement chosen in the browser goes in at the cursor.
    insert: ({ run, claim }) => attempt(async () => {
      const summary = await api(`/api/runs/${run}`);
      const found = summary.result?.claims.find(c => c.id === claim);
      if (found) await inLanguage(caseLang(), () => insertClaim(found));
    }),
  }), "word");
  await refresh();
}

// Saving the document under another name may put it in another case's folder.
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.st) attempt(refresh); });

const start = () => boot().catch(() => renderPairing());
if (window.Office?.onReady) Office.onReady((info) => { S.office = info.host === Office.HostType.Word; start(); });
else start();
