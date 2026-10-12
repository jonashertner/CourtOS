import { adoptLang, api, ApiError, chooseLang, consentLost, citationChip, claimPlain, errorText, events, formatDate, h, icon, issuePlaces, label, LANG, LANGUAGES, pairFromHash, partyLabel, refsPlain, setLang, TASK_ORDER, themeToggle, tr, traceText, trn, pg, refLabel } from "./shared.js";
import { renderResult } from "./results.js";
import { COUNTERPART, PARTY_ROLES, partyTerm, partyTermLabel } from "./party-roles.js";

const app = document.getElementById("app");
const S = {
  st: null, view: null, register: null, expanded: new Set(), occurrences: new Map(),
  preview: { doc: null, page: 1, mode: "mirror" }, views: new Map(),
  run: null, showTrace: true, drawer: null, scan: null, busy: false,
  selectedNotes: new Set(), research: { query: "", results: null, busy: false, citecheck: null, citecheckBusy: false },
  noteFilter: "all", orderDraft: null,
  reader: null,
};

const KIND_GROUPS = [
  ["Personen", ["person"]],
  ["Organisationen", ["organisation"]],
  ["Adressen und Orte", ["address", "place", "parcel"]],
  ["Kennnummern und Kontakt", ["email", "phone", "iban", "ahv", "uid", "url", "plate", "birthdate", "insured", "zemis", "document", "account", "identifier", "number"]],
];
const NOTES = {
  check_word: "Steht nur am Satzanfang oder ist sehr kurz und ist ein gewöhnliches Wort, kein bekannter Nachname. Bleibt lesbar, bis Sie es ersetzen.",
  ocr_word: "Nur auf texterkannten Seiten; mit Umlaut ein gewöhnliches Wort. Vorsorglich ersetzt, weil es auch ein Nachname sein kann.",
  ahv_checksum: "AHV-Nummer mit ungültiger Prüfziffer. Vorsorglich ersetzt: eine AHV-Nummer gehört immer zu einer Person.",
  ambiguous: "Passt zu mehreren Personen. Prüfen Sie die Stellen einzeln.",
  public_office: "Von citecheck als öffentliches Amt erkannt (Gericht, Anwältin, Behörde). Vorsorglich ersetzt; abwählen, wenn es lesbar bleiben soll.",
  public_identifier: "Von citecheck einem Unternehmen oder Amt zugeordnet. Vorsorglich ersetzt, weil auch die Kennung einer Firma die Partei erkennbar macht.",
  company_name: "Unterscheidungskraft eines Parteinamens (Firma). Von CourtOS ergänzt.",
  surname_alone: "Der Nachname allein wird ebenfalls ersetzt.",
  alias_conflict: "Eine Schreibweise gehört zu mehreren Angaben. Prüfen.",
};
const ROLE_GROUPS = [["Rechtsschriften", ["claim", "response", "submission"]], ["Beilagen", ["exhibit"]], ["Literatur und Entscheide", ["literature", "authority"]], ["Interne Notizen", ["internal_note"]], ["Weitere", ["other"]]];
const MODELS = [["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"]];
const PIPELINE = ["chronology", "facts_evidence", "party_comparison", "legal_claims", "fundamental_questions"];
const TASK_TEXT = {
  chronology: "Ereignisse nach Darstellung jeder Partei, mit wörtlich belegtem Datum. Widersprüche bleiben getrennt.",
  facts_evidence: "Jede wesentliche Tatsachenbehauptung, die genannten Beilagen, die andere Partei und eine begründete Einschätzung.",
  party_comparison: "Rechtsbegehren, Sachverhalt und Rechtliches beider Parteien nebeneinander.",
  legal_claims: "Die Rechtsargumente der Parteien, geprüft an Entscheiden auf OpenCaseLaw und an der Literatur im Ordner.",
  fundamental_questions: "Die Fragen, an denen der Fall hängt, mit Analyse und Gegenargumenten.",
  decision_draft: "Eine quellengebundene Arbeitsgrundlage, kein Entscheid: Sachverhalt, Streitfragen, Würdigung mit Gegenargumenten, offene Punkte und Vorschläge zum weiteren Vorgehen.",
  hypothetical_impact: "Was ändert sich, wenn eine Ihrer Arbeitsannahmen zutrifft? Ausgangslage, Auswirkung, Grenzen.",
  source_chat: "Eine konkrete Frage an die Akten. Die Antwort besteht nur aus belegten Aussagen.",
};

// ---------------------------------------------------------------------------
function toast(message, bad = false) {
  const el = h("div.toast", { class: bad ? "bad" : null }, message);
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), bad ? 7000 : 4200);
}

async function attempt(fn) {
  try { return await fn(); }
  catch (error) {
    if (error instanceof ApiError && error.code === "not_paired") return renderUnpaired();
    toast(errorText(error.code ?? "internal_error"), true);
  }
}

async function refresh() {
  S.st = await api("/api/state");
  if (S.st.case && !S.view) S.view = S.st.case.consent_valid ? "work" : "privacy";
  if (S.st.case && (S.view === "privacy" || !S.register)) S.register = (await api("/api/register")).entities;
  render();
}

async function boot() {
  await pairFromHash();
  try {
    S.st = await api("/api/state");
  } catch (error) {
    if (error.code === "not_paired") return renderUnpaired();
    throw error;
  }
  adoptLang(S.st);
  events({
    scan: (p) => { S.scan = p; renderScanProgress(); },
    case: async (change) => {
      if (change.kind === "opening") return;
      const before = S.st?.case;
      if (change.kind === "mirror" || change.kind === "folder") { S.views.clear(); S.occurrences.clear(); }
      await refresh();
      if (change.kind === "folder") toast(tr("Der Ordner hat sich geändert. Die Akten wurden neu eingelesen."));
      if (consentLost(before, S.st.case)) toast(tr("Die Freigabe ist aufgehoben, weil sich der Inhalt geändert hat. Bitte erneut prüfen."), true);
    },
    run: ({ id, event }) => {
      if (S.run?.id !== id) return;
      S.run.events.push(event);
      renderRunInPlace();
    },
    run_started: async ({ id, task }) => {
      // The next step of a sequence replaces the view only if the user is following it.
      if (S.follow || !S.run) { S.run = { id, task, status: "running", events: [], usage: null }; S.showTrace = true; }
      await refresh();
    },
    usage: ({ id, usage }) => { if (S.run?.id === id) { S.run.usage = usage; renderRunInPlace(); } },
    // Word follows this window and can hand a passage across.
    clients: (clients) => { if (S.st) { const was = Boolean(S.st.clients?.word); S.st.clients = clients; if (was !== Boolean(clients.word)) render(); } },
    language: ({ language }) => { if (language !== LANG) { setLang(language); render(); } },
    show: ({ citation }) => { if (!S.st?.case) return; openCitation(citation); window.focus(); toast(tr("Aus Word: {w}", { w: refLabel(citation) })); },
    run_done: async ({ id }) => {
      const summary = await api(`/api/runs/${id}`);
      if (S.run?.id === id) S.run = summary;
      await refresh();
    },
  });
  await refresh();
}

// ---------------------------------------------------------------------------
function wordmark() {
  return h("div.wordmark", {}, h("img", { src: "icon.svg", alt: "" }), "CourtOS");
}

function langSelect() {
  return h("select.lang", { "aria-label": tr("Sprache"), onchange: (e) => { chooseLang(e.target.value); render(); } },
    LANGUAGES.map(([code, name]) => h("option", { value: code, selected: code === LANG }, name)));
}

/** Language and light/dark, side by side wherever the interface offers them. */
const prefs = () => h("div.prefs", {}, langSelect(), themeToggle());

function renderUnpaired() {
  app.replaceChildren(h("div.gate", {}, h("div.gate-inner", {},
    h("div.gate-top", {}, wordmark(), prefs()),
    h("div.welcome", {},
      h("h1", {}, tr("Diese Seite ist nicht verbunden.")),
      h("p.lede", {}, tr("CourtOS läuft auf diesem Computer. Öffnen Sie den Link, den CourtOS beim Start im Terminal anzeigt. Er verbindet einen Browser mit Ihrer lokalen Sitzung und gilt einmal. Für einen weiteren Browser starten Sie CourtOS neu.")),
    ),
  )));
}

function renderScanProgress() {
  const bar = document.querySelector(".scan-progress");
  if (!bar) return;
  const p = S.scan ?? {};
  const pct = p.phase === "extract" || p.phase === "ocr" ? Math.round((p.index / p.total) * 90) : p.phase === "detect" ? 95 : 100;
  bar.querySelector("span").style.width = `${pct}%`;
  const text = p.phase === "extract" ? tr("Liest Dokument {i} von {n}", { i: p.index, n: p.total })
    : p.phase === "ocr" ? trn(p.pages, "Erkennt Text in {n} gescannten Seite (lokal)", "Erkennt Text in {n} gescannten Seiten (lokal)")
    : p.phase === "detect" ? tr("citecheck sucht Namen und Kennnummern") : tr("Fertig");
  document.querySelector(".scan-label").textContent = text;
}

/** Where the user is: a re-render in the same place keeps the scroll position, a new place starts at the top. */
let lastPlace = null;
const place = () => [S.view, S.view === "read" ? S.reader?.doc : "", S.view === "work" ? S.run?.id ?? "" : ""].join("|");

function render() {
  const here = place();
  const scroll = here === lastPlace ? document.querySelector(".main")?.scrollTop ?? 0 : 0;
  lastPlace = here;
  if (!S.st.case) app.replaceChildren(renderWelcome());
  else app.replaceChildren(renderShell());
  const main = document.querySelector(".main");
  if (main) main.scrollTop = scroll;
  if (S.drawer) renderDrawer();
}

const LANGUAGE_NAME = Object.fromEntries(LANGUAGES);

const dateOf = (iso) => (iso ? new Date(iso).toLocaleDateString(`${LANG}-CH`, { day: "numeric", month: "short", year: "numeric" }) : "");

/** Opening, adding or leaving a case: a short busy state, then the new state from the server. */
const caseAction = (fn) => async () => {
  S.busy = true; render();
  await attempt(fn);
  S.busy = false; S.view = null; S.register = null; S.run = null;
  await refresh();
};

/** The start page: the cases on this computer, a case being added, and the sample dossiers. */
function renderWelcome() {
  const cases = S.st.cases ?? [];
  const samples = S.st.samples ?? [];
  const pending = S.st.pending;
  const add = caseAction(() => api("/api/cases/source", { method: "POST" }));
  return h("div.gate", {}, h("div.gate-inner.welcome", {},
    h("div.gate-top", {}, wordmark(), prefs()),
    h("div.cases-head", {},
      h("h1", {}, tr("Fälle")),
      pending ? null : h("button.btn.primary", { type: "button", onclick: add, disabled: S.busy }, icon("plus"), tr("Fall hinzufügen"))),
    !cases.length && !pending ? h("p.lede", {}, tr("Ein Fall verbindet den Ordner mit den Akten mit einem Arbeitsordner auf diesem Computer. CourtOS liest die Akten nur; Register, Fallgedächtnis, Ergebnisse und Arbeitsprodukte legt es im Arbeitsordner ab. Ein Sprachmodell Ihrer Wahl arbeitet mit der anonymisierten Fassung, und jede Aussage führt zurück zur Originalstelle.")) : null,
    S.busy ? h("div", {}, h("div.progress-line.scan-progress", {}, h("span", { style: { width: "4%" } })), h("p.scan-label.muted", { style: { marginTop: "8px", fontSize: "13px" } }, tr("Ordner wird geöffnet"))) : null,
    pending ? renderPendingCase(pending) : null,
    cases.length ? h("ul.case-list", { "aria-label": tr("Fälle") }, cases.map(renderCaseRow)) : null,
    !cases.length && !pending ? h("ul.promises", {},
      h("li", {}, icon("doc"), h("span", {}, h("b", {}, tr("Originale bleiben, wo sie sind. ")), tr("Auch auf einem Netzlaufwerk: CourtOS liest sie nur."))),
      h("li", { class: "local" }, icon("lock"), h("span", {}, h("b", {}, tr("Anonymisiert wird hier, mit citecheck. ")), h("span.muted", {}, tr("Das Register mit den echten Namen bleibt im Arbeitsordner auf diesem Computer.")))),
      h("li", { class: "external" }, icon("out"), h("span", {}, h("b", {}, tr("Das Modell liest erst nach Ihrer Freigabe. ")), h("span.muted", {}, tr("Und nur die anonymisierte Fassung. Jede gesendete Anfrage können Sie nachlesen.")))),
    ) : null,
    samples.length ? h("section.samples", { "aria-labelledby": "samples-title" },
      h("h2", { id: "samples-title" }, tr("Beispieldossiers")),
      h("p.muted", {}, tr("Erfundene Fälle mit Rechtsschriften und Beilagen, an verschiedenen Gerichten und in den Sprachen der Verfahren. Alle Namen, Firmen und Zahlen sind fiktiv.")),
      h("ul.sample-list", {}, samples.map(sample => h("li", {},
        h("button.sample", { type: "button", disabled: S.busy, onclick: caseAction(() => api("/api/folder", { method: "POST", body: { sample: sample.id } })) },
          h("span.sample-court", { lang: sample.language }, sample.court),
          h("span.sample-matter", { lang: sample.language }, sample.matter),
          h("span.sample-meta", {}, h("span", { lang: sample.language }, LANGUAGE_NAME[sample.language] ?? sample.language), sample.offline ? ` · ${tr("kurzer Fall, läuft auch ohne Modell")}` : ""),
        ))))) : null,
  ));
}

