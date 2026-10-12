// Anonymisation suggestions for the case folder, from the citecheck engine
// (github.com/jonashertner/citecheck, vendored in ./vendor/citecheck): every
// word and number of the extracted text is either explained (common word,
// common number shape, public office, placeholder) or shown. Shown people and
// identifiers become register entries that CourtOS replaces before the model
// reads anything.
//
// Citecheck is built for publishing rulings, where only natural persons are
// anonymised and the bench, counsel and company details are public. A case
// folder goes to a model provider before any ruling exists, so CourtOS fails
// safe around it and replaces by default; the user can keep an entry after
// review. Each addition is labelled in the register:
//   - the distinctive name of a company party ("Alpenblick" in "Alpenblick
//     Hotel AG"), which citecheck can treat as a common word;
//   - people citecheck explains as public office holders (judges, counsel):
//     replaced, noted as public office;
//   - identifiers citecheck explains as a company's or an office's (IBAN,
//     phone, address, UID, land register entry): replaced, noted as public
//     identifier, because a company's UID or IBAN names the party;
//   - towns given with a postcode (except large cities), and people the
//     second detector finds but citecheck does not report.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { check } from "./vendor/citecheck/anon.mjs";
import { Vocabulary } from "./vendor/citecheck/vocabulary.mjs";
import { detectCandidates } from "./detect.mjs";
import { PASSES } from "./mirror.mjs";
import { aliasExpression } from "./util.mjs";
import { ROLE_LABEL } from "./language.mjs";

const DATA = new URL("./vendor/citecheck/data/", import.meta.url);
let vocabulary = null;
export function citecheckVocabulary() {
  if (!vocabulary) {
    const manifest = JSON.parse(readFileSync(new URL("vocabulary.json", DATA), "utf8"));
    vocabulary = new Vocabulary(new Uint8Array(gunzipSync(readFileSync(new URL(manifest.file, DATA)))));
    vocabulary.manifest = { file: manifest.file, sha256: manifest.sha256, generated: manifest.generated, words: manifest.words };
  }
  return vocabulary;
}

const IDENTIFIER_KIND = { address: "address", ahv: "ahv", iban: "iban", email: "email", phone: "phone", parcel: "parcel", plate: "plate", birthdate: "birthdate", insured: "insured", zemis: "zemis", document: "document", account: "account", profile: "url" };
const normal = (text) => text.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("de");
const LEGAL_FORM = /^(AG|GmbH|SA|S\.A\.?|Sàrl|SARL|Sarl|SAS|Sagl|Srl|S\.r\.l\.?|SpA|S\.p\.A\.?|Ltd\.?|plc|PLC|LLP|LLC|Inc\.?|B\.V\.?|BV|N\.V\.?|NV|KG|KlG|Genossenschaft|Stiftung)$/u;
// Month names: in a date ("6 gennaio 2025", "March 1975") a month is not a name.
const MONTHS = new Set("januar februar märz april mai juni juli august september oktober november dezember janvier février mars avril juin juillet août septembre octobre décembre gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre dicembre january february march may june july october december".split(" "));
// Words before a name that are not part of it: titles and greetings.
const NOT_NAME = new Set("herr herrn frau dr dr. prof prof. m. mm. mme mmes mlle me maître monsieur madame mademoiselle sig. sig.ra sig.na signor signora dott. avv. ing. mr mr. mrs mrs. ms ms. med. iur. lic. bonjour bonsoir salut hallo hello hi dear liebe lieber grüezi ciao buongiorno buonasera salve gentile caro cara cher chère".split(" "));
// Words of the document labels CourtOS itself writes ("Pièce 5", "Exhibit C-3") and of exhibit
// codes. They name documents, not people or firms.
const LABEL_WORDS = new Set([
  ...Object.values(ROLE_LABEL).flatMap(names => Object.values(names)).flatMap(name => name.toLocaleLowerCase("de").split(" ")),
  ..."exhibit exhibits pièce pièces piece pieces beilage beilagen allegato allegati annex annexe anlage beweismittel".split(" "),
]);
// Words that open an e-mail header or an address line ("An Urs Vogel", "Cc Anna Meier"). They are
// no part of the name a result shows; the form with them stays an alias, so the mirror is unchanged.
const HEADER_WORDS = new Set("an cc bcc kopie to from".split(" "));
const withoutHeader = (form) => {
  const tokens = form.split(/\s+/);
  return tokens.length > 2 && HEADER_WORDS.has(tokens[0].replace(/:$/u, "").toLocaleLowerCase("de")) && tokens.slice(1).every(t => /^\p{Lu}/u.test(t)) ? tokens.slice(1).join(" ") : form;
};
const FUNCTION_WORDS = new Set("le la les l des du de d par pour sur sous dans en et ou au aux un une il lo gli i del della dei di da per con su tra fra e o un una the and of in on at for to by der die das den dem des und oder im am an auf bei mit von vom zu zum zur ein eine".split(" "));
const GENERIC = new Set("hotel hotels bau immobilien holding partner partners treuhand group gruppe services service consulting management invest swiss schweiz suisse svizzera international verwaltung handel technik bank legal rechtsanwälte versicherung versicherungen transport garage restaurant immo real estate capital finance pharma energie media software systems solutions".split(" "));

