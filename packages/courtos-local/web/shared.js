// Shared by the browser workspace and the Word task pane. No framework, no
// network beyond this local server.
import { TRANSLATIONS } from "./i18n.js";
import { partyTermLabel } from "./party-roles.js";

// --- language --------------------------------------------------------------
// German is the source language: every interface string is written in German
// and translated through i18n.js. Missing translations fall back to German.
const LANGS = ["de", "fr", "it", "en"];
function initialLang() {
  try { const saved = localStorage.getItem("courtos.lang"); if (LANGS.includes(saved)) return saved; } catch { /* storage may be blocked */ }
  const nav = (navigator.language || "de").slice(0, 2);
  return LANGS.includes(nav) ? nav : "de";
}
export let LANG = initialLang();
export const LANGUAGES = [["de", "Deutsch"], ["fr", "Français"], ["it", "Italiano"], ["en", "English"]];
export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  LANG = lang;
  try { localStorage.setItem("courtos.lang", lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
}
document.documentElement.lang = LANG;

/**
 * Run fn with tr() and label() answering in another language, without changing
 * the interface. Used for text that goes into the court's own document, which
 * is written in the language of the proceedings. fn's synchronous part only.
 */
export function inLanguage(lang, fn) {
  if (!LANGS.includes(lang)) return fn();
  const previous = LANG;
  LANG = lang;
  try { return fn(); } finally { LANG = previous; }
}

/** Translate a German source string; {name} placeholders are filled from vars. */
export function tr(source, vars = null) {
  const text = LANG === "de" ? source : (TRANSLATIONS[LANG]?.[source] ?? source);
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : text;
}
// Page references come from the server in the language of the proceedings; pg() shows
// German ones ("S. 3", "Abs. 4", "Abschnitt 2") in the interface language.
const REF_WORDS = { de: ["S.", "Abs.", "Abschnitt"], fr: ["p.", "par.", "section"], it: ["pag.", "cpv.", "sezione"], en: ["p.", "para.", "section"] };
/** A page or passage reference in the interface language. */
export function pg(text) {
  if (!text || LANG === "de") return text ?? "";
  const [page, para, passage] = REF_WORDS[LANG];
  return String(text).replace(/\bS\. (?=\d)/g, `${page} `).replace(/(\d) S\.(?!\s*\d)/g, `$1 ${page}`).replace(/\bAbs\. (?=\d)/g, `${para} `).replace(/\bAbschnitt (?=\d)/g, `${passage} `);
}
/** "Label, S. 3" for a citation or reference. */
export const refLabel = (c) => (c.page_label ? `${c.label}, ${pg(c.page_label)}` : c.label);

/** Count-dependent string: German singular and plural source strings, {n} filled in. */
export function trn(n, one, many, vars = {}) {
  return tr(n === 1 ? one : many, { ...vars, n });
}

const LABELS = {
  task: {
    chronology: "Chronologie", facts_evidence: "Behauptungen und Beweise", party_comparison: "Positionen vergleichen",
    legal_claims: "Rechtsargumente prüfen", source_chat: "Quellen befragen", decision_draft: "Entscheid entwerfen",
    fundamental_questions: "Grundfragen", hypothetical_impact: "Auswirkungen einer Annahme",
  },
  role: { claim: "Klage", response: "Antwort", submission: "Eingabe", exhibit: "Beilage", literature: "Literatur", authority: "Entscheid", internal_note: "Interne Notiz", other: "Weitere" },
  posture: { allegation: "Behauptung", denial: "Bestreitung", disputed: "strittig", unresolved: "offen" },
  facts: { supports: "gestützt", contradicts: "widersprochen", inconclusive: "offen", not_found: "kein Beweismittel" },
  legal: { supports: "gestützt", contrary: "entgegenstehend", insufficient: "nicht ausreichend belegt", not_found_in_selected_sources: "keine Grundlage gefunden", manual_check_required: "selbst prüfen" },
  category: { relief: "Rechtsbegehren", fact: "Sachverhalt", legal: "Rechtliches" },
  part: { facts: "Sachverhalt", issue: "Streitfrage", reasoning: "Erwägung", counterargument: "Gegenargument", open_issue: "Offener Punkt", disposition: "Dispositiv (Vorschlag)" },
  draftStatus: { alleged: "behauptet", disputed: "strittig", working_assumption: "Arbeitsannahme", analysis: "Analyse", proposal: "Vorschlag" },
  noteStatus: { proposed: "vorgeschlagen", adopted: "übernommen", disputed: "strittig", done: "erledigt" },
  noteKind: { note: "Notiz", question: "Offene Frage", assumption: "Arbeitsannahme", contradiction: "Widerspruch" },
  kind: { person: "Person", organisation: "Organisation", address: "Adresse", place: "Ort", parcel: "Grundstück", email: "E-Mail", phone: "Telefon", iban: "Konto (IBAN)", ahv: "AHV-Nummer", uid: "UID", url: "Profil/Link", plate: "Kennzeichen", birthdate: "Geburtsdatum", insured: "Versichertennummer", zemis: "ZEMIS-Nummer", document: "Ausweisnummer", account: "Kontonummer", number: "Nummer", identifier: "Kennung" },
};
export const label = (group, value) => (LABELS[group]?.[value] ? tr(LABELS[group][value]) : value ?? "");
/** A label in a given language rather than the interface language (e.g. the language of the proceedings). */
export const labelIn = (lang, group, value) => {
  const source = LABELS[group]?.[value];
  if (!source) return value ?? "";
  return lang === "de" ? source : (TRANSLATIONS[lang]?.[source] ?? source);
};
export const TASK_ORDER = ["chronology", "facts_evidence", "party_comparison", "legal_claims", "fundamental_questions", "decision_draft", "hypothetical_impact", "source_chat"];

export function partyLabel(state, party) {
  if (!party) return tr("ohne Partei");
  const entry = state?.case?.parties?.find(p => p.id === party);
  if (!entry) return party;
  // Role in the interface language, with the name as it is shown locally.
  return [party, partyTermLabel(LANG, entry.role, entry.gender_used ?? null), entry.name].filter(Boolean).join(" · ");
}

// --- errors ------------------------------------------------------------------
const ERRORS = {
  not_paired: "Diese Seite ist noch nicht mit CourtOS verbunden.",
  invalid_language: "Diese Verfahrenssprache wird nicht unterstützt.",
  consent_required: "Der Ordner ist nicht oder nicht mehr für Claude freigegeben. Prüfen Sie den Schutz und geben Sie ihn frei.",
  api_key_missing: "Für Claude ist ein API-Schlüssel nötig. Hinterlegen Sie ihn unter Analyse.",
  run_in_progress: "Ein Auftrag läuft bereits.",
  mirror_has_issues: "Die ersetzte Fassung hat offene Probleme. Prüfen Sie die markierten Seiten im Schutz.",
  outbound_blocked: "Gestoppt: Die Anfrage hätte eine registrierte Originalangabe enthalten. Nichts wurde gesendet.",
  folder_changed_during_run: "Der Ordner hat sich während des Auftrags geändert. Bitte erneut freigeben und starten.",
  replacement_taken: "Diese Ersatzbezeichnung ist schon vergeben oder kommt im Text vor.",
  invalid_reading: "Diese Lesart passt nicht zu dem Wort aus der Texterkennung.",
  replacement_contains_original: "Die Ersatzbezeichnung enthält den Originalnamen.",
  alias_taken: "Diese Schreibweise gehört bereits zu einer anderen Angabe.",
  text_not_found: "Dieser Text kommt in den einbezogenen Akten nicht vor.",
  demo_question_only: "Im Demo-Modus gibt es nur die vorbereitete Frage. Für freie Fragen ist ein API-Schlüssel nötig.",
  demo_not_available: "Diese Aufgabe braucht einen API-Schlüssel; die Demo umfasst Chronologie, Behauptungen und Beweise sowie die vorbereitete Frage.",
  invalid_key: "Das sieht nicht wie ein Anthropic-API-Schlüssel aus (sk-ant-…).",
  result_failed_validation: "Claude konnte kein Ergebnis liefern, das alle Zitatprüfungen besteht. Nichts wurde übernommen.",
  token_limit_reached: "Das Tokenlimit für diesen Auftrag ist erreicht. Nichts wurde übernommen.",
  output_limit_reached: "Die Antwort wurde zu lang. Wählen Sie weniger Dokumente oder eine engere Frage.",
  model_refused: "Claude hat diesen Auftrag abgelehnt. Nichts wurde übernommen. Eine enger gefasste Frage oder eine andere Auswahl der Akten kann helfen.",
  no_result_submitted: "Claude hat kein Ergebnis eingereicht. Nichts wurde übernommen.",
  turn_limit_reached: "Der Auftrag brauchte zu viele Schritte und wurde beendet. Nichts wurde übernommen.",
  provider_401: "Anthropic lehnt den API-Schlüssel ab.",
  provider_429: "Anthropic meldet ein Ratenlimit. Später erneut versuchen.",
  provider_529: "Anthropic ist überlastet. Später erneut versuchen.",
  provider_unreachable: "Anthropic ist nicht erreichbar.",
  folder_not_allowed: "Dieser Ordner kann nur über die Ordnerauswahl geöffnet werden.",
  last_alias: "Eine Angabe braucht mindestens eine Schreibweise.",
  pairing_failed: "Der Code stimmt nicht oder ist abgelaufen.",
  too_many_attempts: "Zu viele Fehlversuche. Starten Sie CourtOS neu.",
  assumption_required: "Wählen Sie mindestens eine Arbeitsannahme aus den Notizen.",
  question_required: "Bitte eine Frage eingeben.",
  caselaw_unreachable: "OpenCaseLaw ist nicht erreichbar.",
  caselaw_unavailable: "OpenCaseLaw hat die Anfrage nicht beantwortet.",
  caselaw_query_invalid: "Bitte zwei bis 300 Zeichen eingeben.",
  decision_not_found: "Dieser Entscheid ist auf OpenCaseLaw nicht vorhanden.",
  text_unpseudonymisable: "Der Text enthält eine Ersatzbezeichnung, die mit einem Namen kollidiert. Bitte umformulieren.",
  date_required: "Bitte ein Datum angeben.",
  invalid_text: "Bitte einen Text eingeben.",
  workspace_unsafe: "Der Arbeitsordner .courtos ist ein Verweis auf einen anderen Ort. CourtOS schreibt dort nicht.",
};
export const errorText = (code) => tr(ERRORS[code] ?? (String(code).startsWith("provider_") ? "Anthropic hat die Anfrage abgelehnt." : "Das hat nicht geklappt. Bitte erneut versuchen."));

export class ApiError extends Error {
  constructor(code, status, detail) { super(code); this.code = code; this.status = status; this.detail = detail; }
}

export async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method, credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json", "X-CourtOS": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get("Content-Type") ?? "";
  const data = type.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(data?.error ?? "request_failed", response.status, data?.detail);
  return data;
}