/** A case being added: where the originals are, and where CourtOS will keep its work. */
function renderPendingCase(p) {
  const step = (path, body) => caseAction(() => api(path, { method: "POST", body }));
  return h("section.case-new", { "aria-labelledby": "case-new-title" },
    h("h2", { id: "case-new-title" }, tr("Neuer Fall: {n}", { n: p.name })),
    h("dl.places", {},
      h("dt", {}, tr("Akten")), h("dd", {}, h("span.path", {}, p.source), h("span.muted", {}, tr("werden nur gelesen"))),
      h("dt", {}, tr("Arbeitsordner")), h("dd", {}, h("span.path", {}, p.work),
        h("span.muted", {}, p.same_folder ? tr("im Aktenordner, Unterordner .courtos") : tr("Register, Fallgedächtnis, Ergebnisse und Arbeitsprodukte")))),
    p.sync ? h("p.warning", {}, tr("Dieser Arbeitsordner wird mit einem Cloud-Dienst synchronisiert, und mit ihm das Register mit den echten Namen. Wählen Sie besser einen Ordner, der nur auf diesem Computer liegt.")) : null,
    h("div.case-new-actions", {},
      h("button.btn.primary", { type: "button", disabled: S.busy, onclick: step("/api/cases/create") }, tr("Fall anlegen")),
      h("button.btn", { type: "button", disabled: S.busy, onclick: step("/api/cases/pending/work") }, icon("folder"), tr("Anderen Arbeitsordner wählen")),
      p.same_folder ? null : h("button.btn.quiet", { type: "button", disabled: S.busy, onclick: step("/api/cases/pending/work", { same: true }) }, tr("Im Aktenordner arbeiten")),
      h("button.btn.quiet", { type: "button", disabled: S.busy, onclick: step("/api/cases/pending/cancel") }, tr("Abbrechen"))));
}

function renderCaseRow(c) {
  const facts = [
    c.language ? h("span", { lang: c.language }, LANGUAGE_NAME[c.language] ?? c.language) : null,
    c.started ? trn(c.documents, "{n} Dokument", "{n} Dokumente") : tr("noch nicht eingelesen"),
    c.released_for ? tr("Modell: {m}", { m: modelLabel(c.released_for) }) : null,
    c.runs ? trn(c.runs, "{n} Analyse, zuletzt am {d}", "{n} Analysen, zuletzt am {d}", { d: dateOf(c.last_run) }) : null,
  ].filter(Boolean);
  const remove = () => { if (confirm(tr("«{n}» aus der Liste entfernen? Akten und Arbeitsordner bleiben unverändert.", { n: c.name }))) caseAction(() => api("/api/cases/remove", { method: "POST", body: { id: c.id } }))(); };
  return h("li", {},
    h("button.case-open", { type: "button", disabled: S.busy || !c.source_available, onclick: caseAction(() => api("/api/cases/open", { method: "POST", body: { id: c.id } })) },
      h("span.case-title", {}, c.name),
      h("span.case-facts", {}, facts.flatMap((f, i) => i ? [" · ", f] : [f])),
      !c.source_available ? h("span.alert", {}, tr("Akten nicht erreichbar. Ist das Laufwerk verbunden?")) : null,
      c.sync ? h("span.alert", {}, tr("Arbeitsordner wird mit einem Cloud-Dienst synchronisiert")) : null,
      h("span.case-work", {}, tr("Akten: {p}", { p: c.source })),
      h("span.case-work", {}, c.same_folder ? tr("Arbeitsordner: im Aktenordner") : tr("Arbeitsordner: {p}", { p: c.work }))),
    h("div.case-actions", {},
      c.opened ? h("span.faint", {}, tr("geöffnet am {d}", { d: dateOf(c.opened) })) : null,
      h("button.link", { type: "button", onclick: () => attempt(() => api("/api/cases/reveal", { method: "POST", body: { id: c.id, place: "work" } })) }, tr("Arbeitsordner zeigen")),
      h("button.link", { type: "button", onclick: remove }, tr("Aus der Liste entfernen"))));
}

/** In the case: where the originals and the work are, with the move of the work folder. */
function renderPlaces() {
  const c = S.st.case;
  const reveal = (place) => attempt(() => api("/api/cases/reveal", { method: "POST", body: { id: c.id, place } }));
  const move = async () => { await attempt(() => api("/api/cases/move", { method: "POST", body: { id: c.id } })); await refresh(); };
  return h("section.places-block", { "aria-labelledby": "places-title" },
    h("h2", { id: "places-title" }, tr("Ablage")),
    h("dl.places", {},
      h("dt", {}, tr("Akten")), h("dd", {}, h("span.path", {}, c.root), h("button.link", { type: "button", onclick: () => reveal("source") }, tr("Zeigen"))),
      h("dt", {}, tr("Arbeitsordner")), h("dd", {}, h("span.path", {}, c.same_folder ? `${c.work} (.courtos)` : c.work),
        h("button.link", { type: "button", onclick: () => reveal("work") }, tr("Zeigen")),
        c.sample ? null : h("button.link", { type: "button", onclick: move }, tr("Verschieben …"))),
      h("dt", {}, tr("Arbeitsprodukte")), h("dd", {}, c.products ? h("span.path", {}, c.products) : h("span.muted", {}, tr("entstehen mit der ersten Analyse")),
        h("button.link", { type: "button", onclick: () => reveal("products") }, tr("Zeigen")),
        c.products_failed ? h("p.alert", {}, tr("Die Word- und Markdown-Dateien konnten nicht in den Ordner der Arbeitsprodukte geschrieben werden. Die Ergebnisse bleiben in CourtOS. Ist der Ordner schreibgeschützt oder das Laufwerk voll?"), " ", h("button.link", { type: "button", onclick: () => attempt(async () => { await api("/api/products/retry", { method: "POST" }); await refresh(); }) }, tr("Erneut versuchen"))) : null)),
    h("p.note", {}, tr("Jede Analyse wird als Markdown-Datei abgelegt, die Würdigung zusätzlich als Word-Dokument mit Fussnoten; die Dateien enthalten die echten Namen. Register, Fallgedächtnis und Notizen liegen im Unterordner .courtos. Word zeigt denselben Fall wie dieses Fenster.")));
}

// ---------------------------------------------------------------------------
function renderShell() {
  const c = S.st.case;
  const consent = c.consent_valid
    ? h("span.external", {}, icon("out"), tr("Für {m} freigegeben", { m: modelLabel(c.consent) }))
    : h("span", {}, icon("lock"), c.consent?.stale ? tr("Freigabe aufgehoben") : tr("Nicht freigegeben"));
  return h("div.shell", {},
    h("header.topbar", {},
      wordmark(),
      h("div.case-head", {},
      h("span.case-name", {}, c.name),
      h("div.status", {},
        h("span.local", {}, icon("lock"), trn(c.register.replace, "{n} Angabe wird lokal ersetzt", "{n} Angaben werden lokal ersetzt")),
        consent,
        S.st.current ? h("button.external.live-dot", { type: "button", title: tr("Laufenden Auftrag ansehen"), onclick: () => openRun(S.st.current, { follow: true }) }, tr("Das Modell arbeitet")) : null,
        c.sync ? h("span.alert", {}, tr("Ordner wird mit einem Cloud-Dienst synchronisiert")) : null,
        c.products_failed ? h("button.link.alert", { type: "button", onclick: () => { S.view = "docs"; render(); } }, tr("Dateien nicht gespeichert")) : null,
      )),
      h("span.spacer"),
      prefs(),
      S.st.clients?.word ? h("span.word-on", { title: tr("Word folgt diesem Fenster: Belege öffnen sich hier, Aussagen lassen sich in Word einfügen.") }, icon("check"), tr("Word verbunden"))
        : h("button.btn.small.quiet", { type: "button", onclick: pairWord }, tr("Word verbinden")),
      h("button.btn.small.quiet", { type: "button", onclick: caseAction(() => api("/api/cases/close", { method: "POST" })) }, tr("Alle Fälle")),
    ),
    renderRail(),
    h("main.main", {},
      renderTabs(),
      ({ docs: renderDocs, privacy: renderPrivacy, work: renderWork, research: renderResearch, notes: renderNotes, procedure: renderProcedure, read: renderReader }[S.view] ?? renderWork)(),
    ),
  );
}

const modelName = (id) => MODELS.find(([m]) => m === id)?.[1] ?? id;
// Suggestions for an OpenAI-compatible endpoint; any https address, or http on this computer, is accepted.
const ENDPOINTS = [["http://localhost:11434/v1", "Ollama"], ["http://localhost:1234/v1", "LM Studio"], ["http://localhost:8000/v1", "vLLM"], ["https://api.openai.com/v1", "OpenAI"], ["https://api.mistral.ai/v1", "Mistral"], ["https://openrouter.ai/api/v1", "OpenRouter"]];
const isLocal = (endpoint) => { try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(endpoint).hostname); } catch { return false; } };
/** A release or run names a model and, unless it is Anthropic, the endpoint it went to. */
const modelLabel = ({ model, endpoint }) => endpoint ? `${model} · ${isLocal(endpoint) ? tr("auf diesem Computer") : new URL(endpoint).hostname}` : modelName(model);

function renderRail() {
  const c = S.st.case;
  return h("nav.rail", { "aria-label": tr("Dokumente") },
    ROLE_GROUPS.map(([title, roles]) => {
      const docs = c.sources.filter(s => roles.includes(s.role));
      if (!docs.length) return null;
      return [h("h2", {}, tr(title)), docs.map(s => h("button.doc-row", {
        type: "button", class: s.include ? null : "excluded", "aria-current": S.view === "read" && S.reader?.doc === s.id ? "true" : null,
        onclick: () => openReader(s.id),
      },
        h("span.label", {}, s.label ?? s.name),
        h("span.pages", {}, s.pages ? pg(`${s.pages} S.`) : ""),
        h("span.name", {}, s.name),
        s.status !== "ok" ? h("span.warn", {}, s.status === "unsupported" ? tr("Format nicht unterstützt") : tr("Nicht lesbar")) :
          s.text_pages < s.pages ? h("span.warn", {}, trn(s.pages - s.text_pages, "{n} Seite ohne Text", "{n} Seiten ohne Text"))
          : s.ocr_pages ? h("span.ocr", {}, trn(s.ocr_pages, "{n} Seite per Texterkennung", "{n} Seiten per Texterkennung")) : null,
      ))];
    }),
    c.missing.length ? h("p.missing-note", {}, tr("Nicht mehr im Ordner: {l}", { l: c.missing.map(m => m.name).join(", ") })) : null,
  );
}

function renderTabs() {
  const c = S.st.case;
  const tabs = [
    ["docs", "Akten", null],
    ["privacy", "Schutz", c.consent_valid ? "✓" : null],
    ["work", "Analyse", null],
    ["research", "Recherche", null],
    ["notes", "Notizen", c.notes.length ? String(c.notes.length) : null],
    ["procedure", "Verfahren", c.procedure.deadlines.filter(d => d.status === "open").length ? String(c.procedure.deadlines.filter(d => d.status === "open").length) : null],
  ];
  return h("div.steps", { role: "tablist" }, tabs.map(([id, name, badge]) => h("button", {
    type: "button", role: "tab", "aria-selected": (S.view === "read" ? "docs" : S.view) === id ? "true" : "false",
    onclick: async () => { S.view = id; if (id === "privacy") S.register = (await api("/api/register")).entities; render(); },
  }, tr(name), badge ? h("span.n", { class: badge === "✓" ? "done" : null }, badge) : null)));
}

// --- Akten ------------------------------------------------------------------
function renderDocs() {
  const c = S.st.case;
  const change = (id, patch) => attempt(async () => { await api(`/api/sources/${id}`, { method: "POST", body: patch }); S.register = null; S.views.clear(); await refresh(); });
  const roles = ["claim", "response", "submission", "exhibit", "literature", "authority", "internal_note", "other"];
  const partyOptions = [["", tr("keine")], ...c.parties.map(p => [p.id, partyLabel(S.st, p.id)])];
  return h("section.pane", {},
    h("header", {}, h("h1", {}, tr("Akten und Parteien")), h("p", {}, tr("Rolle und Partei sind Vorschläge aus Dateinamen und Text. Sie bestimmen, wem eine Aussage zugerechnet wird. Korrigieren Sie, was nicht stimmt."))),
    renderPlaces(),
    renderCaseLanguage(),
    renderParties(),
    h("table.docs", {},
      h("thead", {}, h("tr", {}, [tr("Bezeichnung"), tr("Rolle"), tr("Partei"), tr("Seiten"), tr("Einbeziehen")].map(x => h("th", {}, x)))),
      h("tbody", {}, c.sources.map(s => h("tr", {},
        h("td", {}, s.status === "ok" ? h("button.link.doc-open", { type: "button", onclick: () => openReader(s.id) }, s.label ?? s.name) : h("b", {}, s.label ?? "–"), h("div.file", {}, s.rel_path)),
        h("td", {}, h("select", { "aria-label": tr("Rolle von {l}", { l: s.label }), disabled: s.status !== "ok", onchange: (e) => change(s.id, { role: e.target.value }) },
          roles.map(r => h("option", { value: r, selected: s.role === r }, label("role", r))))),
        h("td", {}, h("select", { "aria-label": tr("Partei von {l}", { l: s.label }), disabled: s.status !== "ok", onchange: (e) => change(s.id, { party: e.target.value || null }) },
          partyOptions.map(([v, l]) => h("option", { value: v, selected: (s.party ?? "") === v }, l)))),
        h("td.num", {}, s.status === "ok" ? `${s.text_pages} / ${s.pages}${s.ocr_pages ? ` (${tr("{n} OCR", { n: s.ocr_pages })})` : ""}` : s.status === "unsupported" ? tr("Format") : "–"),
        h("td", {}, h("input", { type: "checkbox", checked: s.include, disabled: s.status !== "ok", "aria-label": tr("{l} einbeziehen", { l: s.label }), onchange: (e) => change(s.id, { include: e.target.checked }) })),
      ))),
    ),
    h("p.note", { style: { marginTop: "12px" } }, tr("Eine interne Notiz des Gerichts liest das Modell als Kontext, wie Ihre Notizen: Sie kann eine Überlegung leiten, aber nie als Beleg dienen."), " ", tr("Seiten: lesbare von allen Seiten. Gescannte Seiten erkennt CourtOS lokal (Texterkennung); das Modell sieht dann den erkannten Text. Was nicht lesbar ist, wird in jedem Ergebnis als nicht ausgewertet ausgewiesen.")),
  );
}

function renderCaseLanguage() {
  const c = S.st.case;
  const set = (code) => attempt(async () => { await api("/api/case/language", { method: "POST", body: { language: code } }); S.register = null; S.views.clear(); await refresh(); });
  return h("div.case-language", {},
    h("h2", {}, tr("Verfahrenssprache")),
    h("div.row", {},
      h("select", { "aria-label": tr("Verfahrenssprache"), onchange: (e) => set(e.target.value) },
        LANGUAGES.map(([code, name]) => h("option", { value: code, selected: c.language?.code === code }, name))),
      c.language?.source === "detected" ? h("span.faint", {}, tr("aus den Rechtsschriften erkannt")) : null),
    h("p.note", {}, tr("Bezeichnungen der Akten, Seitenangaben und Ersatzbezeichnungen folgen der Verfahrenssprache; Beilagennummern bleiben, wie die Parteien sie vergeben haben. Ein Wechsel ändert die anonymisierte Fassung und hebt die Freigabe auf.")),
  );
}