/**
 * One person, one entry. Two entries for one person overlap in the text
 * ("Fabien" and "Fabien Mercier", "M. Baudin" and "Thierry Baudin"), and the
 * projection kernel refuses overlapping identities. Entries join when one
 * name of two or more words contains another, and a single name ("Fabien",
 * "Bonjour Sandrine") joins the one entry whose full name has it; a name that
 * several entries share stays separate and is decided by the user.
 */
export function consolidatePersons(candidates) {
  const persons = candidates.filter(c => c.kind === "person");
  const bare = (alias) => alias.split(/\s+/).filter((t, i, all) => !(NOT_NAME.has(t.toLocaleLowerCase("de")) && i < all.length - 1)).join(" ");
  const cores = new Map(persons.map(c => [c, [...new Set(c.aliases.map(bare))]]));
  const group = new Map(persons.map(c => [c, c]));
  const root = (c) => { while (group.get(c) !== c) c = group.get(c); return c; };
  const join = (a, b) => { const ra = root(a), rb = root(b); if (ra !== rb) group.set(rb, ra); };
  const contains = (long, short) => long === short || aliasExpression(short, "u").test(long);
  for (const a of persons) for (const b of persons) {
    if (a === b) continue;
    if (cores.get(b).some(s => s.includes(" ") && cores.get(a).some(l => contains(l, s)))) join(a, b);
    else if (cores.get(b).some(s => cores.get(a).includes(s))) join(a, b);
  }
  for (const b of persons) {
    if (b.match) continue; // an ordinary word ("Pour") never joins a name it happens to follow
    for (const token of cores.get(b).filter(s => !s.includes(" "))) {
      const owners = new Set(persons.filter(a => root(a) !== root(b) && cores.get(a).some(l => l.includes(" ") && l.split(" ").includes(token))).map(root));
      if (owners.size === 1) join([...owners][0], b);
    }
  }
  const groups = new Map();
  for (const c of persons) { const r = root(c); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const [keep, ...rest] = members.sort((x, y) => cores.get(y).filter(s => s.includes(" ")).length - cores.get(x).filter(s => s.includes(" ")).length || y.count - x.count);
    for (const other of rest) {
      keep.aliases = [...new Set([...keep.aliases, ...other.aliases])].sort((a, b) => b.length - a.length);
      keep.count += other.count;
      keep.samples = [...keep.samples, ...other.samples].slice(0, 8);
      keep.notes = [...new Set([...keep.notes, ...other.notes, "joined"])];
      if (other.decision === "replace") keep.decision = "replace";
      candidates.splice(candidates.indexOf(other), 1);
    }
    // One alias of several words, or a name: the entry matches in any case again.
    if (members.some(m => !m.match)) delete keep.match;
  }
  return candidates;
}

/**
 * A surname that also stands alone ("Chatelain & Associés" of counsel "Delphine
 * Chatelain") identifies the person as well. It joins the one person with that
 * surname; a surname several persons share becomes an entry of its own. A last
 * word that is an ordinary word and no known surname ("Attorney", "Report") is
 * left to the other rules. `pages` holds { doc, page, text }.
 */