export async function pairFromHash() {
  const match = /#pair=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!match) return;
  history.replaceState(null, "", location.pathname);
  await api("/api/pair", { method: "POST", body: { token: match[1] } }).catch(() => {});
}

export function events(handlers) {
  const source = new EventSource("/api/events", { withCredentials: true });
  for (const [type, handler] of Object.entries(handlers)) source.addEventListener(type, (e) => handler(JSON.parse(e.data)));
  return source;
}

// --- DOM ---------------------------------------------------------------------
/** Minimal element builder. Strings are always text nodes, never HTML. */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = name === "svg" || name === "path" || name === "circle" ? document.createElementNS("http://www.w3.org/2000/svg", name) : document.createElement(name || "div");
  if (classes.length) el.setAttribute("class", classes.join(" "));
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "class") el.setAttribute("class", [el.getAttribute("class"), value].filter(Boolean).join(" "));
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key in el && !(el instanceof SVGElement) && key !== "list") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const ICONS = {
  check: "M3.5 8.5l3 3 6-7",
  cross: "M4 4l8 8M12 4l-8 8",
  dash: "M4 8h8",
  ring: null,
  search: "M7 12a5 5 0 110-10 5 5 0 010 10zM10.7 10.7L14 14",
  doc: "M4 1.5h5l3 3v10H4zM9 1.5v3h3",
  lock: "M4.5 7V5a3.5 3.5 0 017 0v2M3.5 7h9v7h-9z",
  out: "M9 2h5v5M14 2L7 9M12 9.5V14H2V4h4.5",
  folder: "M1.5 3.5h4.5l1.5 1.5h7v8.5h-13z",
  eye: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 100-4 2 2 0 000 4z",
  note: "M3 2.5h10v8l-3 3H3zM10 13.5v-3h3",
  scale: "M8 2v12M4 14h8M3 5h10M3 5l-1.5 4a2 2 0 003 0zM13 5l-1.5 4a2 2 0 003 0z",
  calendar: "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3",
  plus: "M8 3v10M3 8h10",
  arrow: "M3 8h10M9 4l4 4-4 4",
  spark: "M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.4 3.4l2.1 2.1M10.5 10.5l2.1 2.1M3.4 12.6l2.1-2.1M10.5 5.5l2.1-2.1",
};
export function icon(name, labelText = null) {
  const svg = h("svg", { viewBox: "0 0 16 16", width: "16", height: "16", class: `icon icon-${name}`, "aria-hidden": labelText ? null : "true", role: labelText ? "img" : null, "aria-label": labelText });
  if (name === "ring") svg.append(h("circle", { cx: "8", cy: "8", r: "4.5" }));
  else svg.append(h("path", { d: ICONS[name] }));
  return svg;
}

