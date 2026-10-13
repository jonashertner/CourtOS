// Local suggestions of identifying details. Conservative by design: a human
// reviews the register before anything is released, and the outbound guard
// blocks any request that still contains a registered original.
//
// The company, honorific-person, e-mail, IBAN and phone patterns follow
// frontend/src/app/lib/deviceWorkspace/redactionCandidates.ts so that both
// paths suggest the same identities. Additional Swiss identifiers, addresses,
// role-introduced and given-name persons, and core-name propagation are new.
import { aliasExpression, escapeRegex } from "./util.mjs";
import { REPLACEMENT_PREFIX } from "./language.mjs";

export const STRUCTURED_KINDS = new Set(["email", "iban", "phone", "ahv", "uid", "url", "plate", "birthdate"]);
/** German replacement labels; other case languages in language.mjs. */
export const PREFIX = REPLACEMENT_PREFIX.de;

const L = "\\p{L}\\p{M}";
/** IBANs of Switzerland, Liechtenstein and the countries a Swiss case most often meets. */
export const IBAN = /\b(?:CH|LI|DE|AT|FR|IT|GB|NL|BE|LU|ES|PT|IE|DK|SE|NO|FI|PL|CZ|SK|HU|SI|HR|MC|SM|GR)[0-9]{2}(?:[ \t]?[A-Z0-9]){12,30}\b/g;
const NAME = `\\p{Lu}[${L}’'-]+`;
const STRUCTURED = [
  ["email", /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?\.[\p{L}]{2,24}/giu],
  ["url", /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[\p{L}\p{N}-]+\.[\p{L}]{2,24}[^\s<>"')\]]*/giu],
  ["iban", IBAN],
  ["ahv", /(?<!\d)756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}(?!\d)/g],
  ["uid", /\bCHE[-\s]?\d{3}[.\s]?\d{3}[.\s]?\d{3}(?:\s?(?:MWST|TVA|IVA|HR|RC|RI))?(?!\d)/g],
  // VAT numbers of neighbouring countries and the United Kingdom.
  ["uid", /\b(?:GB[ ]?\d{3}[ ]?\d{4}[ ]?\d{2}(?:[ ]?\d{3})?|DE[ ]?\d{9}|ATU[ ]?\d{8}|IT[ ]?\d{11}|FR[ ]?[0-9A-Z]{2}[ ]?\d{9}|NL[ ]?\d{9}B\d{2})(?!\d)/g],
  ["phone", /(?<![\p{L}\p{N}])(?:\+|00)[1-9][0-9]{0,2}(?:[ ().-]*[0-9]){7,12}(?![\p{L}\p{N}])|(?<![\d.'’])0\d{2}[ ]\d{3}[ ]\d{2}[ ]\d{2}(?!\d)/gu],
];

// Swiss vehicle plates ("VD 184 227", "TI 198432"). A short number or a year after a
// canton abbreviation ("ZH 2024") counts only where a vehicle is mentioned just before.
const CANTONS = "AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH";
const PLATE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${CANTONS})[ \\t-]?\\d{1,3}(?:[ '’]?\\d{3})?(?![\\p{L}\\p{N}])`, "gu");
const VEHICLE = /(?:kontrollschild|kennzeichen|nummernschild|fahrzeug|auto|plaque|immatriculation|véhicule|voiture|targa|veicolo|vettura|registration|plate|vehicle|car)\b/iu;
// A date of birth after its cue, in the four languages: "born 3 March 1975", "nato il 14 maggio 1978".
const MONTHS = "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|dicembre|January|February|March|May|June|July|October|December";
const DATE = `(?:\\d{1,2}(?:\\.|er|°)?[ \\t]*(?:\\d{1,2}\\.|${MONTHS})[ \\t]*\\d{4}|\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}|(?:${MONTHS})[ \\t]+\\d{1,2},?[ \\t]+\\d{4})`;
const BIRTH = new RegExp(`(?<![\\p{L}])(?:born(?:[ \\t]+on)?|date[ \\t]+of[ \\t]+birth|D\\.?O\\.?B\\.?|geb(?:oren)?\\.?(?:[ \\t]+am)?|Geburtsdatum|n[ée]e?(?:[ \\t]+le)?|date[ \\t]+de[ \\t]+naissance|nat[oa](?:[ \\t]+il)?|data[ \\t]+di[ \\t]+nascita)[ \\t:]*(${DATE})`, "giu");
// Initials standing for a person ("D.L.", "U.B."), not common abbreviations.
const INITIALS = /(?<![\p{L}\p{N}.])\p{Lu}\.[ ]?\p{Lu}\.(?!\p{L})(?![ ]?\p{Lu}\.)/gu;
const NOT_INITIALS = new Set("S.A. N.B. P.S. U.S. U.K. E.U. A.D. B.C. P.O. C.V. Q.C. K.C. R.I.P.".split(" "));

// Banks are named without a legal form: "Raiffeisenbank Rheintal", "Banque Cantonale Vaudoise".
// A following street name ("Raiffeisenbank Rheintal Bahnhofstrasse 9") is not part of the name.
// "Bank AG" in "Aareland Bank AG" is the company rule's, and a legal form is not a name.
const BANK_WORD = String.raw`(?:St\.|Ste\.|(?!(?:AG|SA|SpA|plc|PLC|Ltd|GmbH|Sagl|Sàrl|Srl|Inc)(?![\p{L}-]))\p{Lu}[\p{L}-]*(?<!strasse|gasse|weg|platz|allee|ring|quai)(?![\p{L}-]))`;
const BANK = new RegExp(String.raw`(?<![\p{L}])(?:\p{Lu}[\p{L}-]*bank(?:[ \t]+${BANK_WORD}){1,2}|(?<!\p{Lu}[\p{L}-]*[ \t]+)(?:Bank|Banque|Banca|Banco)[ \t]+(?:(?:de|des|du|di|della|dello|del)[ \t]+)?${BANK_WORD}(?:[ \t]+${BANK_WORD}){0,2})`, "gu");

const COMPANY = /(?<![\p{L}\p{N}])(?:(?:[\p{Lu}][\p{L}\p{N}’'&-]*|(?:\p{Lu}\.)+|(?:Dr|Prof|Ing|Co|Inc|Corp|Ltd|Bros)\.)[ \t]+){1,5}?(?:AG|GmbH|SA|S\.A\.|Sàrl|SARL|Sarl|SAS|Sagl|Srl|S\.r\.l\.|SpA|S\.p\.A\.|Ltd\.?|plc|PLC|LLP|LLC|Inc\.|B\.V\.|BV|N\.V\.|NV|KlG|KG|Genossenschaft|Stiftung)(?![\p{L}\p{N}])/gu;
const TITLES = "(?:(?:Herrn?|Frau|Dr\\.(?:\\s?(?:iur|med|phil|oec)\\.)?|Prof\\.|RA|RAin|Rechtsanwalt|Rechtsanwältin|lic\\.\\s?iur\\.|MLaw|BLaw|M\\.|Mme|Mlle|Me|Maître|avv\\.|Avv\\.|dott\\.|Dott\\.|Sig\\.(?:ra)?|Signor|Signora|Mr\\.?|Mrs\\.?|Ms\\.?)\\s+)";
// A name continues on its line only: "Me Antoine Perret⏎Dossier" is not a three-word name.
const TITLED_PERSON = new RegExp(`(?<![${L}])${TITLES}+(${NAME}(?:[ \\t]+${NAME}){0,2})`, "gu");
const ROLE_PERSON = new RegExp(`(?<![${L}])(?:Geschäftsführerin|Geschäftsführer|Bauleiterin|Bauleiter|Sachverständigen|Sachverständige|Sachverständiger|Gutachterin|Gutachter|Zeugin|Zeuge|Referentin|Referent|Verwaltungsrätin|Verwaltungsrat|Präsidentin|Präsident|Vertreterin|Vertreter|témoin|experte?|perito|testimone|witness|expert)\\s+(${NAME}[ \\t]+${NAME})`, "gu");
const STREET = new RegExp(`(?<![${L}])(?:[\\p{Lu}][${L}-]*(?:strasse|straße|str\\.|gasse|weg|platz|rain|halde|quai|allee|ring|matte|graben|steig)|(?:[Rr]ue|[Cc]hemin|[Cc]h\\.|[Aa]venue|[Aa]v\\.|[Rr]oute|[Pp]lace|[Bb]oulevard|[Vv]ia|[Vv]iale|[Pp]iazza|[Vv]icolo)(?:\\s+(?:de\\s+la|de|des|du|del|della|dei|d'))?\\s+[\\p{Lu}][${L}'’-]+)\\s+\\d{1,4}[a-z]?(?![${L}\\d])`, "gu");
const PLACE = new RegExp(`(?<![\\d.'’])([1-9]\\d{3})[ \\t\\u00a0]+(\\p{Lu}[${L}.-]+(?:\\s(?:bei|b\\.|am|an der|sur|près|di|im)\\s\\p{Lu}[${L}.-]+)?)(?![${L}])`, "gu");
const MAJOR_PLACES = new Set("Zürich Genève Genf Basel Bern Lausanne Winterthur Luzern Lucerne St.Gallen Lugano Biel Bienne Thun Fribourg Freiburg Neuchâtel Schaffhausen Chur Sion Sitten Zug Aarau Bellinzona Locarno Solothurn Frauenfeld Liestal Delémont Glarus Altdorf Sarnen Stans Schwyz Herisau Appenzell".split(" "));
// "2025 CHF 210'000" in a table is a year and an amount, not a postcode and a town.
const CURRENCY = new Set(["CHF", "EUR", "USD", "GBP", "Fr.", "SFr."]);
const DATE_BEFORE = /(?:\d{1,2}\.\s*|(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|January|February|March|June|July|October|December)\s*)$/u;
const COMPANY_PREFIX = /^(?:(?:in\s+)?Sachen|Firma|Klägerin|Kläger|Beklagte|Beklagten|Bestellerin|Unternehmerin|Auftraggeberin|Auftragnehmerin|Begünstigte|Gesellschaft|Mandantin|Partei|Gegen|Betreff|Von|An|Für|Zwischen|Und|Die|Der|Das|La|Le|Les|Il|Lo|The)\s+/u;
const PARCEL = /(?:Grundstück|Parzelle|Kat\.-?Nr\.|parcelle|bien-fonds|particella|fondo)\s*(?:Nr\.|n°|no\.|n\.)?\s*\d{1,6}(?:\s*,?\s*(?:Grundbuch|GB|registre foncier|RF|registro fondiario|RFD)\s+[\p{Lu}][\p{L}-]+)?/gu;

// Frequent given names (DE/FR/IT/EN/RM). Used only together with a following
// capitalised surname; a match is a suggestion for human review.
const GIVEN = new Set(`Adrian Alain Albert Alessandro Alessia Alexander Alexandra Alice Alina Ana Andrea Andreas Angela Anna Anne Annina Antoine Antonio Barbara Beat Beatrice Benjamin Bernhard Bruno Carla Carlo Caroline Catherine Chantal Christian Christine Christoph Claire Claudia Claudio Corinne Cristina Daniel Daniela David Denise Dominik Doris Eliane Elias Elisabeth Elena Emma Eric Erika Esther Fabian Fabienne Federica Felix Florian Francesca Francesco Franziska François Frédéric Gabriel Gabriela Georg Gianluca Giorgio Giovanni Giulia Hans Hanna Hannah Heidi Heinz Helen Isabelle Jacqueline Jan Jana Jean Jeanne Jessica Johanna Johannes Jonas Josef Julia Julian Jürg Karin Katharina Kevin Laura Laurent Lea Leon Lina Linda Lisa Livia Luca Lucas Lukas Luzia Manuel Manuela Mara Marc Marcel Marco Maria Marie Marina Mario Markus Martin Martina Mathias Matteo Matthias Maurice Max Melanie Michael Michel Michèle Monika Nadia Nadine Natalie Nicolas Nicole Nina Noah Nora Olivier Pascal Patricia Patrick Paul Peter Philipp Pierre Rahel Ramona Regula Reto Roberto Roger Roland Roman Rosa Ruth Sabine Samuel Sandra Sara Sarah Silvia Simon Simone Sophie Stefan Stefanie Stéphane Susanne Sven Tamara Thomas Tobias Ursula Urs Valentina Valérie Vanessa Verena Walter Werner Yves`.split(/\s+/));
const NOT_SURNAME = new Set("Die Der Das Und Oder Am Im In Mit Von Vom Zur Zum Seit Bei Nach Für Gemäss Laut AG GmbH SA Hotel".split(" "));
const GENERIC_COMPANY_WORDS = new Set("Hotel Hotels Bau Immobilien Holding Partner Partners Treuhand Group Gruppe Services Service Consulting Management Invest Swiss Schweiz Suisse Svizzera International Verwaltung Handel Technik Bank Legal Rechtsanwälte Versicherung Versicherungen Transport Garage Restaurant Immo Real Estate Capital Finance Pharma Energie Media Software Systems Solutions".split(" "));

const normal = (text) => text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("de");

function collect(pattern, text, group = 0) {
  const hits = [];
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[group];
    if (!value) continue;
    const start = match.index + match[0].indexOf(value);
    hits.push({ value: value.trim().replace(/[.,;:]+$/u, ""), start });
  }
  return hits;
}

/**
 * @param {Array<{id:string,pages:Array<{n:number,text:string}>}>} documents
 * @returns {Array<{key,kind,label,aliases,count,samples,notes}>}
 */
export function detectCandidates(documents) {
  const entities = new Map();
  const add = (kind, label, doc, page, start, alias = label, note = null) => {
    const clean = label.replace(/\s+/gu, " ").trim();
    if (clean.length < 2) return;
    const key = `${STRUCTURED_KINDS.has(kind) ? kind : kind === "organisation" ? "organisation" : kind}:${normal(clean)}`;
    let entity = entities.get(key);
    if (!entity) entities.set(key, entity = { key, kind, label: clean, aliases: new Set(), count: 0, samples: [], notes: [], seen: new Set() });
    entity.aliases.add(alias.replace(/\s+/gu, " ").trim());
    if (note && !entity.notes.includes(note)) entity.notes.push(note);
    // Several patterns can find the same occurrence ("Dr. Anna Keller").
    const where = `${doc}:${page}:${start}`;
    if (entity.seen.has(where)) return;
    entity.seen.add(where);
    entity.count++;
    if (entity.samples.length < 8) entity.samples.push({ doc, page, start, length: alias.length });
  };

  for (const document of documents) for (const page of document.pages) {
    const text = page.text;
    // Structured identifiers: the longest hit wins where two overlap (an IBAN
    // also looks like a phone number), so no two identities share characters.
    const structured = STRUCTURED.flatMap(([kind, pattern]) => collect(pattern, text).map(hit => ({ kind, ...hit })));
    for (const match of text.matchAll(PLATE)) {
      const digits = match[0].replace(/\D/g, "");
      const vehicle = VEHICLE.test(text.slice(Math.max(0, match.index - 60), match.index));
      if (!vehicle && (digits.length < 3 || /^(?:19|20)\d\d$/.test(digits))) continue;
      // "Muster AG 2024": the legal form, not the canton of Aargau.
      if (!vehicle && match[0].startsWith("AG") && /\p{Lu}[\p{L}-]*[ \t]+$/u.test(text.slice(Math.max(0, match.index - 30), match.index))) continue;
      structured.push({ kind: "plate", value: match[0], start: match.index });
    }
    for (const hit of collect(BIRTH, text, 1)) structured.push({ kind: "birthdate", ...hit });
    structured.sort((a, b) => a.start - b.start || b.value.length - a.value.length);
    let reach = -1;
    for (const hit of structured) {
      if (hit.start < reach) continue;
      reach = hit.start + hit.value.length;
      add(hit.kind, hit.value, document.id, page.n, hit.start);
    }
    for (const hit of collect(COMPANY, text)) {
      let label = hit.value;
      while (COMPANY_PREFIX.test(label)) label = label.replace(COMPANY_PREFIX, "");
      if (label.split(/\s+/).length < 2) continue;
      add("organisation", label, document.id, page.n, hit.start + hit.value.indexOf(label));
    }
    for (const hit of collect(BANK, text)) add("organisation", hit.value, document.id, page.n, hit.start, hit.value, "bank_name");
    for (const match of text.matchAll(PLACE)) {
      // "1173 Féchy." at the end of a sentence is the town Féchy; "St." keeps its point.
      const end = match[2].length > 4 ? match[2].replace(/\.+$/u, "") : match[2];
      const town = end, whole = match[0].slice(0, match[0].length - (match[2].length - end.length));
      // "12. Mai 2025 Klage": a year after a date is not a postcode.
      if (DATE_BEFORE.test(text.slice(Math.max(0, match.index - 16), match.index))) continue;
      if (CURRENCY.has(town)) continue;
      add("place", town, document.id, page.n, match.index, whole);
    }
    for (const hit of collect(TITLED_PERSON, text, 1)) {
      const tokens = hit.value.split(/\s+/);
      if (tokens.length === 1) add("surname", tokens[0], document.id, page.n, hit.start);
      else add("person", hit.value, document.id, page.n, hit.start);
    }
    for (const hit of collect(ROLE_PERSON, text, 1)) add("person", hit.value, document.id, page.n, hit.start);
    for (const match of text.matchAll(new RegExp(`(?<![${L}])(${NAME})[ \\t]+(${NAME}(?:-${NAME})?)(?![${L}])`, "gu"))) {
      if (GIVEN.has(match[1]) && !NOT_SURNAME.has(match[2]) && !GIVEN.has(match[2])) add("person", `${match[1]} ${match[2]}`, document.id, page.n, match.index);
    }
    for (const match of text.matchAll(INITIALS)) {
      if (!NOT_INITIALS.has(match[0].replace(/\s/g, ""))) add("person", match[0], document.id, page.n, match.index);
    }
    for (const hit of collect(STREET, text)) add("address", hit.value, document.id, page.n, hit.start);
    for (const hit of collect(PARCEL, text)) add("parcel", hit.value, document.id, page.n, hit.start);
  }

  // A surname introduced by a title joins the single person with that surname.
  // If several persons share it, it stays a separate, flagged suggestion.
  const persons = [...entities.values()].filter(e => e.kind === "person");
  for (const entity of [...entities.values()].filter(e => e.kind === "surname")) {
    const owners = persons.filter(p => p.label.split(" ").at(-1) === entity.label);
    if (owners.length === 1) {
      const fresh = entity.samples.filter(sample => !owners[0].seen.has(`${sample.doc}:${sample.page}:${sample.start}`));
      owners[0].count += fresh.length;
      owners[0].samples.push(...entity.samples.slice(0, 8 - owners[0].samples.length));
      owners[0].aliases.add(entity.label);
      owners[0].notes.push("surname_alone");
      entities.delete(entity.key);
    } else {
      entity.kind = "person";
      entity.notes.push(owners.length ? "shared_surname" : "surname_only");
    }
  }

  // Distinctive company words ("Alpenblick") also identify the organisation
  // when they appear without the legal form ("Hotel Alpenblick").
  const allText = documents.flatMap(d => d.pages.map(p => p.text)).join("\n\n");
  const claimed = new Map();
  for (const entity of entities.values()) for (const alias of entity.aliases) for (const token of alias.split(/\s+/)) claimed.set(token, (claimed.get(token) ?? new Set()).add(entity.key));
  for (const entity of [...entities.values()].filter(e => e.kind === "organisation")) {
    const core = entity.label.split(/\s+/).filter(token => /^\p{Lu}/u.test(token) && token.length >= 4
      && !GENERIC_COMPANY_WORDS.has(token) && !/^(AG|GmbH|SA|Sàrl|Sagl|Srl|Ltd|LLC|KG|KlG)$/u.test(token));
    for (const token of core) {
      const owners = claimed.get(token) ?? new Set();
      if ([...owners].some(key => key !== entity.key)) { entity.notes.push("core_name_shared"); continue; }
      const standalone = [...allText.matchAll(aliasExpression(token, "gu"))].length;
      const inFull = [...allText.matchAll(aliasExpression(entity.label, "gu"))].length;
      if (standalone > inFull) { entity.aliases.add(token); entity.notes.push("core_name"); }
    }
  }

  // A town given with its postcode also identifies when it appears alone,
  // except for large cities (court seats, "Zürich"), which stay readable.
  for (const entity of [...entities.values()].filter(e => e.kind === "place")) {
    if (MAJOR_PLACES.has(entity.label.replace(/\s+/g, ""))) continue;
    for (const document of documents) for (const page of document.pages) for (const hit of page.text.matchAll(aliasExpression(entity.label, "gu"))) {
      const insidePostcode = /\d{4}\s+$/.test(page.text.slice(Math.max(0, hit.index - 6), hit.index));
      const where = `${document.id}:${page.n}:${hit.index}`;
      if (!insidePostcode && !entity.seen.has(where)) { entity.aliases.add(entity.label); entity.seen.add(where); entity.count++; }
    }
  }

  // A person whose surname also appears alone elsewhere ("Bianchi teilte ...").
  for (const entity of entities.values()) {
    if (entity.kind !== "person" || entity.label.split(" ").length < 2) continue;
    const surname = entity.label.split(" ").at(-1);
    const sharers = [...entities.values()].filter(e => e !== entity && [...e.aliases].some(a => a.split(/\s+/).includes(surname)));
    if (sharers.length || entity.aliases.has(surname)) continue;
    const standalone = [...allText.matchAll(aliasExpression(surname, "gu"))].length;
    const inFull = [...entity.aliases].reduce((n, alias) => n + [...allText.matchAll(aliasExpression(alias, "gu"))].length, 0);
    if (standalone > inFull) { entity.aliases.add(surname); entity.notes.push("surname_alone"); }
  }

  // Remove aliases contained in another entity's longer alias only if they
  // would otherwise be claimed twice; the kernel rejects shared aliases.
  const aliasOwner = new Map();
  for (const entity of entities.values()) for (const alias of entity.aliases) {
    const key = normal(alias);
    if (aliasOwner.has(key) && aliasOwner.get(key) !== entity) {
      entity.aliases.delete(alias);
      entity.notes.push("alias_conflict");
      aliasOwner.get(key).notes.push("alias_conflict");
    } else aliasOwner.set(key, entity);
  }

  const order = ["person", "organisation", "address", "place", "parcel", "email", "phone", "iban", "ahv", "uid", "url"];
  return [...entities.values()]
    .filter(entity => entity.aliases.size)
    .map(({ seen, ...entity }) => ({ ...entity, aliases: [...entity.aliases].sort((a, b) => b.length - a.length), notes: [...new Set(entity.notes)] }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.count - a.count || a.label.localeCompare(b.label, "de"));
}

/** Context snippets for the review screen. Local display only. */
export function sampleContext(text, start, length, radius = 48) {
  const from = Math.max(0, start - radius), to = Math.min(text.length, start + length + radius);
  return { before: (from > 0 ? "…" : "") + text.slice(from, start), match: text.slice(start, start + length), after: text.slice(start + length, to) + (to < text.length ? "…" : "") };
}

export { escapeRegex };