export function surnamesAlone(candidates, pages, vocab = citecheckVocabulary()) {
  const persons = candidates.filter(c => c.kind === "person" && c.decision === "replace");
  const taken = new Set(candidates.flatMap(c => c.aliases.map(normal)));
  const owners = new Map();
  for (const person of persons) for (const alias of person.aliases) {
    const tokens = alias.split(/\s+/);
    const surname = tokens.at(-1);
    if (tokens.length < 2 || !/^\p{Lu}[\p{L}'’-]{2,}$/u.test(surname) || NOT_NAME.has(surname.toLocaleLowerCase("de")) || LEGAL_FORM.test(surname)) continue;
    const word = surname.toLocaleLowerCase("de");
    if (vocab.has(word) && !vocab.has(`!${word}`)) continue;
    if (!owners.has(surname)) owners.set(surname, new Set());
    owners.get(surname).add(person);
  }
  for (const [surname, people] of owners) {
    if (taken.has(normal(surname))) continue;
    const names = [...people].flatMap(p => p.aliases.filter(a => /\s/.test(a)));
    const samples = [];
    for (const page of pages) {
      const inNames = names.flatMap(a => [...page.text.matchAll(aliasExpression(a, "gu"))].map(m => [m.index, m.index + m[0].length]));
      for (const m of page.text.matchAll(aliasExpression(surname, "gu"))) {
        if (!inNames.some(([start, end]) => m.index >= start && m.index < end)) samples.push({ doc: page.doc, page: page.page, start: m.index, length: m[0].length });
      }
    }
    if (!samples.length) continue;
    if (people.size === 1) {
      const [person] = people;
      person.aliases = [...person.aliases, surname].sort((a, b) => b.length - a.length);
      person.count += samples.length;
      person.samples = [...person.samples, ...samples].slice(0, 8);
      person.notes = [...new Set([...person.notes, "surname_alone"])];
    } else {
      candidates.push({ key: `person:${normal(surname)}`, kind: "person", label: surname, aliases: [surname], count: samples.length, samples: samples.slice(0, 8), notes: ["shared_surname"], decision: "replace", source: "courtos", style: "letter" });
    }
    taken.add(normal(surname));
  }
  return candidates;
}

// Abbreviations of two to four capitals a Swiss case file uses for laws, courts, cantons,
// currencies and company forms. Initials that read as one of them are not replaced unasked.
const ABBREVIATIONS = new Set(("OR ZGB ZPO SCHKG STPO STGB BV BGG VWVG VG RPG USG LSV LPE OPB LTF LAT CC CO CPC CP CST PA "
  + "LP LTAF BGE ATF DTF SR RS HG OG KG BG TF TC CDAP BGER AG SA GMBH SARL SAGL KB BB GB EB CHF EUR USD MWST TVA IVA UID AHV AVS IV AI "
  + "ZH BE LU UR SZ OW NW GL ZG FR SO BS BL SH AR SG GR TG TI VD VS NE GE JU CH EU UN USA UK EG UE PDF CC BCC PS NB RZ NR ").split(" ").filter(Boolean));
// Short words of the four languages that capitals could spell. The vocabulary cannot tell them
// from initials: it holds nearly every pair of letters ("tb", "fc") that decisions contain.
const SHORT_WORDS = new Set([...FUNCTION_WORDS, ..."ab am an ob so da es er wo wie was wer wir ihr sie nur bis ja nie mal je ne ni si se ce ma me te tu on va vu ai as eu ou ca sa mi ti ci vi ho ha is it be do go he my no of oh ok or up us we if as non oui qui que sur mai già più".split(" ")]);

/**
 * Initials stand for a person in notes, chats and e-mails ("TB sagt …", "FC macht sich diese
 * Notiz"). Initials written as capitals alone (TB, JPR) that belong to one person whose name the
 * register replaces join that person; initials several persons share become an entry of their own.
 * Initials that are also a word or an abbreviation ("OR", "AB", "TI") are shown for review and kept,
 * as a capitalised ordinary word is: replacing them would rewrite "Art. 97 OR" and "ab Januar".
 */
export function initialsAlone(candidates, pages) {
  const persons = candidates.filter(c => c.kind === "person" && c.decision === "replace");
  const taken = new Set(candidates.flatMap(c => c.aliases.map(normal)));
  const owners = new Map();
  for (const person of persons) for (const alias of person.aliases) {
    const tokens = alias.split(/\s+/).filter(t => !NOT_NAME.has(t.toLocaleLowerCase("de")) && !HEADER_WORDS.has(t.replace(/:$/u, "").toLocaleLowerCase("de")));
    if (tokens.length < 2 || !tokens.every(t => /^\p{Lu}[\p{L}'’.-]*$/u.test(t)) || tokens.some(t => LEGAL_FORM.test(t))) continue;
    const first = (t) => t.split("-").map(part => Array.from(part)[0]).join("").toLocaleUpperCase("de");
    const forms = new Set([first(tokens[0]) + first(tokens.at(-1)), tokens.map(first).join("")]);
    for (const form of forms) {
      if (!/^\p{Lu}{2,4}$/u.test(form)) continue;
      if (!owners.has(form)) owners.set(form, new Set());
      owners.get(form).add(person);
    }
  }
  // A first name and a surname the register holds as two entries ("Nadja" and "Frei", an ordinary
  // word) are one person where they stand side by side.
  const single = new Map();
  for (const person of persons) for (const alias of person.aliases) if (!/\s/.test(alias) && /^\p{Lu}/u.test(alias)) single.set(alias, person);
  const split = new Set();
  for (const page of pages) for (const m of page.text.matchAll(/(?<![\p{L}\p{N}])(\p{Lu}[\p{L}'’-]+)[ \t]+(\p{Lu}[\p{L}'’-]+)(?![\p{L}\p{N}])/gu)) {
    const [one, two] = [single.get(m[1]), single.get(m[2])];
    if (!one || !two || one === two) continue;
    const form = (Array.from(m[1])[0] + Array.from(m[2])[0]).toLocaleUpperCase("de");
    if (!owners.has(form)) owners.set(form, new Set());
    owners.get(form).add(one).add(two);
    split.add(form);
  }
  for (const [form, people] of owners) {
    if (taken.has(normal(form))) continue;
    // Only the capitals count as initials: "ab" in lower case is a word, not A. B.
    const expression = aliasExpression(form, "gu");
    const samples = pages.flatMap(page => [...page.text.matchAll(expression)].map(m => ({ doc: page.doc, page: page.page, start: m.index, length: m[0].length })));
    if (!samples.length) continue;
    const lower = form.toLocaleLowerCase("de");
    if (ABBREVIATIONS.has(form) || SHORT_WORDS.has(lower)) {
      candidates.push({ key: `person:${normal(form)}`, kind: "person", label: form, aliases: [form], count: samples.length, samples: samples.slice(0, 8), notes: ["initials_word"], decision: "keep", source: "courtos", style: "letter", match: "capitalised" });
    } else if (people.size === 1) {
      const [person] = people;
      person.aliases = [...person.aliases, form].sort((a, b) => b.length - a.length);
      person.count += samples.length;
      person.samples = [...person.samples, ...samples].slice(0, 8);
      person.notes = [...new Set([...person.notes, "initials"])];
    } else {
      candidates.push({ key: `person:${normal(form)}`, kind: "person", label: form, aliases: [form], count: samples.length, samples: samples.slice(0, 8), notes: [split.has(form) && people.size === 2 ? "initials" : "shared_initials"], decision: "replace", source: "courtos", style: "letter" });
    }
    taken.add(normal(form));
  }
  return candidates;
}

/** Plausible readings of a word that text recognition may have damaged, lower-case. */
export function ocrRepairs(word) {
  const lower = word.toLocaleLowerCase("de");
  const out = new Set();
  const letters = Array.from(lower);
  const slots = letters.flatMap((c, i) => ("aou".includes(c) ? [i] : [])).slice(0, 4);
  const UML = { a: "ä", o: "ö", u: "ü" };
  for (let mask = 1; mask < 1 << slots.length; mask++) {
    const chars = [...letters];
    slots.forEach((at, i) => { if (mask & (1 << i)) chars[at] = UML[chars[at]]; });
    out.add(chars.join(""));
  }
  out.delete(lower);
  return [...out];
}

/**
 * @param {Array<{id:string,label:string,pages:Array<{n:number,text:string,has_text:boolean}>}>} documents
 * @returns {{candidates: Array, report: object}}
 */
export function suggestAnonymisation(documents) {
  const parts = [], where = [];
  for (const document of documents) for (const page of document.pages) {
    if (!page.has_text) continue;
    parts.push({ text: page.text, where: { part: "body" } });
    where.push({ doc: document.id, page: page.n, text: page.text, ocr: Boolean(page.ocr) });
  }
  const vocab = citecheckVocabulary();
  const result = parts.length ? check(parts, vocab) : { people: [], ambiguous: [], entries: [], explained: { court: [], counsel: [], official: [], author: [], case: [], public: {}, unassessed: 0, unassessed_words: [] }, placeholders: {} };
  const sample = (m) => ({ doc: where[m.part].doc, page: where[m.part].page, start: m.start, length: m.end - m.start });
  const candidates = [];
  const covered = new Set();

  // A lone capitalised word that is an ordinary word and not a known surname.
  const ordinary = (f) => { const w = f.toLocaleLowerCase("de"); return vocab.has(w) && !vocab.has(`!${w}`); };
  // Such a word replaced as a name ("Pour", "Date", "Lieu" opening a line) is replaced where it
  // is capitalised; the lower-case word ("pour", "la date") stays readable.
  // So is a name of initials and ordinary words ("A. Sur"): "sur" stays.
  const INITIAL = /^\p{Lu}\.$/u;
  const ordinaryMatch = (forms) => (forms.every(f => f.split(/\s+/).every(t => INITIAL.test(t) || ordinary(t)) && !f.split(/\s+/).every(t => INITIAL.test(t))) ? { match: "capitalised" } : {});
  const inDate = (m) => {
    const text = where[m.part].text;
    return /\d[.,]?[ \t]*$/.test(text.slice(Math.max(0, m.start - 6), m.start)) || /^[ \t,]*\d/.test(text.slice(m.end, m.end + 6));
  };
  const sentenceInitial = (m) => {
    const before = where[m.part].text.slice(Math.max(0, m.start - 3), m.start);
    return m.start === 0 || /(?:^|[.!?:]\s|\n)\s*$/.test(before) || /\n\s*$/.test(where[m.part].text.slice(0, m.start));
  };

  // A heading opens with a letter and an ordinary word ("C. Sur l'objection", "B. Zum Schaden"):
  // that is no initial and surname.
  const heading = (m) => {
    const word = /^\p{Lu}\.\s+(\p{L}+)$/u.exec(m.text.trim())?.[1];
    return Boolean(word) && ordinary(word) && /(?:^|\n)[ \t]*$/.test(where[m.part].text.slice(0, m.start));
  };

  for (const person of result.people) {
    person.mentions = person.mentions.filter(m => !heading(m));
    const forms = [...new Set(person.mentions.map(m => m.text.trim()))].filter(f => f.length >= 2);
    if (!forms.length) continue;
    const single = forms.every(f => !/\s/.test(f));
    const notes = [];
    let decision = "replace";
    // A lone capitalised word may simply open a sentence ("Eine Rüge …"). It stays readable only
    // if it is an ordinary word in the vocabulary and not a known surname; otherwise it is replaced.
    if (single && (forms.every(f => f.length <= 3) || person.mentions.every(sentenceInitial)) && forms.every(ordinary)) { decision = "keep"; notes.push("check_word"); }
    else if (single && forms.every(f => LABEL_WORDS.has(f.toLocaleLowerCase("de")))) { decision = "keep"; notes.push("label_word"); }
    else if (single && forms.every(f => MONTHS.has(f.toLocaleLowerCase("de"))) && person.mentions.every(inDate)) { decision = "keep"; notes.push("date_word"); }
    // Text recognition drops umlauts ("Ruge" for "Rüge"). Such a word is flagged, but still
    // replaced: "Bucher" and "Hauser" are surnames as well as damaged words, and a wrong
    // replacement costs less than a disclosed name.
    else if (single && person.mentions.every(m => where[m.part].ocr) && forms.every(f => ocrRepairs(f).some(r => vocab.has(r)))) notes.push("ocr_word");
    forms.forEach(f => covered.add(normal(f)));
    // A word the files also write in lower case ("may", "item") is a word there: only its
    // capitalised form is replaced.
    const lower = single && forms.some(f => /^\p{Ll}/u.test(f)) ? { match: "capitalised" } : {};
    const aliases = [...new Set([...forms, ...forms.map(withoutHeader)])].sort((a, b) => b.length - a.length);
    candidates.push({ key: `person:${normal(person.name)}`, kind: "person", label: withoutHeader(person.name), aliases, count: person.mentions.length, samples: person.mentions.slice(0, 8).map(sample), notes, decision, source: "citecheck", style: "letter", ...lower, ...ordinaryMatch(forms) });
  }
  for (const item of result.ambiguous) {
    const forms = [...new Set(item.mentions.map(m => m.text.trim()))];
    forms.forEach(f => covered.add(normal(f)));
    candidates.push({ key: `ambiguous:${normal(item.name)}`, kind: "person", label: item.name, aliases: forms, count: item.mentions.length, samples: item.mentions.slice(0, 8).map(sample), notes: ["ambiguous"], decision: "replace", source: "citecheck", style: "letter", candidates: item.candidates, ...ordinaryMatch(forms) });
  }
  for (const entry of result.entries) {
    if (entry.kind === "word") continue; // words are reported through people above
    const forms = entry.forms.filter(f => f.trim().length >= 2);
    if (!forms.length) continue;
    forms.forEach(f => covered.add(normal(f)));
    const kind = entry.kind === "identifier" ? (IDENTIFIER_KIND[entry.label] ?? "identifier") : "number";
    candidates.push({ key: `${kind}:${normal(entry.text)}`, kind, label: entry.text, aliases: forms.sort((a, b) => b.length - a.length), count: entry.occurrences.length, samples: entry.occurrences.slice(0, 8).map(sample), notes: [], decision: "replace", source: "citecheck", style: "label" });
  }

  // CourtOS additions around the citecheck result.
  const publicTokens = new Set([...result.explained.court, ...result.explained.counsel, ...result.explained.official].map(normal));
  const supplement = detectCandidates(documents);
  // The projection kernel refuses two identities overlapping in one pass. A
  // second spelling of an identifier already listed ("Seestrasse 41" inside
  // "Seestrasse 41, 6354 Vitznau", "4711" inside the land register entry)
  // joins that entry instead of becoming a rival one.
  const pass = (kind) => PASSES.findIndex(kinds => kinds.has(kind));
  const contains = (a, b) => aliasExpression(b, "iu").test(a);
  const overlapping = (c) => candidates.find(e => pass(e.kind) === pass(c.kind) && e.kind !== "person" && e.kind !== "organisation"
    && e.aliases.some(x => c.aliases.some(y => contains(x, y) || contains(y, x))));
  for (const c of supplement) {
    if (c.aliases.some(a => covered.has(normal(a)))) continue;
    if (c.kind === "organisation" && c.notes.includes("bank_name")) {
      // A bank's name is replaced whole: "Bank Transfer" is no reason to replace "transfer".
      // It ends where a person's name begins and runs on past it ("Raiffeisenbank Rheintal Markus Egli").
      const names = candidates.filter(p => p.kind === "person").flatMap(p => p.aliases.map(normal));
      const aliases = [...new Set(c.aliases.map(alias => {
        const words = alias.split(" ");
        const at = words.findIndex((w, i) => i > 0 && names.some(a => a.startsWith(`${normal(words.slice(i).join(" "))} `)));
        return at > 0 ? words.slice(0, at).join(" ") : alias;
      }))];
      if (aliases.some(a => covered.has(normal(a)))) continue;
      aliases.forEach(a => covered.add(normal(a)));
      candidates.push({ ...c, aliases, decision: "replace", source: "courtos", style: "letter" });
    } else if (c.kind === "organisation") {
      // Replace the distinctive part of a company name; keep the legal form ("A.________ AG").
      const words = c.label.split(/\s+/).filter(t => !LEGAL_FORM.test(t));
      const cores = words.filter(t => /^\p{Lu}/u.test(t) && t.length >= 4 && !t.includes(".") && !GENERIC.has(t.toLocaleLowerCase("de")) && !LABEL_WORDS.has(t.toLocaleLowerCase("de")) && !covered.has(normal(t)));
      if (!cores.length) continue;
      // A firm named after a person ("Weber Legal AG" of counsel "Thomas Weber"):
      // the core alone would overlap the person's name, so the whole name
      // without its legal form is replaced.
      const shared = cores.some(t => [...covered].some(a => a.split(" ").includes(normal(t))));
      const alias = shared ? words.join(" ") : cores.join(" ");
      if (covered.has(normal(alias))) continue;
      covered.add(normal(alias));
      candidates.push({ key: `organisation:${normal(alias)}`, kind: "organisation", label: c.label, aliases: [alias], count: c.count, samples: c.samples, notes: ["company_name"], decision: "replace", source: "courtos", style: "letter" });
    } else if (c.kind === "person") {
      if (c.aliases.every(a => LABEL_WORDS.has(a.toLocaleLowerCase("de")))) continue;
      const tokens = c.label.split(/\s+/).map(normal);
      c.aliases.forEach(a => covered.add(normal(a)));
      const office = tokens.every(t => publicTokens.has(t));
      candidates.push({ ...c, notes: [...c.notes, office ? "public_office" : "second_detector"], decision: "replace", source: "courtos", style: "letter", ...ordinaryMatch(c.aliases) });
    } else if (c.kind === "ahv") {
      // An AHV/AVS number always belongs to a natural person. citecheck skips numbers
      // whose check digit fails; in a case file that is more likely a typo than a
      // harmless number, so CourtOS replaces it anyway.
      c.aliases.forEach(a => covered.add(normal(a)));
      candidates.push({ ...c, notes: ["ahv_checksum"], decision: "replace", source: "courtos", style: "label" });
    } else if (["iban", "phone", "email", "address", "uid", "parcel", "url", "plate", "birthdate"].includes(c.kind)) {
      c.aliases.forEach(a => covered.add(normal(a)));
      const existing = overlapping(c);
      if (existing) {
        existing.aliases = [...new Set([...existing.aliases, ...c.aliases])].sort((a, b) => b.length - a.length);
        existing.count += c.count;
        existing.decision = "replace";
        continue;
      }
      candidates.push({ ...c, notes: ["public_identifier"], decision: "replace", source: "courtos", style: "label" });
    } else if (c.kind === "place") {
      // "2024 Les parties": a year before an article or preposition is not a postcode and town;
      // such a word is replaced only with a postcode, never on its own. (The vocabulary holds
      // most Swiss towns, "Vitznau" and "Féchy" among them, so it cannot tell a town from a word.)
      const word = c.label.split(/\s+/).every(t => FUNCTION_WORDS.has(t.toLocaleLowerCase("de")));
      const aliases = word ? c.aliases.filter(a => /\d/.test(a) && !/^(?:19|20)\d\d\s/.test(a)) : c.aliases;
      if (!aliases.length) continue;
      aliases.forEach(a => covered.add(normal(a)));
      candidates.push({ ...c, aliases, notes: [...c.notes, "place", ...(word ? ["ordinary_word"] : [])], decision: "replace", source: "courtos", style: "label" });
    }
  }
  consolidatePersons(candidates);
  surnamesAlone(candidates, where, vocab);
  initialsAlone(candidates, where);

  return {
    candidates,
    report: {
      engine: "citecheck", vocabulary: vocab.manifest,
      unassessed: result.explained.unassessed, unassessed_words: result.explained.unassessed_words.slice(0, 50),
      public: result.explained.public, placeholders: result.placeholders ?? {}, already_anonymised: Boolean(result.anonymized),
    },
  };
}
