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
const LEGAL_FORM = /^(AG|GmbH|SA|Sàrl|Sagl|Srl|Ltd|LLC|KG|KlG|Genossenschaft|Stiftung)$/u;
const GENERIC = new Set("hotel hotels bau immobilien holding partner partners treuhand group gruppe services service consulting management invest swiss schweiz suisse svizzera international verwaltung handel technik bank legal rechtsanwälte versicherung versicherungen transport garage restaurant immo real estate capital finance pharma energie media software systems solutions".split(" "));

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

  const sentenceInitial = (m) => {
    const before = where[m.part].text.slice(Math.max(0, m.start - 3), m.start);
    return m.start === 0 || /(?:^|[.!?:]\s|\n)\s*$/.test(before) || /\n\s*$/.test(where[m.part].text.slice(0, m.start));
  };

  for (const person of result.people) {
    const forms = [...new Set(person.mentions.map(m => m.text.trim()))].filter(f => f.length >= 2);
    if (!forms.length) continue;
    const single = forms.every(f => !/\s/.test(f));
    const notes = [];
    let decision = "replace";
    // A lone capitalised word may simply open a sentence ("Eine Rüge …"). It stays readable only
    // if it is an ordinary word in the vocabulary and not a known surname; otherwise it is replaced.
    const ordinary = (f) => { const w = f.toLocaleLowerCase("de"); return vocab.has(w) && !vocab.has(`!${w}`); };
    if (single && (forms.every(f => f.length <= 3) || person.mentions.every(sentenceInitial)) && forms.every(ordinary)) { decision = "keep"; notes.push("check_word"); }
    // Text recognition drops umlauts ("Ruge" for "Rüge"). Such a word is flagged, but still
    // replaced: "Bucher" and "Hauser" are surnames as well as damaged words, and a wrong
    // replacement costs less than a disclosed name.
    else if (single && person.mentions.every(m => where[m.part].ocr) && forms.every(f => ocrRepairs(f).some(r => vocab.has(r)))) notes.push("ocr_word");
    forms.forEach(f => covered.add(normal(f)));
    candidates.push({ key: `person:${normal(person.name)}`, kind: "person", label: person.name, aliases: forms.sort((a, b) => b.length - a.length), count: person.mentions.length, samples: person.mentions.slice(0, 8).map(sample), notes, decision, source: "citecheck", style: "letter" });
  }
  for (const item of result.ambiguous) {
    const forms = [...new Set(item.mentions.map(m => m.text.trim()))];
    forms.forEach(f => covered.add(normal(f)));
    candidates.push({ key: `ambiguous:${normal(item.name)}`, kind: "person", label: item.name, aliases: forms, count: item.mentions.length, samples: item.mentions.slice(0, 8).map(sample), notes: ["ambiguous"], decision: "replace", source: "citecheck", style: "letter", candidates: item.candidates });
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
    if (c.kind === "organisation") {
      // Replace the distinctive part of a company name; keep the legal form ("A.________ AG").
      const words = c.label.split(/\s+/).filter(t => !LEGAL_FORM.test(t));
      const cores = words.filter(t => /^\p{Lu}/u.test(t) && t.length >= 4 && !GENERIC.has(t.toLocaleLowerCase("de")) && !covered.has(normal(t)));
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
      const tokens = c.label.split(/\s+/).map(normal);
      c.aliases.forEach(a => covered.add(normal(a)));
      const office = tokens.every(t => publicTokens.has(t));
      candidates.push({ ...c, notes: [...c.notes, office ? "public_office" : "second_detector"], decision: "replace", source: "courtos", style: "letter" });
    } else if (c.kind === "ahv") {
      // An AHV/AVS number always belongs to a natural person. citecheck skips numbers
      // whose check digit fails; in a case file that is more likely a typo than a
      // harmless number, so CourtOS replaces it anyway.
      c.aliases.forEach(a => covered.add(normal(a)));
      candidates.push({ ...c, notes: ["ahv_checksum"], decision: "replace", source: "courtos", style: "label" });
    } else if (["iban", "phone", "email", "address", "uid", "parcel", "url"].includes(c.kind)) {
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
      c.aliases.forEach(a => covered.add(normal(a)));
      candidates.push({ ...c, notes: [...c.notes, "place"], decision: "replace", source: "courtos", style: "label" });
    }
  }

  return {
    candidates,
    report: {
      engine: "citecheck", vocabulary: vocab.manifest,
      unassessed: result.explained.unassessed, unassessed_words: result.explained.unassessed_words.slice(0, 50),
      public: result.explained.public, placeholders: result.placeholders ?? {}, already_anonymised: Boolean(result.anonymized),
    },
  };
}