function renderParties() {
  const c = S.st.case;
  const entities = (S.register ?? []).filter(e => ["person", "organisation"].includes(e.kind));
  const parties = c.parties.map(({ id, role, entity, gender }) => ({ id, role, entity, gender: gender ?? null }));
  const save = () => attempt(async () => { await api("/api/parties", { method: "POST", body: { parties } }); await refresh(); });
  // Choosing one side of a pair (Gesuchstellerin) moves a party still on the
  // old pair's other side (Beklagte) to the new counterpart (Gesuchsgegnerin).
  const setRole = (i, role) => {
    const before = parties[i].role;
    parties[i].role = role;
    for (const other of parties) if (other !== parties[i] && COUNTERPART[before] && other.role === COUNTERPART[before] && COUNTERPART[role]) other.role = COUNTERPART[role];
    save();
  };
  const genders = [["", tr("Form automatisch")], ["f", tr("weiblich")], ["m", tr("männlich")]];
  if (!S.register) api("/api/register").then(r => { S.register = r.entities; render(); });
  return h("div.parties", {},
    h("h2", {}, tr("Parteien")),
    parties.map((party, i) => h("div.party-row", {},
      h("b", {}, party.id),
      h("select", { "aria-label": tr("Rolle von {p}", { p: party.id }), onchange: (e) => setRole(i, e.target.value) }, PARTY_ROLES.map(r => h("option", { value: r, selected: party.role === r }, partyTermLabel(LANG, r, c.parties[i].gender_used ?? null)))),
      h("select", { "aria-label": tr("Grammatikalische Form von {p}", { p: party.id }), onchange: (e) => { parties[i].gender = e.target.value || null; save(); } }, genders.map(([value, text]) => h("option", { value, selected: (party.gender ?? "") === value }, text))),
      h("select", { "aria-label": tr("Name von {p}", { p: party.id }), onchange: (e) => { parties[i].entity = e.target.value || null; save(); } },
        h("option", { value: "" }, tr("Name aus dem Register (optional)")),
        entities.map(e => h("option", { value: e.id, selected: party.entity === e.id }, `${e.label} → ${e.replacement}`))),
      parties.length > 1 ? h("button.btn.small.quiet", { type: "button", "aria-label": tr("{p} entfernen", { p: party.id }), onclick: () => { parties.splice(i, 1); save(); } }, icon("cross")) : null,
    )),
    parties.length < 9 ? h("button.btn.small", { type: "button", onclick: () => { parties.push({ role: "other", entity: null }); save(); } }, icon("plus"), tr("Partei hinzufügen")) : null,
    h("p.note", {}, tr("Das Modell sieht P1, P2 …, die Rolle und den Namen nur in der ersetzten Form (z. B. A.________ AG). Der echte Name bleibt lokal und erscheint in Ihren Entwürfen.")),
  );
}

// --- Schutz ------------------------------------------------------------------
function renderPrivacy() {
  const c = S.st.case;
  const register = S.register ?? [];
  const replaced = register.filter(e => e.decision === "replace").length;
  const report = c.anonymisation;
  return h("section.pane", {},
    h("header", {},
      h("h1", {}, trn(replaced, "{n} Angabe wird ersetzt, bevor das Modell etwas sieht.", "{n} Angaben werden ersetzt, bevor das Modell etwas sieht.")),
      h("p", {}, tr("citecheck zeigt alles, was eine Person erkennbar machen kann, und erklärt den Rest (gewöhnliche Wörter, Zahlen, öffentliche Ämter). Abwählen, was lesbar bleiben soll; ergänzen, was fehlt. Die Vorschau zeigt jede Seite so, wie das Modell sie lesen würde.")),
      report ? h("p.engine", {}, icon("check"), tr("Geprüft mit citecheck, Wortliste vom {d} ({w} Wörter).", { d: formatDate(report.vocabulary?.generated), w: (report.vocabulary?.words ?? 0).toLocaleString("de-CH") }),
        report.unassessed ? ` ${trn(report.unassessed, "{n} einzelnes unbekanntes Wort in Kleinschreibung wurde gezählt, nicht gezeigt.", "{n} einzelne unbekannte Wörter in Kleinschreibung wurden gezählt, nicht gezeigt.")}` : "") : null,
    ),
    h("div.privacy", {},
      h("div.register", {}, KIND_GROUPS.map(([title, kinds]) => {
        const entities = register.filter(e => kinds.includes(e.kind));
        if (!entities.length) return null;
        return h("div.register-group", {}, h("h2", {}, h("span", {}, tr(title)), h("span", {}, String(entities.length))), entities.map(renderEntity));
      }), renderAddEntity()),
      renderPreview(),
    ),
    renderRelease(c, replaced),
  );
}

function registerChange(change) {
  return attempt(async () => {
    await api("/api/register", { method: "POST", body: change });
    S.views.clear(); S.occurrences.clear();
    S.register = (await api("/api/register")).entities;
    S.st = await api("/api/state");
    render();
  });
}

async function loadOccurrences(id) {
  S.occurrences.set(id, null);
  const { occurrences } = await api(`/api/register/${id}/occurrences`);
  S.occurrences.set(id, occurrences);
  render();
}

function renderEntity(entity) {
  const open = S.expanded.has(entity.id);
  const toggle = () => {
    if (open) S.expanded.delete(entity.id); else { S.expanded.add(entity.id); if (!S.occurrences.has(entity.id) && entity.decision === "replace") attempt(() => loadOccurrences(entity.id)); }
    render();
  };
  const occurrences = S.occurrences.get(entity.id);
  return h("div.entity", { class: entity.decision === "keep" ? "keep" : null },
    h("div.entity-head", {},
      h("input", { type: "checkbox", checked: entity.decision === "replace", "aria-label": tr("{l} ersetzen", { l: entity.label }), onchange: (e) => registerChange({ op: "decision", id: entity.id, decision: e.target.checked ? "replace" : "keep" }) }),
      h("button.link.entity-name", { type: "button", "aria-expanded": open ? "true" : "false", onclick: toggle },
        h("span.orig", {}, entity.label, h("small", {}, `${entity.count}×`), entity.source === "courtos" ? h("small.src", {}, tr("ergänzt")) : null)),
      h("input.pseudo-input", { value: entity.replacement, "aria-label": tr("Ersatz für {l}", { l: entity.label }), onchange: (e) => registerChange({ op: "replacement", id: entity.id, replacement: e.target.value }) }),
    ),
    renderOcrReading(entity),
    open ? h("div.entity-more", {},
      (entity.notes ?? []).filter(n => NOTES[n]).map(n => h("p.note.amber", {}, tr(NOTES[n]))),
      h("div.aliases", {}, entity.aliases.map(alias => h("span.alias", {}, alias, entity.aliases.length > 1 ? h("button", { type: "button", "aria-label": tr("Schreibweise {a} entfernen", { a: alias }), onclick: () => registerChange({ op: "remove_alias", id: entity.id, alias }) }, "×") : null))),
      h("form.inline-form", { onsubmit: (e) => { e.preventDefault(); const v = e.target.alias.value; if (v.trim()) registerChange({ op: "add_alias", id: entity.id, alias: v }); } },
        h("input", { name: "alias", placeholder: tr("Weitere Schreibweise, z. B. Initialen") }),
        h("button.btn.small", { type: "submit" }, tr("Hinzufügen"))),
      entity.decision === "replace" ? h("div.occurrences", {},
        h("h4", {}, tr("Stellen")),
        occurrences === null || occurrences === undefined ? h("p.note", {}, tr("Lädt …")) :
          occurrences.length ? occurrences.slice(0, 60).map(o => h("label.occ", { class: o.kept ? "kept" : null },
            h("input", { type: "checkbox", checked: !o.kept, "aria-label": tr("Diese Stelle ersetzen"), onchange: (e) => attempt(async () => {
              await api("/api/register/occurrence", { method: "POST", body: { id: entity.id, doc: o.doc, page: o.page, start: o.start, keep: !e.target.checked } });
              S.views.clear(); await loadOccurrences(entity.id); S.st = await api("/api/state"); render();
            }) }),
            h("span.where", {}, pg(`${o.label}, S. ${o.page}`)),
            h("span.ctx", {}, "…", o.before.slice(-50), h("mark", {}, o.original), o.after.slice(0, 50), "…"))) : h("p.note", {}, tr("Keine Stelle in den einbezogenen Akten.")),
        occurrences?.length > 60 ? h("p.note", {}, tr("{n} weitere Stellen.", { n: occurrences.length - 60 })) : null,
        h("p.note", {}, tr("Abgewählte Stellen bleiben im Original stehen, zum Beispiel «Mai» als Monat.")),
      ) : null,
    ) : null,
  );
}

// A word text recognition damaged ("Ruge" for "Rüge"): after looking at the
// passage, the user may let Claude read the repaired word instead of a letter.
function renderOcrReading(entity) {
  if (entity.decision !== "replace" || (!entity.read_as && !entity.readings?.length)) return null;
  const sample = entity.samples?.[0];
  const passage = sample ? h("span.ctx", {}, sample.before.slice(-40), h("mark", {}, sample.match), sample.after.slice(0, 40)) : null;
  if (entity.read_as) {
    return h("div.ocr-fix.done", {},
      h("p", {}, icon("check"), " ", tr("Das Modell liest hier das Wort «{w}».", { w: entity.read_as })),
      h("button.link", { type: "button", onclick: () => registerChange({ op: "read_as_word", id: entity.id, reading: null }) }, tr("Doch als Name ersetzen")));
  }
  return h("div.ocr-fix", { id: `ocr-${entity.id}` },
    passage ? h("p", {}, passage) : null,
    h("p.note", {}, tr("Texterkennung? Mit Umlaut steht hier ein gewöhnliches Wort.")),
    h("div.inline-form", {}, entity.readings.map(word => h("button.btn.small", { type: "button", onclick: () => registerChange({ op: "read_as_word", id: entity.id, reading: word }) }, tr("Als «{w}» lesen", { w: word })))));
}

function renderAddEntity() {
  return h("div.register-group", {},
    h("h2", {}, h("span", {}, tr("Weitere Angabe ersetzen"))),
    h("form.inline-form", { onsubmit: (e) => { e.preventDefault(); const text = e.target.text.value; if (text.trim()) registerChange({ op: "add_entity", kind: e.target.kind.value, text }); } },
      h("input", { name: "text", placeholder: tr("Genau so, wie es in den Akten steht") }),
      h("select", { name: "kind", "aria-label": tr("Art") }, ["person", "organisation", "address", "place", "parcel", "email", "phone", "iban", "ahv", "number"].map(k => h("option", { value: k }, label("kind", k)))),
      h("button.btn.small", { type: "submit" }, tr("Ersetzen"))),
    h("p.note", { style: { marginTop: "8px" } }, tr("citecheck beurteilt nicht, ob mehrere gewöhnliche Angaben zusammen (Alter, Ort, Beruf) eine Person erkennbar machen. Prüfen Sie die Vorschau.")),
  );
}

async function viewFor(doc) {
  const key = `${doc}:${S.st.case.mirror.sha256}`;
  if (!S.views.has(key)) S.views.set(key, await api(`/api/view/${doc}`));
  return S.views.get(key);
}