/** Claim text with restored names marked; the pseudonym that left the machine is in the tooltip. */
export function claimText(display) {
  return h("span.claim-text", {}, display.segments.map(segment => segment.pseudonym
    ? h("span.restored", { title: tr("Lokal wiederhergestellt. Claude sah: {p}", { p: segment.pseudonym }) }, segment.text)
    : segment.text));
}

export function citationChip(citation, onOpen, changed = null) {
  const exact = citation.match === "exact";
  // The page this citation was checked against has changed since the run.
  const moved = Boolean(changed && citation.document && changed.has(`${citation.document}:${citation.page}`));
  const note = citation.kind === "note" || citation.internal_note;
  const kindClass = citation.kind === "authority" ? "is-authority" : note ? "is-note" : null;
  return h("button.cite", {
    type: "button", class: [exact ? "is-exact" : "is-unverified", kindClass, moved ? "is-stale" : null].filter(Boolean).join(" "),
    title: (moved ? tr("Diese Seite hat sich seit dem Auftrag geändert.") + " " : "") + (exact ? tr("An der Quelle geprüft: «{q}»", { q: (citation.quote_original ?? "").slice(0, 240) }) : tr("Nicht verifiziert")),
    onclick: () => onOpen(citation),
  }, icon(citation.kind === "authority" ? "scale" : note ? "note" : exact ? "check" : "cross"),
  refLabel(citation));
}

