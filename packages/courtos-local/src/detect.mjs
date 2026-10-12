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

export const STRUCTURED_KINDS = new Set(["email", "iban", "phone", "ahv", "uid", "url"]);
/** German replacement labels; other case languages in language.mjs. */
export const PREFIX = REPLACEMENT_PREFIX.de;

const L = "\\p{L}\\p{M}";
const NAME = `\\p{Lu}[${L}’'-]+`;
const STRUCTURED = [
  ["email", /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?\.[\p{L}]{2,24}/giu],
  ["url", /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[\p{L}\p{N}-]+\.[\p{L}]{2,24}[^\s<>"')\]]*/giu],
  ["iban", /\b(?:CH|LI|DE|AT|FR|IT)[0-9]{2}(?:[ \t]?[A-Z0-9]){12,30}\b/g],
  ["ahv", /(?<!\d)756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}(?!\d)/g],
  ["uid", /\bCHE[-\s]?\d{3}[.\s]?\d{3}[.\s]?\d{3}(?:\s?(?:MWST|TVA|IVA|HR|RC|RI))?(?!\d)/g],
  ["phone", /(?<![\p{L}\p{N}])(?:\+|00)[1-9][0-9]{0,2}(?:[ ().-]*[0-9]){7,12}(?![\p{L}\p{N}])|(?<![\d.'’])0\d{2}[ ]\d{3}[ ]\d{2}[ ]\d{2}(?!\d)/gu],
];

const COMPANY = /(?<![\p{L}\p{N}])(?:(?:[\p{Lu}][\p{L}\p{N}’'&-]*|(?:\p{Lu}\.)+|(?:Dr|Prof|Ing|Co|Inc|Corp|Ltd|Bros)\.)[ \t]+){1,5}?(?:AG|GmbH|SA|Sàrl|Sagl|Srl|Ltd|LLC|KlG|KG|Genossenschaft|Stiftung)(?![\p{L}\p{N}])/gu;
const TITLES = "(?:(?:Herrn?|Frau|Dr\\.(?:\\s?(?:iur|med|phil|oec)\\.)?|Prof\\.|RA|RAin|Rechtsanwalt|Rechtsanwältin|lic\\.\\s?iur\\.|MLaw|BLaw|M\\.|Mme|Mlle|Me|Maître|avv\\.|Avv\\.|dott\\.|Dott\\.|Sig\\.(?:ra)?|Signor|Signora|Mr\\.?|Mrs\\.?|Ms\\.?)\\s+)";
const TITLED_PERSON = new RegExp(`(?<![${L}])${TITLES}+(${NAME}(?:\\s+${NAME}){0,2})`, "gu");
const ROLE_PERSON = new RegExp(`(?<![${L}])(?:Geschäftsführerin|Geschäftsführer|Bauleiterin|Bauleiter|Sachverständigen|Sachverständige|Sachverständiger|Gutachterin|Gutachter|Zeugin|Zeuge|Referentin|Referent|Verwaltungsrätin|Verwaltungsrat|Präsidentin|Präsident|Vertreterin|Vertreter|témoin|experte?|perito|testimone|witness|expert)\\s+(${NAME}\\s+${NAME})`, "gu");
const STREET = new RegExp(`(?<![${L}])(?:[\\p{Lu}][${L}-]*(?:strasse|straße|str\\.|gasse|weg|platz|rain|halde|quai|allee|ring|matte|graben|steig)|(?:rue|chemin|ch\\.|avenue|av\\.|route|place|boulevard|via|viale|piazza|vicolo)(?:\\s+(?:de\\s+la|de|des|du|del|della|dei|d'))?\\s+[\\p{Lu}][${L}'’-]+)\\s+\\d{1,4}[a-z]?(?![${L}\\d])`, "gu");
const PLACE = new RegExp(`(?<![\\d.'’])([1-9]\\d{3})\\s+(\\p{Lu}[${L}.-]+(?:\\s(?:bei|b\\.|am|an der|sur|près|di|im)\\s\\p{Lu}[${L}.-]+)?)(?![${L}])`, "gu");
const MAJOR_PLACES = new Set("Zürich Genève Genf Basel Bern Lausanne Winterthur Luzern Lucerne St.Gallen Lugano Biel Bienne Thun Fribourg Freiburg Neuchâtel Schaffhausen Chur Sion Sitten Zug Aarau Bellinzona Locarno Solothurn Frauenfeld Liestal Delémont Glarus Altdorf Sarnen Stans Schwyz Herisau Appenzell".split(" "));
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
  const add = (kind, label, doc, page, start, alias = label) => {
    const clean = label.replace(/\s+/gu, " ").trim();
    if (clean.length < 2) return;
    const key = `${STRUCTURED_KINDS.has(kind) ? kind : kind === "organisation" ? "organisation" : kind}:${normal(clean)}`;
    let entity = entities.get(key);
    if (!entity) entities.set(key, entity = { key, kind, label: clean, aliases: new Set(), count: 0, samples: [], notes: [], seen: new Set() });
    entity.aliases.add(alias.replace(/\s+/gu, " ").trim());
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
    const structured = STRUCTURED.flatMap(([kind, pattern]) => collect(pattern, text).map(hit => ({ kind, ...hit })))
      .sort((a, b) => a.start - b.start || b.value.length - a.value.length);
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
    for (const match of text.matchAll(PLACE)) {
      const town = match[2];
      // "12. Mai 2025 Klage": a year after a date is not a postcode.
      if (DATE_BEFORE.test(text.slice(Math.max(0, match.index - 16), match.index))) continue;
      add("place", town, document.id, page.n, match.index, match[0]);
    }
    for (const hit of collect(TITLED_PERSON, text, 1)) {
      const tokens = hit.value.split(/\s+/);
      if (tokens.length === 1) add("surname", tokens[0], document.id, page.n, hit.start);
      else add("person", hit.value, document.id, page.n, hit.start);
    }
    for (const hit of collect(ROLE_PERSON, text, 1)) add("person", hit.value, document.id, page.n, hit.start);
    for (const match of text.matchAll(new RegExp(`(?<![${L}])(${NAME})\\s+(${NAME}(?:-${NAME})?)(?![${L}])`, "gu"))) {
      if (GIVEN.has(match[1]) && !NOT_SURNAME.has(match[2]) && !GIVEN.has(match[2])) add("person", `${match[1]} ${match[2]}`, document.id, page.n, match.index);
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