function renderPreview() {
  const c = S.st.case;
  const docs = c.sources.filter(s => s.include && s.status === "ok");
  if (!S.preview.doc || !docs.some(d => d.id === S.preview.doc)) S.preview.doc = docs[0]?.id ?? null;
  const box = h("div.preview", {});
  if (!S.preview.doc) return box;
  const doc = docs.find(d => d.id === S.preview.doc);
  const setMode = (mode) => {
    S.preview.mode = mode;
    const text = box.querySelector(".page-text");
    text?.classList.toggle("view-original", mode === "original");
    text?.classList.toggle("view-mirror", mode === "mirror");
    box.querySelectorAll(".veil-toggle button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === mode ? "true" : "false"));
  };
  box.append(h("div.preview-bar", {},
    h("select", { "aria-label": tr("Dokument"), onchange: (e) => { S.preview.doc = e.target.value; S.preview.page = 1; render(); } }, docs.map(d => h("option", { value: d.id, selected: d.id === doc.id }, `${d.label} – ${d.name}`))),
    h("select", { "aria-label": tr("Seite"), onchange: (e) => { S.preview.page = Number(e.target.value); render(); } }, Array.from({ length: doc.pages }, (_, i) => h("option", { value: i + 1, selected: S.preview.page === i + 1 }, pg(`S. ${i + 1}`)))),
    h("div.veil-toggle", { role: "group", "aria-label": tr("Ansicht") },
      h("button.o", { type: "button", dataset: { mode: "original" }, "aria-pressed": S.preview.mode === "original" ? "true" : "false", onclick: () => setMode("original") }, icon("lock"), tr("Original")),
      h("button.d", { type: "button", dataset: { mode: "mirror" }, "aria-pressed": S.preview.mode === "mirror" ? "true" : "false", onclick: () => setMode("mirror") }, icon("eye"), tr("Was das Modell liest"))),
  ));
  const holder = h("div", {}, h("div.page-text.empty", {}, tr("Lädt …")));
  box.append(holder);
  viewFor(doc.id).then(view => {
    const page = view.pages.find(p => p.n === S.preview.page) ?? view.pages[0];
    holder.replaceChildren(
      page.has_text ? veiledText(page, S.preview.mode) : h("div.page-text.empty", {}, tr("Diese Seite hat keinen lesbaren Text. Das Modell sieht sie nicht; Ergebnisse weisen sie als nicht ausgewertet aus.")),
      h("p.page-caption", {}, page.has_text ? [trn(page.spans.length, "{n} Ersetzung auf dieser Seite. Grün: bleibt hier. Violett: so liest es das Modell.", "{n} Ersetzungen auf dieser Seite. Grün: bleibt hier. Violett: so liest es das Modell."), page.mirror?.ocr ? ` ${tr("Text per Texterkennung aus dem Scan; mit dem Original vergleichen.")}` : ""] : ""),
    );
  }).catch(() => holder.replaceChildren(h("div.page-text.empty", {}, tr("Die Seite konnte nicht geladen werden."))));
  return box;
}

function veiledText(page, mode) {
  const original = Array.from(page.original);
  const spans = [...page.spans].sort((a, b) => a.o[0] - b.o[0]);
  const el = h("div.page-text", { class: mode === "original" ? "view-original" : "view-mirror", tabindex: "0" });
  let cursor = 0, i = 0;
  for (const span of spans) {
    if (span.o[0] > cursor) el.append(original.slice(cursor, span.o[0]).join(""));
    el.append(h("span.pz", { style: { "--i": String(i++) } },
      h("span.o", {}, original.slice(span.o[0], span.o[1]).join("")),
      h("span.d", {}, span.replacement)));
    cursor = span.o[1];
  }
  if (cursor < original.length) el.append(original.slice(cursor).join(""));
  return el;
}

function renderRelease(c, replaced) {
  if (c.consent_valid) {
    return h("div.release.done", {},
      h("h2", {}, icon("check"), tr("Freigegeben für {m}", { m: modelLabel(c.consent) })),
      h("p", {}, tr("Seit {d}. Ändern sich Akten oder Register, wird die Freigabe automatisch aufgehoben.", { d: new Date(c.consent.at).toLocaleString(`${LANG}-CH`) })),
      memoryLine(c),
      h("div", { style: { marginTop: "12px", display: "flex", gap: "8px" } },
        h("button.btn.primary", { type: "button", onclick: () => { S.view = "work"; render(); } }, tr("Zur Analyse")),
        h("button.btn", { type: "button", onclick: () => attempt(async () => { await api("/api/revoke", { method: "POST" }); await refresh(); }) }, tr("Freigabe widerrufen"))),
    );
  }
  const prior = c.consent?.provider === "openai" ? c.consent : null;
  let model = prior ? "other" : c.consent?.model ?? MODELS[0][0], limit = 3000000;
  const endpointInput = h("input", { name: "endpoint", type: "url", list: "endpoints", value: prior?.endpoint ?? "", placeholder: "http://localhost:11434/v1", autocomplete: "off", spellcheck: "false" });
  const modelInput = h("input", { name: "model", value: prior?.model ?? "", placeholder: tr("z. B. llama3.3:70b, gpt-5, mistral-large-latest"), autocomplete: "off", spellcheck: "false" });
  const other = h("div.model-other", { hidden: model !== "other" },
    h("label", {}, tr("Adresse (OpenAI-kompatibel)"), endpointInput),
    h("datalist", { id: "endpoints" }, ENDPOINTS.map(([url, name]) => h("option", { value: url }, name))),
    h("label", {}, tr("Modellname"), modelInput),
    h("p.note", {}, tr("Mit einer Adresse auf diesem Computer (Ollama, LM Studio, vLLM) verlässt die anonymisierte Fassung den Computer nicht; hinaus gehen nur Suchbegriffe an OpenCaseLaw. Lokale Modelle brauchen ein Kontextfenster von mindestens 64 000 Tokens und Werkzeugaufrufe.")));
  const issues = c.issues ?? [];
  const blocked = issuePlaces(issues);
  const mem = c.memory?.findings || c.memory?.notes ? c.memory : null;
  const carry = h("input", { type: "checkbox", checked: !c.consent?.memory_off });
  const ocrWords = (S.register ?? []).filter(e => e.decision === "replace" && !e.read_as && e.readings?.length);
  const showEntity = (entity) => { S.expanded.add(entity.id); render(); document.getElementById(`ocr-${entity.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  return h("div.release", {},
    h("h2", {}, icon("out"), tr("Für dieses Modell freigeben")),
    h("p.lede-small", {}, tr("CourtOS ist an kein Modell gebunden: Claude, ein anderes Frontiermodell oder ein offenes Modell auf diesem Computer. Die Freigabe gilt für genau das gewählte Modell an genau dieser Adresse; jeder Wechsel verlangt eine neue Freigabe.")),
    ocrWords.length ? h("div.review-first", {},
      h("p", {}, trn(ocrWords.length, "Vorher ansehen: {n} Wort aus der Texterkennung ist vorsorglich ersetzt und fehlt dem Modell sonst im Text.", "Vorher ansehen: {n} Wörter aus der Texterkennung sind vorsorglich ersetzt und fehlen dem Modell sonst im Text.")),
      h("ul", {}, ocrWords.map(e => h("li", {}, h("button.link", { type: "button", onclick: () => showEntity(e) }, `${e.label} → ${e.readings.join(", ")}?`))))) : null,
    h("div.split", {},
      h("div", {}, h("h3.external", {}, icon("out"), tr("Das Modell darf lesen")), h("ul", {},
        h("li", {}, trn(c.mirror.sections, "{n} Seite der anonymisierten Fassung, mit neutralen Bezeichnungen (Klage, KB 1 …)", "{n} Seiten der anonymisierten Fassung, mit neutralen Bezeichnungen (Klage, KB 1 …)")),
        h("li", {}, tr("Ihre Fragen und ausgewählten Notizen, ebenfalls anonymisiert")),
        mem ? h("li", {}, memorySummary(c.memory), " ", h("button.link", { type: "button", onclick: () => openMemory("model") }, tr("Ansehen"))) : null,
        h("li", {}, tr("Für Rechtsfragen: Suchbegriffe an OpenCaseLaw und veröffentlichte Entscheide")))),
      h("div", {}, h("h3.local", {}, icon("lock"), tr("Bleibt auf diesem Computer")), h("ul", {},
        h("li", {}, trn(replaced, "Das Register mit {n} echten Angabe", "Das Register mit {n} echten Angaben")),
        h("li", {}, tr("Originaldateien, Dateinamen, Pfade und Scans")),
        h("li", {}, tr("Ihre Notizen, Fristen und Verfügungen")),
        mem ? h("li", {}, tr("Das Fallgedächtnis mit echten Namen (.courtos/memory)")) : null))),
    c.sync ? h("p.warning", {}, tr("Dieser Ordner liegt in einem synchronisierten Cloud-Ordner. Das Register in .courtos/private wird damit ebenfalls synchronisiert.")) : null,
    blocked.pages ? h("p.warning", {}, trn(blocked.pages, "Freigabe nicht möglich: Auf {n} Seite liess sich die Ersetzung nicht eindeutig durchführen. Prüfen Sie die betroffenen Schreibweisen.", "Freigabe nicht möglich: Auf {n} Seiten liess sich die Ersetzung nicht eindeutig durchführen. Prüfen Sie die betroffenen Schreibweisen.")) : null,
    blocked.labels ? h("p.warning", {}, trn(blocked.labels, "Freigabe nicht möglich: In {n} Bezeichnung eines Dokuments oder einer Partei steht noch eine registrierte Angabe.", "Freigabe nicht möglich: In {n} Bezeichnungen von Dokumenten oder Parteien stehen noch registrierte Angaben.")) : null,
    h("div.controls", {},
      h("label", {}, tr("Modell"), h("select", { onchange: (e) => { model = e.target.value; other.hidden = model !== "other"; if (model === "other") endpointInput.focus(); } },
        h("optgroup", { label: "Anthropic" }, MODELS.map(([id, name]) => h("option", { value: id, selected: id === model }, name))),
        h("option", { value: "other", selected: model === "other" }, tr("Anderes Modell, Cloud oder lokal …")))),
      h("label", {}, tr("Höchstens Tokens je Auftrag"), h("select", { onchange: (e) => { limit = Number(e.target.value); } }, [[1000000, "1 Mio."], [3000000, "3 Mio."], [8000000, "8 Mio."]].map(([v, l]) => h("option", { value: v, selected: v === limit }, l)))),
      other,
      mem ? h("label.carry", {}, carry, h("span", {}, tr("Fallgedächtnis mitgeben"), h("small", {}, tr("Das gewählte Modell setzt dort fort, wo frühere Läufe stehen, und prüft jede Stelle selbst an den Akten.")))) : null,
      h("button.btn.release", { type: "button", disabled: issues.length > 0 || !c.mirror.sections, onclick: () => attempt(async () => {
        const choice = model === "other" ? { provider: "openai", endpoint: endpointInput.value.trim(), model: modelInput.value.trim() } : { provider: "anthropic", model };
        await api("/api/release", { method: "POST", body: { ...choice, token_limit: limit, memory: mem ? carry.checked : true } });
        toast(tr("Freigegeben. {m} kann jetzt die anonymisierte Fassung lesen.", { m: modelLabel({ model: choice.model, endpoint: choice.endpoint ?? null }) }));
        S.view = "work";
        await refresh();
      }) }, tr("Für dieses Modell freigeben")),
    ),
    h("p.note", { style: { marginTop: "12px" } }, tr("Mit der Freigabe wird noch nichts gesendet. Gesendet wird erst, wenn Sie eine Analyse starten, und jede Anfrage wird vorher automatisch auf registrierte Originalangaben geprüft.")),
  );
}

// --- Fallgedächtnis ---------------------------------------------------------------
function memorySummary(m) {
  const models = [...new Set(m.runs.map(r => modelLabel(r)))];
  return [
    m.findings ? trn(m.findings, "Das Fallgedächtnis: {n} geprüfter Befund aus früheren Läufen", "Das Fallgedächtnis: {n} geprüfte Befunde aus früheren Läufen") : tr("Das Fallgedächtnis"),
    models.length ? ` (${models.join(", ")})` : "",
    m.notes ? trn(m.notes, ", dazu {n} übernommene Notiz", ", dazu {n} übernommene Notizen") : "",
    tr(", anonymisiert"),
  ].join("");
}

function memoryLine(c) {
  const m = c.memory;
  if (c.consent?.memory) {
    const findings = c.consent.memory.groups.reduce((n, g) => n + g.findings, 0);
    return h("p.memory-line", {}, icon("note"), trn(findings, "Mit Fallgedächtnis: {n} Befund.", "Mit Fallgedächtnis: {n} Befunde."), " ",
      h("button.link", { type: "button", onclick: () => openMemory("model") }, tr("Ansehen")),
      m?.pending ? [" · ", tr("Neue Ergebnisse sind noch nicht dabei."), " ", h("button.link", { type: "button", onclick: rerelease }, tr("Nachführen"))] : null);
  }
  if (m?.findings || m?.notes) return h("p.memory-line", {}, icon("note"), c.consent?.memory_off ? tr("Ohne Fallgedächtnis freigegeben.") : tr("Noch ohne Fallgedächtnis."), " ", h("button.link", { type: "button", onclick: rerelease }, tr("Mitgeben")));
  return null;
}

/** Release again for the same model, so the next run reads the current memory. */
function rerelease() {
  return attempt(async () => {
    const c = S.st.case.consent;
    await api("/api/release", { method: "POST", body: { provider: c.provider ?? "anthropic", ...(c.endpoint ? { endpoint: c.endpoint } : {}), model: c.model, token_limit: c.token_limit, memory: true } });
    await refresh();
    const findings = S.st.case.consent?.memory?.groups.reduce((n, g) => n + g.findings, 0) ?? 0;
    toast(trn(findings, "Fallgedächtnis nachgeführt: Es enthält jetzt {n} geprüften Befund.", "Fallgedächtnis nachgeführt: Es enthält jetzt {n} geprüfte Befunde."));
  });
}

/** memory.md as a page to read: headings, findings with their evidence beneath, the file references set back. */
function memoryDoc(markdown) {
  const inline = (text) => {
    const ref = text.match(/^(.*\S)\s(\([^()]*\))$/);
    const parts = (ref ? ref[1] : text).split(/\*\*(.+?)\*\*/).map((t, i) => (i % 2 ? h("strong", {}, t) : t));
    return ref ? [...parts, " ", h("span.where", {}, ref[2])] : parts;
  };
  const doc = h("div.memory-doc", {});
  let list = null;
  for (const line of markdown.split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("# ")) { list = null; continue; }
    if (line.startsWith("## ")) { doc.append(h("h3", {}, line.slice(3))); list = null; continue; }
    const sub = line.match(/^\s+- (.*)$/);
    if (sub && list?.lastElementChild) {
      const item = list.lastElementChild;
      const nested = item.querySelector("ul") ?? item.appendChild(h("ul", {}));
      nested.append(h("li", {}, inline(sub[1])));
      continue;
    }
    const top = line.match(/^- (.*)$/);
    if (top) { if (!list) doc.append(list = h("ul", {})); list.append(h("li", {}, inline(top[1]))); continue; }
    list = null;
    doc.append(h(/^(Lauf |Nicht aufgenommen|Mitgegeben|Noch nicht mitgegeben)/.test(line) ? "p.meta" : "p", {}, inline(line)));
  }
  return doc;
}

/** The memory twice: for the judge with real names, and exactly as a model reads it. */
async function openMemory(mode = "local") {
  const data = await api("/api/memory");
  const backdrop = h("div.modal-backdrop", { onclick: (e) => { if (e.target === backdrop) backdrop.remove(); } });
  const pre = h("div.memory-body", {});
  const model = data.released ?? data.preview;
  const show = (m) => {
    pre.replaceChildren(m === "local" ? memoryDoc(data.markdown) : h("pre.memory-text", {}, model ? model.groups.map(g => g.text).join("\n\n") : tr("Noch nichts, was ein Modell lesen würde.")));
    pre.scrollTop = 0;
    backdrop.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === m ? "true" : "false"));
  };
  backdrop.append(h("div.modal.memory", { role: "dialog", "aria-label": tr("Fallgedächtnis") },
    h("header", {}, h("h2", {}, tr("Fallgedächtnis")), h("button.btn.small.quiet", { type: "button", onclick: () => backdrop.remove(), "aria-label": tr("Schliessen") }, icon("cross"))),
    h("p.note", {}, tr("Nur Aussagen, deren Zitate wörtlich an unveränderten Seiten geprüft sind, und Ihre übernommenen oder bestrittenen Notizen. Ein Modell erhält das Gedächtnis als Wegweiser zu den Akten, nie als Beleg: Es liest jede Stelle selbst und zitiert die Akte.")),
    h("div.tabs", {},
      h("button.btn.small", { type: "button", dataset: { m: "local" }, onclick: () => show("local") }, tr("Für Sie, mit Namen")),
      h("button.btn.small", { type: "button", dataset: { m: "model" }, onclick: () => show("model") }, data.released ? tr("Was das Modell liest") : tr("Was ein Modell lesen würde"))),
    model?.withheld ? h("p.note", {}, trn(model.withheld, "{n} Zeile zurückgehalten, weil die Prüfung darin eine echte Angabe fand.", "{n} Zeilen zurückgehalten, weil die Prüfung darin echte Angaben fand.")) : null,
    pre));
  document.body.append(backdrop);
  show(mode);
}

// --- Analyse --------------------------------------------------------------------
function renderWork() {
  const c = S.st.case;
  const hasKey = Boolean(c.provider_ready);
  const endpoint = c.consent?.provider === "openai" ? c.consent.endpoint : null;
  const blocked = !c.consent_valid;
  const busy = Boolean(S.st.current);
  const useDemo = !hasKey && c.demo;
  const demoTasks = new Set(["chronology", "facts_evidence", "source_chat"]);
  const start = (body) => attempt(async () => {
    const { id } = await api("/api/runs", { method: "POST", body: { language: LANG, notes: [...S.selectedNotes], demo: useDemo, ...body } });
    S.run = { id, task: body.pipeline?.[0] ?? body.task, question: body.question, status: "running", events: [], usage: null, model: useDemo ? "demo-replay" : c.consent.model, endpoint: useDemo ? null : c.consent.endpoint ?? null };
    S.showTrace = true; S.follow = true;
    await refresh();
    document.querySelector(".main")?.scrollTo({ top: 0 });
  });
  if (S.run) return renderReading(S.run);
  const canRun = (task) => !blocked && !busy && (hasKey || (useDemo && demoTasks.has(task)));
  const assumptions = c.notes.filter(n => n.kind === "assumption");
  return h("section.pane", {},
    h("header", {}, h("h1", {}, tr("Analyse")), h("p", {}, tr("Das freigegebene Modell liest die anonymisierte Fassung über Werkzeuge: Überblick, Lesen, Suchen, OpenCaseLaw. CourtOS prüft jedes Zitat wörtlich, bevor ein Ergebnis erscheint."))),
    blocked ? h("p.warning", {}, c.consent?.stale ? tr("Die Freigabe ist aufgehoben, weil sich Akten oder Register geändert haben. Prüfen Sie den Schutz und geben Sie erneut frei.") : tr("Noch nicht freigegeben. Prüfen Sie zuerst den Schutz."), " ", h("button.link", { type: "button", onclick: async () => { S.view = "privacy"; S.register = (await api("/api/register")).entities; render(); } }, tr("Zum Schutz"))) : null,
    !blocked && c.memory?.pending ? h("p.memory-pending", {}, icon("note"), tr("Neue Ergebnisse seit der Freigabe sind noch nicht im Fallgedächtnis des Modells."), " ", h("button.link", { type: "button", onclick: rerelease }, tr("Nachführen"))) : null,
    !hasKey && (c.consent || c.demo) ? h("div.keybox", {},
      h("b", {}, c.demo ? tr("Ohne API-Schlüssel läuft das Beispieldossier als Demo.") : endpoint ? tr("Für {m} ist ein API-Schlüssel nötig.", { m: modelLabel(c.consent) }) : tr("Für Claude ist ein Anthropic-API-Schlüssel nötig.")),
      h("p.muted", {}, c.demo ? tr("Die Demo spielt aufgezeichnete Werkzeugaufrufe für drei Aufgaben ab, durch dieselbe Prüfung und Bindung an die Originale. Sie ist kein Modell.") : tr("Der Schlüssel wird nur auf diesem Computer gespeichert (~/.config/courtos).")),
      h("form.inline-form", { onsubmit: (e) => { e.preventDefault(); attempt(async () => { await api("/api/settings/key", { method: "POST", body: { key: e.target.key.value, ...(endpoint ? { endpoint } : {}) } }); toast(tr("Schlüssel gespeichert.")); await refresh(); }); } },
        h("input", { name: "key", type: "password", autocomplete: "off", placeholder: endpoint ? tr("API-Schlüssel") : "sk-ant-…", "aria-label": endpoint ? tr("API-Schlüssel") : tr("Anthropic-API-Schlüssel") }),
        h("button.btn.small", { type: "submit" }, tr("Speichern"))),
    ) : null,
    h("div.pipeline", {},
      h("div", {},
        h("h2", {}, tr("Fall erschliessen")),
        h("p", {}, tr("Nacheinander: Chronologie, Behauptungen und Beweise, Positionen, Rechtsargumente mit Rechtsprechung, Grundfragen. Jeder Schritt wird einzeln geprüft; ein Fehler hält die Reihe an."))),
      h("button.btn.primary", { type: "button", disabled: blocked || busy || !hasKey, onclick: () => start({ pipeline: PIPELINE }) }, icon("spark"), tr("Fall erschliessen")),
    ),
    h("div.tasks", {}, TASK_ORDER.map(task => {
      const latest = (S.st.runs ?? []).find(r => r.task === task && r.status === "succeeded");
      const action = useDemo && demoTasks.has(task) ? tr("Demo abspielen") : tr("Starten");
      let extra = null;
      if (task === "source_chat") extra = h("form.ask", { onsubmit: (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) start({ task, question: q }); } },
        h("input", { name: "q", placeholder: useDemo ? S.st.demo_question : tr("Zum Beispiel: Wann wurde der Mangel erstmals festgestellt?"), value: useDemo ? S.st.demo_question : "", "aria-label": tr("Frage an die Akten") }),
        h("button.btn.primary", { type: "submit", disabled: !canRun(task) }, useDemo ? action : tr("Fragen")));
      else if (task === "decision_draft") extra = h("form.ask", { onsubmit: (e) => { e.preventDefault(); start({ task, question: e.target.q.value.trim() }); } },
        h("input", { name: "q", placeholder: tr("Optional: Richtung oder Umfang, z. B. «nur die Rügefrist»"), "aria-label": tr("Anweisung für die Würdigung") }),
        h("button.btn.primary", { type: "submit", disabled: !canRun(task) }, tr("Entwerfen")));
      else if (task === "hypothetical_impact") extra = h("div.ask", {},
        assumptions.length ? h("div.chips", {}, assumptions.map(n => h("label.chip", {}, h("input", { type: "checkbox", checked: S.selectedNotes.has(n.id), onchange: (e) => { e.target.checked ? S.selectedNotes.add(n.id) : S.selectedNotes.delete(n.id); render(); } }), n.text.slice(0, 80))))
          : h("p.note", {}, tr("Legen Sie unter Notizen eine Arbeitsannahme an.")),
        h("button.btn.primary", { type: "button", disabled: !canRun(task) || ![...S.selectedNotes].some(id => assumptions.some(a => a.id === id)), onclick: () => start({ task }) }, action));
      return h("div.task", {},
        h("div", {}, h("h2", {}, label("task", task), latest ? h("button.link.latest", { type: "button", onclick: () => openRun(latest.id) }, tr("letztes Ergebnis")) : null), h("p", {}, tr(TASK_TEXT[task]))),
        extra ? h("span") : h("button.btn.primary", { type: "button", disabled: !canRun(task), onclick: () => start({ task }) }, action),
        extra);
    })),
    c.notes.some(n => n.kind !== "assumption") ? h("details.context-notes", {},
      h("summary", {}, tr("Notizen als Kontext mitgeben ({n} gewählt)", { n: [...S.selectedNotes].length })),
      h("div.chips", {}, c.notes.filter(n => n.kind !== "assumption").map(n => h("label.chip", {}, h("input", { type: "checkbox", checked: S.selectedNotes.has(n.id), onchange: (e) => { e.target.checked ? S.selectedNotes.add(n.id) : S.selectedNotes.delete(n.id); } }), `${label("noteKind", n.kind)}: ${n.text.slice(0, 70)}`))),
      h("p.note", {}, tr("Notizen sind Kontext, nie Beweis. Sie werden vor dem Senden anonymisiert."))) : null,
    S.st.current ? h("p.queue", {}, h("button.link", { type: "button", onclick: () => openRun(S.st.current, { follow: true }) }, tr("Laufenden Auftrag ansehen"))) : null,
    renderHistory(),
  );
}

/** One result, with the whole pane to read it in. */
function renderReading(run) {
  const back = () => { S.run = null; S.follow = false; render(); document.querySelector(".main")?.scrollTo({ top: 0 }); };
  const queue = S.st.queue?.length ? h("span.queue", {}, tr("Danach: {l}", { l: S.st.queue.map(t => label("task", t)).join(", ") }), " ", h("button.link", { type: "button", onclick: () => attempt(() => api("/api/queue/cancel", { method: "POST" })) }, tr("Reihe abbrechen"))) : null;
  const view = renderRun(run);
  const outline = outlineFor(view);
  return h("section.pane.reading", {},
    h("nav.crumb", { "aria-label": tr("Navigation") }, h("button.link", { type: "button", onclick: back }, h("span", { "aria-hidden": "true" }, "← "), tr("Analyse")), queue),
    h("div.reading-grid", { class: outline ? "has-outline" : null }, view, outline));
}

/** A short table of contents for long results: draft parts, comparison groups, key questions. */
function outlineFor(view) {
  const heads = [...view.querySelectorAll(".draft-doc section > h3, .compare > h3.group-title, .question > h3.q")];
  if (heads.length < 3) return null;
  heads.forEach((head, i) => { head.id = `part-${i + 1}`; });
  const nav = h("nav.outline", { "aria-label": tr("Gliederung") });
  setTimeout(() => {
    const links = new Map([...nav.querySelectorAll("a")].map(a => [a.getAttribute("href").slice(1), a]));
    const seen = new IntersectionObserver((entries) => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!top) return;
      for (const [id, a] of links) a.setAttribute("aria-current", String(id === top.target.id));
    }, { root: document.querySelector(".main"), rootMargin: "0px 0px -60% 0px" });
    heads.forEach(head => seen.observe(head));
  }, 0);
  nav.append(h("ol", {}, heads.map(head => h("li", {},
    h("a", { href: `#${head.id}`, onclick: (e) => { e.preventDefault(); head.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); } },
      (head.querySelector(".claim-text, .group-name")?.textContent ?? head.textContent).slice(0, 240))))));
  return nav;
}