const MONTHS = { januar: 1, jänner: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12, janvier: 1, février: 2, mars: 3, avril: 4, juin: 6, juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, dicembre: 12, january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, october: 10, december: 12 };
export function parseDate(text) {
  if (!text) return null;
  let m = /(\d{1,2})\.?(?:er)?\s*([A-Za-zäöüéèûô]+)\s+(\d{4})/u.exec(text);
  if (m && MONTHS[m[2].toLowerCase()]) return new Date(Number(m[3]), MONTHS[m[2].toLowerCase()] - 1, Number(m[1]));
  m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}
export const formatDate = (iso) => { const d = parseDate(iso); return d ? d.toLocaleDateString(LANG === "en" ? "en-GB" : `${LANG}-CH`, { day: "numeric", month: "long", year: "numeric" }) : iso ?? ""; };

export function traceText(event) {
  switch (event.type) {
    case "status": return event.status === "running" ? tr("Auftrag gestartet") : event.status === "succeeded" ? tr("Fertig") : event.status === "cancelled" ? tr("Abgebrochen") : errorText(event.error?.code ?? event.status);
    case "thinking": return null;
    case "list": return trn(event.documents, "Überblick über {n} Dokument", "Überblick über {n} Dokumente");
    case "read": return event.count ? tr("Liest {pages}", { pages: compactPages(event.pages) }) : tr("Liest – keine lesbaren Seiten");
    case "search": return tr("Sucht «{q}» in den Akten – {n} Treffer", { q: event.query, n: event.hits });
    case "caselaw_search": return event.error ? tr("OpenCaseLaw: {e}", { e: event.error }) : trn(event.hits, "Sucht auf OpenCaseLaw «{q}» – {n} Entscheid", "Sucht auf OpenCaseLaw «{q}» – {n} Entscheide", { q: event.query });
    case "caselaw_read": return event.error ? tr("Entscheid nicht verfügbar: {l}", { l: event.label }) : tr("Liest {l}", { l: event.label });
    case "caselaw_error": return tr("OpenCaseLaw vorübergehend nicht erreichbar");
    case "rejected": return tr("Prüfung nicht bestanden: {r} Claude korrigiert.", { r: humanReject(event.reason) });
    case "validated": return tr("{c} Aussagen in {r} Zeilen bestehen die Zitatprüfung", { c: event.claims, r: event.rows });
    case "bound": return tr("{v} von {c} Aussagen an Originalstellen gebunden", { v: event.verified, c: event.claims });
    case "note": return event.text;
    default: return null;
  }
}