async function openRun(id, { follow = false } = {}) {
  await attempt(async () => {
    S.run = await api(`/api/runs/${id}`); S.showTrace = follow; S.follow = follow; S.view = "work"; render();
    document.querySelector(".main")?.scrollTo({ top: 0 });
  });
}

function renderHistory() {
  const list = S.st.runs ?? [];
  if (!list.length) return null;
  return h("div.history", {}, h("h2", {}, tr("Frühere Aufträge")), list.slice(0, 20).map(r => h("button", { type: "button", onclick: () => openRun(r.id) },
    h("span", {}, label("task", r.task)), h("span.muted", {}, r.question ?? ""),
    r.stale ? h("span.stale-mark", { title: tr("Eine Akte hat sich seit diesem Auftrag geändert.") }, tr("veraltet")) : null,
    h("span.faint", { style: { marginLeft: "auto" } }, `${r.status === "succeeded" ? "" : statusName(r.status) + ", "}${r.started ? new Date(r.started).toLocaleString(`${LANG}-CH`) : ""}`))));
}

const statusName = (s) => tr({ running: "läuft", succeeded: "fertig", failed: "fehlgeschlagen", blocked: "gestoppt", cancelled: "abgebrochen" }[s] ?? s);

function renderRunInPlace() {
  const old = document.querySelector(".pane.reading");
  if (old && S.run) old.replaceWith(renderReading(S.run));
}

function tokens(usage) {
  if (!usage) return null;
  const total = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  return tr("{n} Tokens", { n: total.toLocaleString("de-CH") });
}

// US$ per million tokens: input, output, cache write, cache read.
const PRICES = { "claude-opus-5-5": [4, 20, 5, 0.2] };
function cost(run) {
  const p = PRICES[run.model], u = run.usage;
  if (!p || !u) return null;
  const usd = ((u.input_tokens ?? 0) * p[0] + (u.output_tokens ?? 0) * p[1] + (u.cache_creation_input_tokens ?? 0) * p[2] + (u.cache_read_input_tokens ?? 0) * p[3]) / 1e6;
  return `≈ US$ ${usd.toFixed(2)}`;
}

function renderRun(run) {
  const running = run.status === "running";
  const lines = (run.events ?? []).map(e => ({ e, text: traceText(e) })).filter(x => x.text && !(x.e.type === "status" && x.e.status === "running"));
  const trace = h("ol.trace", {}, lines.map(({ e, text }) => h("li", {
    class: e.type === "rejected" || e.type === "needs_review" || (e.type === "status" && e.status !== "succeeded") ? "bad" : ["validated", "bound"].includes(e.type) || e.status === "succeeded" ? "ok" : e.type === "note" ? "note" : e.type.startsWith("caselaw") ? "law" : null,
  }, text)), running ? h("li.live", {}, tr("Das Modell arbeitet …")) : null);
  const demo = run.model === "demo-replay";
  return h("section.run", {},
    h("div.run-head", {},
      h("h1", {}, run.question && run.task === "source_chat" ? `«${run.question}»` : label("task", run.task)),
      h("span.meta", {}, h("span", {}, demo ? tr("Demo-Wiedergabe, kein Modell") : modelLabel(run)), tokens(run.usage) ? h("span", {}, tokens(run.usage)) : null, cost(run) ? h("span", { title: tr("Geschätzt nach den Listenpreisen von Anthropic") }, cost(run)) : null, run.started ? h("span", {}, new Date(run.started).toLocaleString(`${LANG}-CH`, { dateStyle: "medium", timeStyle: "short" })) : null, !running ? h("span", {}, statusName(run.status)) : null),
      h("div.run-actions", {},
      running ? h("button.btn.small", { type: "button", onclick: () => api(`/api/runs/${run.id}/cancel`, { method: "POST" }) }, tr("Abbrechen")) : null,
      !running && run.requests?.length ? h("button.btn.small", { type: "button", onclick: () => openAudit(run) }, tr("Gesendete Anfragen ({n})", { n: run.requests.length })) : null,
      !running && run.result && run.task === "decision_draft" ? h("button.btn.small", { type: "button", onclick: () => saveDraftAsOrder(run) }, tr("Als Verfügungsentwurf speichern")) : null,
      !running && run.result ? h("a.btn.small", { href: `/api/runs/${run.id}/markdown`, download: `${run.id}.md` }, tr("Als Markdown")) : null),
    ),
    renderFreshness(run.freshness),
    running || S.showTrace ? trace : h("button.link.trace-toggle", { type: "button", onclick: () => { S.showTrace = true; renderRunInPlace(); } }, tr("Arbeitsschritte anzeigen ({n})", { n: lines.length })),
    run.result ? renderResult(run, { state: S.st, openCitation, addNote: addNoteFromClaim, toWord: S.st.clients?.word ? sendToWord : null }) : null,
  );
}

/** A result made from files that have since changed is stale; say which. */
function renderFreshness(f) {
  if (!f || (!f.stale && !f.added.length)) return null;
  const names = (list) => list.map(x => x.label).join(", ");
  const missing = f.changed.filter(x => x.reason === "missing");
  const moved = f.changed.filter(x => x.reason === "changed" && x.pages.length), kept = f.changed.filter(x => x.reason === "changed" && !x.pages.length);
  return h("div.stale", { role: "status" },
    h("strong", {}, f.stale ? tr("Veraltet") : tr("Neue Akten")),
    moved.length ? h("p", {}, tr("Seit diesem Auftrag geändert: {l}. Die markierten Belege zeigen auf Text, der so nicht mehr in der Akte steht.", { l: names(moved) })) : null,
    kept.length ? h("p", {}, tr("Seit diesem Auftrag geändert: {l}. Die zitierten Stellen sind unverändert; anderes in der Datei kann sich geändert haben.", { l: names(kept) })) : null,
    missing.length ? h("p", {}, tr("Nicht mehr im Aktenordner: {l}.", { l: names(missing) })) : null,
    f.added.length ? h("p", {}, tr("Nicht berücksichtigt, weil später hinzugekommen: {l}.", { l: names(f.added) })) : null,
    h("p.faint", {}, tr("Starten Sie den Auftrag erneut, um den aktuellen Stand zu verwenden.")));
}

function addNoteFromClaim(claim, run) {
  attempt(async () => {
    await api("/api/notes", { method: "POST", body: {
      text: claimPlain(claim), kind: "note", status: "proposed", origin: `${label("task", run.task)} · ${run.id}`,
      refs: claim.citations.filter(c => c.match === "exact").map(c => ({ label: c.label, page_label: c.page_label, document: c.kind ? null : c.document, page: c.kind ? null : c.page, quote: c.quote_original ?? "", url: c.url ?? null })),
    } });
    toast(tr("Als Notiz übernommen (vorgeschlagen)."));
    await refresh();
  });
}

function draftPlain(run) {
  const claims = new Map(run.result.claims.map(c => [c.id, c]));
  const order = ["facts", "issue", "reasoning", "counterargument", "open_issue", "disposition"];
  const lines = [];
  for (const part of order) {
    const rows = run.result.rows.filter(r => r.part === part);
    if (!rows.length) continue;
    lines.push(label("part", part).toUpperCase(), "");
    rows.forEach((row, i) => {
      const c = claims.get(row.claim);
      lines.push(`${part === "disposition" ? `${i + 1}. ` : ""}${claimPlain(c)} (${refsPlain(c)})`, "");
    });
  }
  return lines.join("\n");
}

function saveDraftAsOrder(run) {
  attempt(async () => {
    await api("/api/procedure", { method: "POST", body: { list: "orders", op: "add", title: tr("Würdigung vom {d}", { d: new Date().toLocaleDateString(`${LANG}-CH`) }), text: draftPlain(run), status: "draft", ref: run.id } });
    toast(tr("Unter Verfahren als Entwurf gespeichert."));
    await refresh();
  });
}

// --- Recherche ---------------------------------------------------------------
function renderResearch() {
  const R = S.research;
  const search = (e) => {
    e.preventDefault();
    const query = e.target.q.value.trim();
    if (query.length < 2) return;
    R.query = query; R.busy = true; render();
    attempt(async () => { R.results = await api("/api/caselaw/search", { method: "POST", body: { query, language: e.target.lang.value || null } }); }).finally(() => { R.busy = false; render(); });
  };
  const runCitecheck = () => {
    R.citecheckBusy = true; render();
    attempt(async () => { R.citecheck = await api("/api/citecheck", { method: "POST", body: {} }); }).finally(() => { R.citecheckBusy = false; render(); });
  };
  const status = { found: ["check", "Gefunden"], date_differs: ["dash", "Datum weicht ab"], not_found: ["cross", "Nicht in OpenCaseLaw"], not_checked: ["ring", "Nicht geprüft"] };
  return h("section.pane", {},
    h("header", {}, h("h1", {}, tr("Recherche")), h("p", {}, tr("Rechtsprechung auf OpenCaseLaw suchen und die Entscheidzitate in den Akten mit citecheck prüfen. Suchbegriffe gehen an den öffentlichen Dienst; keine Namen oder Sachverhaltsdetails eingeben."))),
    h("div.research-grid", {},
      h("div", {},
        h("h2", {}, tr("Rechtsprechung finden")),
        h("form.inline-form.searchbar", { onsubmit: search },
          h("input", { name: "q", value: R.query, placeholder: tr("z. B. Mängelrüge geheimer Mangel, Art. 367 OR, 4A_252/2023"), "aria-label": tr("Suchbegriffe") }),
          h("select", { name: "lang", "aria-label": tr("Sprache der Entscheide") }, h("option", { value: "" }, tr("alle Sprachen")), ["de", "fr", "it"].map(l => h("option", { value: l }, l.toUpperCase()))),
          h("button.btn.small.primary", { type: "submit", disabled: R.busy }, icon("search"), tr("Suchen"))),
        R.busy ? h("p.note", {}, tr("OpenCaseLaw sucht … (bis zu 50 Sekunden)")) : null,
        R.results ? h("ol.caselaw", {}, R.results.results.map(r => h("li", {},
          h("button.link.cl-title", { type: "button", onclick: () => openDecision(r.decision_id) }, `${r.court ?? ""} ${r.docket ?? r.decision_id}`),
          h("span.faint", {}, ` ${formatDate(r.date)} · ${(r.language ?? "").toUpperCase()}`),
          r.regeste ? h("p.regeste", {}, r.regeste) : null,
          r.snippet ? h("p.snippet", {}, r.snippet) : null))) : null,
        R.results && !R.results.results.length ? h("p.note", {}, tr("Keine Treffer. Kein Treffer heisst nicht, dass es keine einschlägige Rechtsprechung gibt.")) : null,
      ),
      h("div", {},
        h("h2", {}, tr("Zitate in den Akten prüfen")),
        h("p.note", {}, tr("citecheck findet BGE- und Urteilszitate in den einbezogenen Akten und prüft sie an OpenCaseLaw. Übermittelt wird nur die Fundstelle, kein Text.")),
        h("button.btn.small", { type: "button", disabled: R.citecheckBusy, onclick: runCitecheck }, icon("scale"), R.citecheckBusy ? tr("Prüft …") : tr("Zitate prüfen")),
        R.citecheck ? h("ul.citecheck", {}, R.citecheck.results.map(r => h("li", { class: r.status },
          h("span.cc-status", {}, icon(status[r.status][0]), tr(status[r.status][1])),
          h("span.cc-written", {}, r.written),
          h("span.faint", {}, pg(` ${r.ref.label ?? ""} S. ${r.ref.page ?? ""}`)),
          r.status === "found" || r.status === "date_differs" ? h("div.cc-detail", {},
            `${r.court ?? ""} ${r.docket ?? ""}, ${formatDate(r.date)}`,
            r.pinpoint ? h("span", { class: r.pinpoint_found ? "local" : "alert" }, ` · E. ${r.pinpoint} ${r.pinpoint_found === null ? tr("nicht prüfbar") : r.pinpoint_found ? tr("im Text gefunden") : tr("nicht gefunden")}`) : null,
            " ", h("button.link", { type: "button", onclick: () => openDecision(r.id) }, tr("öffnen"))) : null)),
          R.citecheck.unchecked.length ? h("li.not_checked", {}, trn(R.citecheck.unchecked.length, "{n} weitere zitatähnliche Angabe nicht geprüft (z. B. Zeitschriften, kantonale Nummern).", "{n} weitere zitatähnliche Angaben nicht geprüft (z. B. Zeitschriften, kantonale Nummern).")) : null,
          !R.citecheck.results.length ? h("li", {}, tr("Keine Entscheidzitate gefunden.")) : null) : null,
        h("p.note", {}, tr("«Nicht gefunden» heisst nicht «falsch»: OpenCaseLaw kennt nicht jeden Entscheid. Ob ein Entscheid die Aussage trägt, prüft citecheck nicht.")),
      ),
    ),
  );
}

async function openDecision(id) {
  S.drawer = { decision: id, mode: "decision" };
  renderDrawer();
}

// --- Notizen ---------------------------------------------------------------------
function renderNotes() {
  const c = S.st.case;
  const notes = c.notes.filter(n => S.noteFilter === "all" || n.status === S.noteFilter || n.kind === S.noteFilter);
  const update = (id, patch) => attempt(async () => { await api(`/api/notes/${id}`, { method: "POST", body: patch }); await refresh(); });
  return h("section.pane", {},
    h("header", {}, h("h1", {}, tr("Notizen")), h("p", {}, tr("Offene Fragen, Widersprüche und Arbeitsannahmen, mit Fundstellen und Status. Notizen bleiben lokal; nur ausgewählte gehen anonymisiert als Kontext an das Modell, nie als Beweis."))),
    h("form.note-form", { onsubmit: (e) => { e.preventDefault(); const text = e.target.text.value.trim(); if (!text) return; attempt(async () => { await api("/api/notes", { method: "POST", body: { text, kind: e.target.kind.value, status: "proposed" } }); e.target.reset(); await refresh(); }); } },
      h("textarea", { name: "text", rows: 3, placeholder: tr("Neue Notiz, offene Frage oder Arbeitsannahme"), "aria-label": tr("Notiztext") }),
      h("div.inline-form", {},
        h("select", { name: "kind", "aria-label": tr("Art") }, ["note", "question", "assumption", "contradiction"].map(k => h("option", { value: k }, label("noteKind", k)))),
        h("button.btn.small.primary", { type: "submit" }, icon("plus"), tr("Hinzufügen")))),
    h("div.filters", { role: "group", "aria-label": tr("Filter") }, [["all", "Alle"], ["proposed", "vorgeschlagen"], ["adopted", "übernommen"], ["disputed", "strittig"], ["question", "Offene Frage"], ["assumption", "Arbeitsannahme"]].map(([v, l]) =>
      h("button.btn.small", { type: "button", "aria-pressed": S.noteFilter === v ? "true" : "false", onclick: () => { S.noteFilter = v; render(); } }, tr(l)))),
    notes.length ? h("ul.notes", {}, notes.map(n => h("li", { class: n.status },
      h("div.note-head", {},
        h("span.note-kind", {}, label("noteKind", n.kind)), h("span.faint", {}, `${n.id} · ${new Date(n.updated).toLocaleDateString(`${LANG}-CH`)}`),
        n.origin ? h("span.faint", {}, ` · ${n.origin}`) : null,
        h("span.spacer"),
        h("select", { "aria-label": tr("Status"), onchange: (e) => update(n.id, { status: e.target.value }) }, ["proposed", "adopted", "disputed", "done"].map(s => h("option", { value: s, selected: n.status === s }, label("noteStatus", s)))),
        h("button.btn.small.quiet", { type: "button", "aria-label": tr("Notiz löschen"), onclick: () => attempt(async () => { await api(`/api/notes/${n.id}/delete`, { method: "POST" }); await refresh(); }) }, icon("cross"))),
      h("p.note-text", { contentEditable: "plaintext-only", spellcheck: true, onblur: (e) => { const text = e.target.textContent.trim(); if (text && text !== n.text) update(n.id, { text }); } }, n.text),
      n.refs.length ? h("div.note-refs", {}, n.refs.map(r => h("span.ref", { title: r.quote }, icon(r.url ? "scale" : "doc"), refLabel(r)))) : null,
    ))) : h("p.note", {}, tr("Noch keine Notizen. Aus jedem Ergebnis lässt sich eine Aussage mit ihren Fundstellen übernehmen.")),
  );
}

// --- Verfahren ---------------------------------------------------------------------
function orderTemplate() {
  const c = S.st.case;
  const name = (p) => p.name ?? `[${p.id}]`;
  // The order is written in the language of the proceedings, whatever the interface language.
  const lang = c.language?.code ?? "de";
  const date = new Date().toLocaleDateString(lang === "en" ? "en-GB" : `${lang}-CH`, { day: "numeric", month: "long", year: "numeric" });
  const parties = c.parties.map(p => `${name(p)}, ${partyTerm(lang, p.role, p.gender_used ?? null)}`);
  const T = {
    de: `[Gericht]\n\nVerfahren ${c.name}\n\nVerfügung vom ${date}\n\nin Sachen\n${parties.join("\ngegen\n")}\n\nbetreffend […]\n\nDie Instruktionsrichterin / Der Instruktionsrichter zieht in Erwägung:\n\n1. […]\n\nund verfügt:\n\n1. […]\n\n2. Schriftliche Mitteilung an die Parteien.\n\n[Ort], ${date}\n\n[Name, Funktion]`,
    fr: `[Tribunal]\n\nProcédure ${c.name}\n\nOrdonnance du ${date}\n\ndans la cause\n${parties.join("\ncontre\n")}\n\nconcernant […]\n\nLe juge instructeur / La juge instructrice considère :\n\n1. […]\n\net ordonne :\n\n1. […]\n\n2. Communication écrite aux parties.\n\n[Lieu], ${date}\n\n[Nom, fonction]`,
    it: `[Tribunale]\n\nProcedura ${c.name}\n\nOrdinanza del ${date}\n\nnella causa\n${parties.join("\ncontro\n")}\n\nconcernente […]\n\nIl giudice istruttore / La giudice istruttrice considera:\n\n1. […]\n\ne decreta:\n\n1. […]\n\n2. Comunicazione scritta alle parti.\n\n[Luogo], ${date}\n\n[Nome, funzione]`,
    en: `[Court]\n\nProceedings ${c.name}\n\nProcedural order of ${date}\n\nin the matter of\n${parties.join("\nv.\n")}\n\nconcerning […]\n\nThe instructing judge considers:\n\n1. […]\n\nand orders:\n\n1. […]\n\n2. Written notice to the parties.\n\n[Place], ${date}\n\n[Name, function]`,
  };
  return T[lang] ?? T.de;
}