function humanReject(reason = "") {
  const code = reason.split(":")[0];
  const text = { quote_ambiguous: "Ein Zitat ist auf der Seite nicht eindeutig.", quote_absent: "Ein Zitat steht so nicht in der Quelle.", read_before_quoting: "Zitat aus einer ungelesenen Seite.", party_attribution: "Aussage der falschen Partei zugeordnet.", date_quote: "Datum nicht wörtlich belegt.", source_role: "Beleg aus der falschen Quellenart.", relief_source: "Rechtsbegehren nicht wörtlich übernommen." }[code];
  return tr(text ?? "Struktur unvollständig.");
}

function compactPages(pages) {
  // "Klage S. 1, Klage S. 2, Klage S. 3" → "Klage S. 1–3", in any case language.
  const byDoc = new Map();
  for (const item of pages) {
    const m = /^(.*) ((?:S\.|p\.|pag\.|Abs\.|par\.|cpv\.|para\.) .+)$/.exec(item);
    const doc = m ? m[1] : item, page = m ? m[2] : "";
    if (!byDoc.has(doc)) byDoc.set(doc, []);
    byDoc.get(doc).push(page);
  }
  return [...byDoc].map(([doc, list]) => {
    const parsed = list.map(p => /^(S\.|p\.|pag\.) (\d+)$/.exec(p));
    if (list.length > 1 && parsed.every(Boolean) && new Set(parsed.map(m => m[1])).size === 1) {
      const numbers = parsed.map(m => Number(m[2]));
      return pg(`${doc} ${parsed[0][1]} ${Math.min(...numbers)}–${Math.max(...numbers)}`);
    }
    return pg(`${doc} ${list.join(", ")}`.trim());
  }).join(", ");
}

/** Plain text of a claim with its references, for copying and Word. */
export function claimPlain(claim) {
  return claim?.display?.text ?? claim?.text ?? "";
}
export function refsPlain(claim) {
  return [...new Set((claim?.citations ?? []).map(refLabel))].join("; ");
}