function renderProcedure() {
  const p = S.st.case.procedure;
  const change = (body) => attempt(async () => { await api("/api/procedure", { method: "POST", body }); await refresh(); });
  const today = new Date().toISOString().slice(0, 10);
  if (!S.register) api("/api/register").then(r => { S.register = r.entities; });
  return h("section.pane", {},
    h("header", {}, h("h1", {}, tr("Verfahren")), h("p", {}, tr("Fristen, Verfahrensschritte und Verfügungen mit ihren Quellen. CourtOS berechnet keine gesetzlichen Fristen und versendet nichts; der massgebliche Kalender bleibt in Ihren Systemen."))),
    h("h2.sub", {}, icon("calendar"), tr("Fristen und Schritte")),
    h("form.inline-form.deadline-form", { onsubmit: (e) => { e.preventDefault(); const f = e.target; if (!f.title.value.trim()) return; change({ list: "deadlines", op: "add", title: f.title.value, date: f.date.value, ref: f.ref.value }); f.reset(); } },
      h("input", { name: "date", type: "date", required: true, "aria-label": tr("Datum") }),
      h("input", { name: "title", placeholder: tr("z. B. Frist Replik, Instruktionsverhandlung"), "aria-label": tr("Bezeichnung") }),
      h("input", { name: "ref", placeholder: tr("Quelle, z. B. Verfügung vom 3. März, Ziff. 2"), "aria-label": tr("Quelle") }),
      h("button.btn.small.primary", { type: "submit" }, icon("plus"), tr("Erfassen"))),
    p.deadlines.length ? h("ul.deadlines", {}, p.deadlines.map(d => h("li", { class: [d.status, d.status === "open" && d.date < today ? "overdue" : null].filter(Boolean).join(" ") },
      h("input", { type: "checkbox", checked: d.status === "done", "aria-label": tr("Erledigt"), onchange: (e) => change({ list: "deadlines", op: "update", id: d.id, status: e.target.checked ? "done" : "open" }) }),
      h("span.d-date", {}, formatDate(d.date)),
      h("span.d-title", {}, d.title),
      d.ref ? h("span.faint", {}, d.ref) : null,
      h("button.btn.small.quiet", { type: "button", "aria-label": tr("Löschen"), onclick: () => change({ list: "deadlines", op: "delete", id: d.id }) }, icon("cross"))))) : h("p.note", {}, tr("Keine Fristen erfasst.")),
    h("h2.sub", {}, icon("doc"), tr("Verfügungen")),
    h("div.order-actions", {},
      h("button.btn.small", { type: "button", onclick: () => { S.orderDraft = { id: null, title: ({ de: "Verfügung", fr: "Ordonnance", it: "Ordinanza", en: "Procedural order" })[S.st.case.language?.code ?? "de"], text: orderTemplate(), status: "draft" }; render(); } }, tr("Vorlage einfügen · ohne KI")),
      h("button.btn.small", { type: "button", onclick: () => { S.orderDraft = { id: null, title: tr("Erlassene Verfügung"), text: "", status: "issued", date: today }; render(); } }, tr("Erlassene Verfügung erfassen"))),
    S.orderDraft ? h("form.order-editor", { onsubmit: (e) => {
      e.preventDefault();
      const f = e.target;
      const body = { list: "orders", title: f.title.value, text: f.text.value, status: S.orderDraft.status, date: f.date?.value || null };
      change(S.orderDraft.id ? { ...body, op: "update", id: S.orderDraft.id } : { ...body, op: "add" });
      S.orderDraft = null;
    } },
      h("input", { name: "title", value: S.orderDraft.title, "aria-label": tr("Titel") }),
      S.orderDraft.status === "issued" ? h("input", { name: "date", type: "date", value: S.orderDraft.date ?? today, "aria-label": tr("Datum") }) : null,
      h("textarea", { name: "text", rows: 18, value: S.orderDraft.text, "aria-label": tr("Text der Verfügung") }),
      h("div.inline-form", {},
        h("button.btn.small.primary", { type: "submit" }, tr("Speichern")),
        h("button.btn.small", { type: "button", onclick: (e) => { navigator.clipboard?.writeText(e.target.closest("form").text.value); toast(tr("Kopiert.")); } }, tr("Kopieren")),
        h("button.btn.small.quiet", { type: "button", onclick: () => { S.orderDraft = null; render(); } }, tr("Verwerfen"))),
      h("p.note", {}, tr("Speichern, Kopieren oder Einfügen in Word erlässt nichts. Zuständigkeit, Rechtsbegehren, rechtliches Gehör und Wortlaut prüfen Sie selbst."))) : null,
    p.orders.length ? h("ul.orders", {}, p.orders.map(o => h("li", { class: o.status },
      h("span.o-status", {}, o.status === "issued" ? tr("erlassen") : tr("Entwurf")),
      h("span.d-date", {}, o.date ? formatDate(o.date) : ""),
      h("button.link", { type: "button", onclick: () => { S.orderDraft = { ...o }; render(); } }, o.title),
      h("span.spacer"),
      o.status === "draft" ? h("button.btn.small.quiet", { type: "button", onclick: () => change({ list: "orders", op: "update", id: o.id, status: "issued", date: today }) }, tr("Als erlassen erfassen")) : null,
      h("button.btn.small.quiet", { type: "button", "aria-label": tr("Löschen"), onclick: () => change({ list: "orders", op: "delete", id: o.id }) }, icon("cross"))))) : null,
    h("h2.sub", {}, icon("lock"), tr("Sicherung")),
    h("p.note", {}, tr("Register, Notizen, Verfahren, Analysen und anonymisierte Fassung als ZIP, ohne Originaldateien. Das Register verbindet Ersatzbezeichnungen mit echten Namen: so vertraulich aufbewahren wie die Akten.")),
    h("a.btn.small", { href: "/api/backup", download: "" }, tr("Sicherung herunterladen")),
  );
}

// --- Drawer ---------------------------------------------------------------------
function openCitation(citation) {
  const pdf = S.st.case.sources.find(s => s.id === citation.document)?.ext === ".pdf";
  // A PDF opens on its page, with the passage marked; the text view is one click away.
  S.drawer = { citation, mode: citation.kind === "authority" ? "authority" : citation.kind === "note" ? "note" : pdf ? (S.sourceMode ?? "page") : "text" };
  renderDrawer();
}

// pdf.js renders original pages in the browser; loaded on first use.
let pdfjsLib = null;
const pdfDocs = new Map();
async function pdfDocument(id, sha) {
  pdfjsLib ??= await import("/vendor/pdf.min.mjs").then(lib => { lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs"; return lib; });
  const key = `${id}:${sha}`;
  if (!pdfDocs.has(key)) {
    pdfDocs.set(key, pdfjsLib.getDocument({ url: `/api/original/${id}`, isEvalSupported: false, standardFontDataUrl: "/vendor/standard_fonts/" }).promise);
    pdfDocs.get(key).catch(() => pdfDocs.delete(key));
  }
  return pdfDocs.get(key);
}

/** The original page as an image, with the cited passages marked where their position is known. */
async function renderPageView(body, citation, source, group) {
  const width = Math.min(body.clientWidth - 44, 900);
  const sheet = h("div.sheet", { style: { width: `${width}px` } });
  const status = h("p.page-caption", {}, tr("Lädt die Seite …"));
  body.replaceChildren(sheet, status);
  const pdf = await pdfDocument(citation.document, source.version);
  const page = await pdf.getPage(citation.page);
  const base = page.getViewport({ scale: 1 });
  const ratio = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: (width / base.width) * ratio });
  const canvas = h("canvas", { width: String(Math.floor(viewport.width)), height: String(Math.floor(viewport.height)), "aria-label": tr("{p} als Bild", { p: pg(citation.page_label) }), role: "img" });
  canvas.style.width = `${width}px`;
  sheet.style.height = `${(viewport.height / ratio).toFixed(0)}px`;
  sheet.replaceChildren(canvas);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  const exact = group.filter(x => x.match === "exact");
  const found = await Promise.all(exact.map(x => api(`/api/highlight/${x.document}/${x.page}?start=${x.original_start}&end=${x.original_end}&sha=${x.page_sha256}`).catch(() => ({ rects: [], reason: "error" }))));
  const rects = found.flatMap(f => f.rects);
  for (const r of rects) sheet.append(h("span.hl", { style: { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` } }));
  const ocr = found.some(f => f.source === "ocr");
  status.textContent = !exact.length ? tr("Nicht verifiziert: keine Stelle markiert.")
    : rects.length ? (ocr ? tr("Markiert nach der lokalen Texterkennung des Scans.") : tr("Markiert nach dem Text der PDF-Datei."))
    : tr("Die Stelle lässt sich auf dem Bild nicht verorten. In der Textansicht ist sie markiert.");
  status.classList.toggle("alert", Boolean(exact.length && !rects.length));
  if (rects.length) body.scrollTo({ top: Math.max(0, rects[0].y * sheet.offsetHeight - body.clientHeight / 3), behavior: "smooth" });
}

function closeDrawer() {
  S.drawer = null;
  document.querySelector(".drawer")?.classList.remove("open");
  setTimeout(() => { if (!S.drawer) document.querySelector(".drawer")?.remove(); }, 300);
}

async function renderDrawer() {
  const { citation, mode } = S.drawer;
  let drawer = document.querySelector(".drawer");
  if (!drawer) {
    drawer = h("aside.drawer", { "aria-label": tr("Quelle") });
    document.body.append(drawer);
    requestAnimationFrame(() => drawer.classList.add("open"));
  }
  const body = h("div.body", {}, h("p.muted", {}, tr("Lädt …")));
  const close = h("button.btn.small.quiet", { type: "button", onclick: closeDrawer, "aria-label": tr("Schliessen") }, icon("cross"));

  if (mode === "decision") {
    drawer.replaceChildren(h("header", {}, h("h2", {}, tr("Entscheid")), close), h("div.bar", {}), body);
    try {
      const d = await api(`/api/caselaw/decision/${encodeURIComponent(S.drawer.decision)}`);
      drawer.querySelector("h2").textContent = `${d.court ?? ""} ${d.docket ?? d.decision_id}`;
      drawer.querySelector(".bar").replaceChildren(h("span.faint", {}, formatDate(d.date)), h("span", { style: { flex: 1 } }),
        h("a.btn.small", { href: d.opencaselaw_url, target: "_blank", rel: "noopener noreferrer" }, icon("out"), "OpenCaseLaw"),
        d.source_url ? h("a.btn.small", { href: d.source_url, target: "_blank", rel: "noopener noreferrer" }, tr("Original")) : null);
      body.replaceChildren(d.regeste ? h("p.regeste", {}, d.regeste) : null, h("div.page-text", {}, d.text_available ? d.text : tr("Der Volltext ist nicht verfügbar.")));
    } catch (error) {
      body.replaceChildren(h("p.alert", {}, errorText(error.code)));
    }
    return;
  }
  if (mode === "authority") {
    drawer.replaceChildren(
      h("header", {}, h("h2", {}, `${citation.court ?? ""} ${citation.label}`), close),
      h("div.bar", {}, h("span", { class: citation.match === "exact" ? "local" : "alert" }, icon(citation.match === "exact" ? "check" : "cross"), citation.match === "exact" ? ` ${tr("Wörtlich im veröffentlichten Text gefunden")}` : ` ${tr("Nicht verifiziert")}`),
        h("span", { style: { flex: 1 } }), citation.url ? h("a.btn.small", { href: citation.url, target: "_blank", rel: "noopener noreferrer" }, icon("out"), "OpenCaseLaw") : null),
      body);
    const ctx = citation.context ?? citation.quote_original;
    const at = ctx.indexOf(citation.quote_original);
    body.replaceChildren(
      h("div.page-text", {}, at >= 0 ? [at > 0 ? "…" + ctx.slice(0, at) : "", h("mark", {}, citation.quote_original), ctx.slice(at + citation.quote_original.length) + "…"] : ctx),
      h("p.page-caption", {}, tr("{p} des von OpenCaseLaw gelieferten Texts, {d}. Abschnittsnummern sind keine amtlichen Randnummern.", { p: pg(citation.page_label), d: formatDate(citation.date) })),
      h("button.link", { type: "button", onclick: () => openDecision(citation.decision_id) }, tr("Ganzen Entscheid lesen")));
    return;
  }
  if (mode === "note") {
    const note = S.st.case.notes.find(n => n.id === citation.note);
    drawer.replaceChildren(h("header", {}, h("h2", {}, citation.label), close), h("div.bar", {}, h("span.faint", {}, tr("Ihre Notiz, als Kontext übergeben – kein Beweis"))), body);
    body.replaceChildren(h("div.page-text", {}, note?.text ?? citation.quote_original ?? ""));
    return;
  }
  const source = S.st.case.sources.find(s => s.id === citation.document);
  drawer.replaceChildren(
    h("header", {}, h("h2", {}, refLabel(citation)), close),
    h("div.bar", {},
      h("span", { class: citation.match === "exact" ? "local" : "alert" }, icon(citation.match === "exact" ? "check" : "cross"), citation.match === "exact" ? ` ${tr("Wörtlich an dieser Stelle gefunden")}` : ` ${tr("Nicht verifiziert")}`),
      h("span", { style: { flex: 1 } }),
      source?.ext === ".pdf" ? h("div.seg", { role: "group", "aria-label": tr("Ansicht") }, [["page", tr("Seite")], ["text", tr("Text")]].map(([m, name]) =>
        h("button", { type: "button", "aria-pressed": String(mode === m), onclick: () => { S.drawer.mode = S.sourceMode = m; renderDrawer(); } }, name))) : null,
      source?.status === "ok" ? h("button.btn.small", { type: "button", onclick: () => openReader(citation.document, { page: citation.page, marks: citation.group ?? [citation] }) }, icon("doc"), tr("Im Dokument lesen")) : null,
    ),
    body,
  );
  drawer.classList.toggle("wide", mode === "page");
  if (mode === "page") {
    const group = citation.group ?? [citation];
    try { await renderPageView(body, citation, source, group); }
    catch { body.replaceChildren(h("p.alert", {}, tr("Die Originalseite ist nicht verfügbar. Wurde die Datei verändert oder verschoben?"))); }
    return;
  }
  try {
    const view = await viewFor(citation.document);
    const page = view.pages.find(p => p.n === citation.page);
    const chars = Array.from(page.original);
    const text = h("div.page-text", {});
    const group = citation.group ?? [citation];
    const sameVersion = group.every(x => x.page_sha256 === page.sha256);
    if (!sameVersion) drawer.querySelector(".bar span").replaceChildren(icon("cross"), ` ${tr("Die Seite hat sich seit dem Auftrag geändert – nicht verifiziert")}`);
    const marks = (sameVersion ? group : []).filter(x => x.match === "exact").map(x => [x.original_start, x.original_end]).sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [from, to] of marks) {
      if (from < cursor) continue;
      text.append(chars.slice(cursor, from).join(""), h("mark", {}, chars.slice(from, to).join("")));
      cursor = to;
    }
    text.append(chars.slice(cursor).join(""));
    body.replaceChildren(text,
      page.mirror?.ocr ? h("p.page-caption.alert", {}, tr("Text per Texterkennung aus dem Scan. Mit dem Original vergleichen.")) : null,
      ...group.map(x => h("p.sent", {}, tr("An das Modell ging diese Stelle so:"), " «", x.quote_pseudonymised, "»")),
      source ? h("p.page-caption", {}, tr("{p}, Fassung {v}", { p: source.rel_path, v: source.version })) : null);
    body.querySelector("mark")?.scrollIntoView({ block: "center" });
  } catch {
    body.replaceChildren(h("p.alert", {}, tr("Die Originalseite ist nicht verfügbar. Wurde die Datei verändert oder verschoben?")));
  }
}

// --- Lesen ----------------------------------------------------------------------
// The originals are the source of truth: every page at reading width, in the main area.
const READ_WIDTH = 860;
const pageSizes = new Map();
const pageCanvases = new Map();

/** Opens a document in the reader; with `at`, on a cited page with the passages marked. */
function openReader(doc, at = null) {
  const back = S.view === "read" ? S.reader?.back : S.view;
  S.reader = { doc, page: at?.page ?? 1, marks: at?.marks ?? [], mode: S.reader?.mode ?? null, zoom: S.reader?.zoom ?? 1, back, jump: true, focus: Boolean(at?.marks?.length) };
  S.view = "read";
  if (S.drawer) closeDrawer();
  render();
}

function renderReader() {
  const c = S.st.case;
  const doc = c.sources.find(s => s.id === S.reader?.doc);
  if (!doc) { S.view = "docs"; return renderDocs(); }
  const pdf = doc.ext === ".pdf" && doc.status === "ok";
  const mode = pdf ? S.reader.mode ?? "page" : "text";
  const count = doc.pages || 1;
  const counter = h("span.reader-count", { "aria-live": "polite" }, tr("Seite {p} von {n}", { p: S.reader.page, n: count }));
  const pages = h("div.reader-pages", { class: mode === "text" ? "as-text" : null });
  const goTo = (n, smooth = true) => {
    const target = pages.querySelector(`[data-page="${Math.min(Math.max(n, 1), count)}"]`);
    const main = document.querySelector(".main");
    if (!target || !main) return;
    const top = main.getBoundingClientRect().top, covered = (main.querySelector(".reader-bar")?.getBoundingClientRect().bottom ?? top) - top;
    main.scrollTo({ top: main.scrollTop + target.getBoundingClientRect().top - top - covered - 20, behavior: smooth ? "smooth" : "auto" });
  };
  const zoomTo = (z) => { S.reader.zoom = Math.min(Math.max(Math.round(z * 100) / 100, 0.6), 2); S.reader.jump = true; render(); };
  const back = S.reader.back && S.reader.back !== "read" ? S.reader.back : "docs";
  const section = h("section.reader", { "aria-label": tr("{d} lesen", { d: doc.label ?? doc.name }) },
    h("header.reader-bar", {},
      h("button.btn.small.quiet", { type: "button", onclick: () => { S.view = back; render(); }, "aria-label": tr("Zurück") }, icon("back")),
      h("div.reader-title", {}, h("h1", {}, doc.label ?? doc.name), h("span", {}, doc.name)),
      h("div.reader-nav", { role: "group", "aria-label": tr("Seiten") },
        h("button.btn.small.quiet", { type: "button", "aria-label": tr("Vorherige Seite"), onclick: () => goTo(S.reader.page - 1) }, icon("up")),
        counter,
        h("button.btn.small.quiet", { type: "button", "aria-label": tr("Nächste Seite"), onclick: () => goTo(S.reader.page + 1) }, icon("down"))),
      pdf ? h("div.seg", { role: "group", "aria-label": tr("Ansicht") }, [["page", tr("Seite")], ["text", tr("Text")]].map(([m, name]) =>
        h("button", { type: "button", "aria-pressed": String(mode === m), onclick: () => { S.reader.mode = m; S.reader.jump = true; render(); } }, name))) : null,
      mode === "page" ? h("div.reader-zoom", { role: "group", "aria-label": tr("Grösse") },
        h("button.btn.small.quiet", { type: "button", "aria-label": tr("Verkleinern"), disabled: S.reader.zoom <= 0.6, onclick: () => zoomTo(S.reader.zoom - 0.2) }, icon("dash")),
        h("button.reader-pct", { type: "button", title: tr("Lesebreite"), onclick: () => zoomTo(1) }, `${Math.round(S.reader.zoom * 100)} %`),
        h("button.btn.small.quiet", { type: "button", "aria-label": tr("Vergrössern"), disabled: S.reader.zoom >= 2, onclick: () => zoomTo(S.reader.zoom + 0.2) }, icon("plus"))) : null,
      h("span.spacer"),
      doc.include && doc.status === "ok" ? h("button.btn.small.quiet", { type: "button", onclick: async () => { S.view = "privacy"; S.preview = { ...S.preview, doc: doc.id, page: S.reader.page, mode: "mirror" }; S.register = (await api("/api/register")).entities; render(); } }, icon("eye"), tr("Was das Modell liest")) : null,
      h("button.btn.small", { type: "button", onclick: () => attempt(() => api("/api/open-original", { method: "POST", body: { id: doc.id } })) }, icon("out"), tr("Original öffnen")),
    ),
    doc.status !== "ok" ? h("p.page-text.empty", {}, doc.status === "unsupported" ? tr("Format nicht unterstützt") : tr("Nicht lesbar")) : pages,
  );
  if (doc.status !== "ok") return section;

  // Which page is in view: the one whose top last passed the upper third of the window.
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      S.reader.page = Number(e.target.dataset.page);
      counter.textContent = tr("Seite {p} von {n}", { p: S.reader.page, n: count });
    }
  }, { rootMargin: "-30% 0px -65% 0px" });
  const jump = () => { if (S.reader.jump) { S.reader.jump = false; requestAnimationFrame(() => goTo(S.reader.page, false)); } };
  /** Once a cited page is drawn, its first marked passage is brought to the middle of the window. */
  const focusMark = (mark) => { if (!mark || !S.reader.focus) return; S.reader.focus = false; requestAnimationFrame(() => mark.scrollIntoView({ block: "center", behavior: "smooth" })); };

  if (mode === "page") {
    const main = document.querySelector(".main");
    const room = (main?.clientWidth ?? 1100) - 96;
    const width = Math.round(Math.min(READ_WIDTH, room) * S.reader.zoom);
    const lazy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); drawPage(e.target, doc, Number(e.target.dataset.page), width); }
    }, { rootMargin: "800px 0px" });
    for (let n = 1; n <= count; n++) {
      const size = pageSizes.get(`${doc.id}:${doc.version}:${n}`) ?? pageSizes.get(`${doc.id}:${doc.version}:1`);
      const sheet = h("div.sheet", { dataset: { page: String(n) }, style: { width: `${width}px`, height: `${Math.round(width * (size ?? 1.414))}px` } }, h("span.sheet-loading", {}, tr("Lädt die Seite …")));
      pages.append(h("figure.reader-page", {}, sheet, h("figcaption", {}, pg(`S. ${n}`))));
      lazy.observe(sheet); observer.observe(sheet);
      if (n === S.reader.page) sheet.addEventListener("marked", () => focusMark(sheet.querySelector(".hl")), { once: true });
    }
    jump();
    return section;
  }
  viewFor(doc.id).then(view => {
    for (const page of view.pages) {
      const marks = S.reader.marks.filter(m => m.page === page.n && m.page_sha256 === page.sha256 && m.match === "exact").map(m => [m.original_start, m.original_end]).sort((a, b) => a[0] - b[0]);
      const chars = Array.from(page.original ?? "");
      const text = h("div.reader-text", { dataset: { page: String(page.n) } });
      let cursor = 0;
      for (const [from, to] of marks) { if (from < cursor) continue; text.append(chars.slice(cursor, from).join(""), h("mark", {}, chars.slice(from, to).join(""))); cursor = to; }
      text.append(chars.slice(cursor).join(""));
      if (!page.has_text) text.replaceChildren(h("span.alert", {}, tr("Diese Seite hat keinen lesbaren Text.")));
      pages.append(h("figure.reader-page", {}, text, h("figcaption", {}, pg(`S. ${page.n}`), page.mirror?.ocr ? ` · ${tr("Text per Texterkennung aus dem Scan; mit dem Original vergleichen.")}` : "")));
      observer.observe(text);
    }
    jump();
    focusMark(pages.querySelector("mark"));
  }).catch(() => pages.replaceChildren(h("p.page-text.empty", {}, tr("Die Seite konnte nicht geladen werden."))));
  return section;
}

/** One original page as an image, drawn once per width and kept, with any marked passages on it. */
async function drawPage(sheet, doc, n, width) {
  const key = `${doc.id}:${doc.version}:${n}:${width}`;
  try {
    let canvas = pageCanvases.get(key);
    if (!canvas) {
      const pdf = await pdfDocument(doc.id, doc.version);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      pageSizes.set(`${doc.id}:${doc.version}:${n}`, base.height / base.width);
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });
      canvas = h("canvas", { width: String(Math.floor(viewport.width)), height: String(Math.floor(viewport.height)), role: "img", "aria-label": tr("{p} als Bild", { p: pg(`S. ${n}`) }) });
      canvas.style.width = `${width}px`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (pageCanvases.size > 60) pageCanvases.delete(pageCanvases.keys().next().value);
      pageCanvases.set(key, canvas);
    }
    sheet.style.height = `${Math.round(canvas.height / (canvas.width / width))}px`;
    sheet.replaceChildren(canvas);
    const marks = (S.reader?.doc === doc.id ? S.reader.marks : []).filter(m => m.page === n && m.match === "exact");
    const found = await Promise.all(marks.map(m => api(`/api/highlight/${m.document}/${m.page}?start=${m.original_start}&end=${m.original_end}&sha=${m.page_sha256}`).catch(() => ({ rects: [] }))));
    for (const r of found.flatMap(f => f.rects)) sheet.append(h("span.hl", { style: { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` } }));
    if (found.length) sheet.dispatchEvent(new Event("marked"));
  } catch {
    sheet.replaceChildren(h("p.page-text.empty", {}, tr("Die Originalseite ist nicht verfügbar. Wurde die Datei verändert oder verschoben?")));
  }
}

// --- Audit and pairing ----------------------------------------------------------
async function openAudit(run) {
  const backdrop = h("div.modal-backdrop", { onclick: (e) => { if (e.target === backdrop) backdrop.remove(); } });
  const pre = h("pre", {}, tr("Lädt …"));
  let full = false, current = run.requests.at(-1).n;
  const show = async (n) => {
    current = n;
    pre.textContent = tr("Lädt …");
    const raw = await api(`/api/runs/${run.id}/requests/${n}`);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    pre.textContent = JSON.stringify(full ? data : { model: data.model, max_tokens: data.max_tokens, messages: data.messages }, null, 2);
    backdrop.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-pressed", b.dataset.n === String(n) ? "true" : "false"));
  };
  backdrop.append(h("div.modal", { role: "dialog", "aria-label": tr("Gesendete Anfragen") },
    h("header", {}, h("h2", {}, run.endpoint ? tr("Genau diese Anfragen gingen an {d}", { d: isLocal(run.endpoint) ? tr("das Modell auf diesem Computer") : new URL(run.endpoint).hostname }) : tr("Genau diese Anfragen gingen an Anthropic")), h("button.btn.small.quiet", { type: "button", onclick: () => backdrop.remove(), "aria-label": tr("Schliessen") }, icon("cross"))),
    h("div.tabs", {}, run.requests.map(r => h("button.btn.small", { type: "button", dataset: { n: String(r.n) }, onclick: () => show(r.n) }, tr("Anfrage {n}", { n: r.n }))),
      h("label.note", { style: { alignSelf: "center", marginLeft: "8px", display: "inline-flex", gap: "6px", alignItems: "center" } },
        h("input", { type: "checkbox", onchange: (e) => { full = e.target.checked; show(current); } }),
        tr("Mit Systemanweisung und Werkzeugbeschreibung (in jeder Anfrage gleich)"))),
    pre,
  ));
  document.body.append(backdrop);
  show(current);
}

/** Insert a claim at the cursor in Word, with its sources as a footnote. */
async function sendToWord(claim, run) {
  await attempt(async () => {
    const { delivered } = await api("/api/word/insert", { method: "POST", body: { run: run.id, claim: claim.id } });
    toast(delivered ? tr("In Word eingefügt, an der Cursorposition.") : tr("Word ist nicht verbunden."), !delivered);
  });
}

async function pairWord() {
  await attempt(async () => {
    const { code } = await api("/api/pair/code", { method: "POST" });
    const backdrop = h("div.modal-backdrop", { onclick: (e) => { if (e.target === backdrop) backdrop.remove(); } },
      h("div.modal", { role: "dialog", "aria-label": tr("Word verbinden"), style: { width: "min(460px, 100%)" } },
        h("header", {}, h("h2", {}, tr("Word verbinden")), h("button.btn.small.quiet", { type: "button", onclick: () => backdrop.remove(), "aria-label": tr("Schliessen") }, icon("cross"))),
        h("div", { style: { padding: "22px" } },
          h("p", {}, tr("Öffnen Sie in Word das CourtOS-Add-in und geben Sie diesen Code ein. Er gilt fünf Minuten und einmal.")),
          h("p.pair-code", {}, code),
          h("p.note", {}, tr("Noch nicht installiert? Im Terminal: courtos-local install-word"))),
      ));
    document.body.append(backdrop);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (document.querySelector(".modal-backdrop")) document.querySelector(".modal-backdrop").remove(); else if (S.drawer) closeDrawer(); }
});

boot().catch(() => renderUnpaired());
