// The anonymization check. One rule: everything the file carries is either
// explained or shown.
//
// A word or number is explained when it is
//   common      a word found in many published rulings and not a person's name
//               (the vocabulary), or a number of a common shape (date, amount,
//               legal reference, docket, section, count)
//   public      made public by the document: the bench, counsel and officials
//               named with their office, authors and case names in citations,
//               unless the document anonymizes that category itself
//   placeholder A.________, [...], X.
// Everything else is shown. A recognised identifier (AHV number, IBAN, phone,
// e-mail, street address, number plate, parcel, birth date, insured-person,
// ZEMIS, document or account number) is always shown, with its label, unless
// its context makes it an office's.
//
// Pure: no DOM, no network, no Word. The Python twin, build/anon_engine.py, is
// this module line for line; tests/anon_parity.test.mjs holds the two to the
// same output. The patterns live once, in anon-patterns.js.

import { PATTERNS, MACROS } from './anon-patterns.mjs';

const VISIBLE = new Set(['body', 'footnote', 'endnote', 'header', 'footer']);
// Offices that follow "Herr" or "Frau" ("Herr Präsident") and are no name.
const TITLE_NOUNS = new Set(['doktor', 'professor', 'professorin', 'präsident', 'präsidentin', 'vizepräsident', 'vizepräsidentin', 'direktor', 'direktorin', 'kollege', 'kollegin', 'pfarrer', 'pfarrerin', 'notar', 'notarin', 'richter', 'richterin', 'bundesrat', 'bundesrätin', 'regierungsrat', 'regierungsrätin', 'nationalrat', 'nationalrätin', 'ständerat', 'ständerätin', 'gemeinderat', 'gemeinderätin', 'stadtrat', 'stadträtin', 'oberrichter', 'oberrichterin', 'bundesrichter', 'bundesrichterin', 'minister', 'ministerin', 'président', 'présidente', 'juge', 'presidente', 'giudice', 'president', 'judge', 'justice', 'chief', 'member', 'le', 'la', 'les', 'de', 'du', 'the', 'und', 'et']);
const PARTICLES = new Set(['von', 'van', 'de', 'da', 'di', 'del', 'della', 'du', 'des', 'der', 'le', 'la', 'zur', 'zum']);
const TITLES = new Set(['dr', 'prof', 'pd', 'lic', 'iur', 'med', 'phil', 'rer', 'pol', 'oec', 'mlaw', 'll']);
const IDENTIFIERS = ['ahv', 'ahv_old', 'iban', 'insured', 'zemis', 'document_no', 'account',
  'parcel', 'birthdate', 'birthdate_after', 'email', 'url', 'phone', 'plate', 'address', 'postcode'];
const LABEL = { ahv_old: 'ahv', document_no: 'document', url: 'profile', birthdate_after: 'birthdate', postcode: 'address' };
const VALUE_GROUP = new Set(['ahv_old', 'insured', 'zemis', 'document_no', 'account', 'parcel', 'birthdate', 'birthdate_after']);
const RANK = { identifier: 0, word: 1, number: 1 };
const LINKS = ['', 's', 'es', 'n', 'en', 'er', 'e'];
// Outside German lines a long word still splits: a German compound quoted in French
// ("Herkunftsvorstellung"); made-up names are shorter ("Equibelle").
const LONG_COMPOUND = 13;

// Each pattern three ways: g to walk the text, y to match at a position, plain to test.
function compile(source, flags) {
  source = source.replace(/\{<W\}|\{W>\}|\{[LWw]\}/g, (macro) => MACROS[macro]);   // one pass: values hold braces
  const extra = flags.includes('i') ? 'i' : '';
  return { g: new RegExp(source, 'dgu' + extra), y: new RegExp(source, 'yu' + extra), t: new RegExp(source, 'u' + extra) };
}
const P = Object.fromEntries(Object.entries(PATTERNS).map(([name, [source, flags]]) => [name, compile(source, flags)]));

// matchAll walks a copy of the pattern, so walks can nest.
const all = (name, text) => text.matchAll(P[name].g);
function at(name, text, pos) {
  const re = P[name].y;
  re.lastIndex = pos;
  return re.exec(text);
}
const test = (name, text) => P[name].t.test(text);
const matchStart = (name, text) => at(name, text, 0);

// ── small helpers, each mirrored in anon_engine.py ────────────────────────
export function ahvValid(s) {
  const d = s.replace(/[^0-9]/g, '').split('').map(Number);
  if (d.length !== 13) return false;
  const sum = d.slice(0, 12).reduce((acc, x, i) => acc + x * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

export function ibanValid(s) {
  s = s.replace(/\s/g, '').toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  let remainder = 0;
  for (const c of s.slice(4) + s.slice(0, 4)) {
    const v = parseInt(c, 36);
    if (Number.isNaN(v)) return false;
    for (const digit of String(v)) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function fold(word) {
  return word.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
    .split('ß').join('ss').split('ae').join('a').split('oe').join('o').split('ue').join('u');
}

const isUpper = (c) => c !== c.toLowerCase();
const digitsOf = (s) => (s.match(/[0-9]/g) || []).length;

// An author: at the start of a citation ("(", ";", "vgl.", "in:", "/", "StGB-"), with a literature
// marker in the same clause and no reference to the file ("act. 7"), which would make it a party's statement.
function cited(text, a, b) {
  if (!test('citation_start', text.slice(Math.max(0, a - 60), a))) return false;
  const after = text.slice(b, b + 200);
  const m = matchStart('literature', after);
  return Boolean(m) && !test('file_reference', after.slice(0, m[0].length));
}

// True at the start of a paragraph or sentence, where any word is capitalised.
// After "Dr.", "vgl." or an initial a sentence does not start.
function sentenceStart(text, a) {
  const before = text.slice(Math.max(0, a - 40), a);
  if (!before.trim() || /\n[ \t]*$/.test(before)) return true;
  if (test('abbreviation_end', before)) return false;
  return test('sentence_end', before);
}

// A noun name used as an adjective: "Schweizer Handelsplatz", "Zürcher Verwaltungsgericht".
function adjective(text, b, has) {
  const m = /^ ([\p{L}\p{Nl}\p{No}]{2,})/u.exec(text.slice(b, b + 40));
  return Boolean(m) && isUpper(m[1][0]) && has(m[1].toLowerCase());
}

// A word with an s whose stem is no word ("blasers", "zehnders") is a name's genitive:
// the compound rule does not make it common unless it makes the stem common too
// ("bundesgerichts" splits, and so does "bundesgericht").
function nameWithS(low, has) {
  if (!low.endsWith('s') || low.length < 5) return false;
  const stem = low.slice(0, -1);
  return !has(stem) && !compoundSplit(stem, has);
}

export function compoundSplit(word, has, depth = 0) {
  const n = word.length;
  if (n < 7 || depth > 3) return false;
  for (let i = n - 4; i > 2; i--) {
    if (!has(word.slice(i))) continue;
    const head = word.slice(0, i);
    for (const link of LINKS) {
      if (link && !head.endsWith(link)) continue;
      const h = head.slice(0, head.length - link.length);
      if (h.length >= 3 && (has(h) || compoundSplit(h, has, depth + 1))) return true;
    }
  }
  return false;
}

// Whether the line at a position is German. Words are split into compounds ("Schneelast")
// only in German: French, Italian and English do not close them up, and there a made-up
// name splits too easily ("Equibelle": equi + belle). A line without function words takes
// the document's language.
function germanByLine(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  const scores = starts.map((s, k) => {
    const line = text.slice(s, k + 1 < starts.length ? starts[k + 1] - 1 : text.length);
    let de = 0, other = 0;
    for (const _ of all('lang_de', line)) de++;        // eslint-disable-line no-unused-vars
    for (const _ of all('lang_other', line)) other++;  // eslint-disable-line no-unused-vars
    return [de, other];
  });
  const de = scores.reduce((n, x) => n + x[0], 0);
  const other = scores.reduce((n, x) => n + x[1], 0);
  const german = scores.map(([d, o]) => (d || o ? d >= o : de >= other));
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return german[lo];
  };
}

// ── the check ─────────────────────────────────────────────────────────────
// The text in composed form and, per character of it, where it starts in `s`;
// [s, null] when it is composed already.
function compose(s) {
  if (s.normalize('NFC') === s) return [s, null];
  let out = '';
  const where = [];
  for (let i = 0; i < s.length;) {
    let j = i + 1;
    while (j < s.length && /\p{M}/u.test(s[j])) j++;
    const piece = s.slice(i, j).normalize('NFC');
    out += piece;
    for (let k = 0; k < piece.length; k++) where.push(i);
    i = j;
  }
  where.push(s.length);
  return [out, where];
}

class Joined {
  constructor(parts) {
    // Checked in composed form ("u" + U+0308 is "ü"); places are given in the part as written.
    this.written = parts.map((p) => p.text);
    this.maps = [];
    parts = parts.map((p) => {
      const [composed, where] = compose(p.text);
      this.maps.push(where);
      return where === null ? p : { ...p, text: composed };
    });
    this.parts = parts;
    this.starts = [];
    let pos = 0;
    for (const p of parts) {
      this.starts.push(pos);
      pos += p.text.length + 2;
    }
    this.text = parts.map((p) => p.text).join('\n\n');
  }

  index(start) {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (this.starts[mid] <= start) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  locate(start, end) {
    const i = this.index(start);
    let a = start - this.starts[i];
    let b = end - this.starts[i];
    if (this.maps[i] !== null) { a = this.maps[i][a]; b = this.maps[i][b]; }
    return { part: i, start: a, end: b, text: this.written[i].slice(a, b) };
  }

  // Where the run of parts of the same kind as the one at `start` ends.
  endOfKind(start) {
    let i = this.index(start);
    const kind = (this.parts[i].where && this.parts[i].where.part) || 'body';
    while (i + 1 < this.parts.length && ((this.parts[i + 1].where && this.parts[i + 1].where.part) || 'body') === kind) i++;
    return this.starts[i] + this.parts[i].text.length;
  }

  kind(start) {
    const p = this.parts[this.index(start)];
    return (p.where && p.where.part) || 'body';
  }
}

class Spans {
  constructor() { this.items = []; }
  overlaps(a, b) { return this.items.some(([s, e]) => s < b && a < e); }
  add(a, b) { this.items.push([a, b]); }
}

const CUT = /\n\s*\n|[a-zäöüéèàç]{3,}\.\s|(?<![\p{L}\p{N}_])(?:gegen|contre|contro|Parteien|Parties|Parti)(?![\p{L}\p{N}_])/gu;

// The words before `start` that say whose it is: back to a blank line, a sentence end,
// the party separator ("gegen") or the last anonymized person, at most `width` characters.
function whose(text, start, width) {
  const before = text.slice(Math.max(0, start - width), start);
  let cut = 0;
  CUT.lastIndex = 0;
  for (let m; (m = CUT.exec(before));) cut = m.index + m[0].length;
  for (const m of all('placeholder', before)) cut = Math.max(cut, m.index + m[0].length);
  return before.slice(cut);
}

const isPublic = (text, start, width = 80) => test('not_a_person', whose(text, start, width));
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

function identifiers(t, taken, explained, pub) {
  const text = t.text;
  const out = [];
  for (const name of IDENTIFIERS) {
    for (const m of all(name, text)) {
      const group = VALUE_GROUP.has(name) ? 1 : 0;
      const value = m[group];
      const [a, b] = m.indices[group];
      if (taken.overlaps(a, b) || explained.overlaps(a, b)) continue;
      const label = LABEL[name] || name;
      if (name === 'ahv' && !ahvValid(value)) continue;
      if (name === 'iban') {
        if (!ibanValid(value)) continue;
        if (test('not_a_person', whose(text, a, 170) + text.slice(b, b + 40).split(/[\n,;.]/)[0])) { explained.add(a, b); bump(pub, 'iban'); continue; }
      }
      if (name === 'account' && isPublic(text, m.index, 120)) { explained.add(a, b); bump(pub, 'account'); continue; }
      if (name === 'email') {
        const at = value.indexOf('@');
        const local = value.slice(0, at);
        const domain = value.slice(at + 1);
        if (test('masked_local', local) || test('masked_domain', domain) || (!test('freemail', domain) && (test('public_mail', domain) || isPublic(text, a)))) { explained.add(a, b); bump(pub, 'email'); continue; }
      }
      if (name === 'url' && !test('social', value)) { explained.add(a, b); continue; }
      // A landline in a letterhead or beside an office: "Postfach … Telefon … Fax …".
      if (name === 'phone' && !matchStart('mobile', value) && (isPublic(text, a) || matchStart('letterhead', text.slice(b, b + 40)))) { explained.add(a, b); bump(pub, 'phone'); continue; }
      if (name === 'plate' && !test('plate_context', text.slice(Math.max(0, a - 60), a))) continue;
      // "68740 E.________": the postcode names the town the placeholder hides; "März 2025 A.________" is a year.
      if (name === 'postcode' && test('date_before', text.slice(Math.max(0, a - 25), a))) continue;
      // "wohnhaft", "domicilié" right before: a person's, whatever office the clause names earlier.
      if ((name === 'address' || name === 'postcode') && (value.includes('_') || (!test('residence_before', text.slice(Math.max(0, a - 40), a))
        && (isPublic(text, a, 150) || matchStart('letterhead', text.slice(b, b + 40)))))) { explained.add(a, b); bump(pub, 'address'); continue; }
      taken.add(a, b);
      out.push({ kind: 'identifier', label, start: a, end: b, text: value });
    }
  }
  return out;
}

function runs(text, pos) {
  const m = at('name_run', text, pos);
  if (!m) return [[], pos];
  const names = [];
  let end = pos;
  for (const w of all('word', m[0])) {
    const token = w[0];
    const low = token.toLowerCase();
    if (TITLES.has(low) || PARTICLES.has(low)) { end = pos + w.index + token.length; continue; }
    if (!isUpper(token[0]) || at('role', text, pos + w.index)) break;
    names.push(token);
    end = pos + w.index + token.length;
  }
  return [names, end];
}

// The given names and initials written just before the name at `a`, and where they start:
// "Anna Müller" -> ["anna"], "H. Müller" -> ["h."]; titles are passed over, a word stops.
const NAME_BEFORE = /([\p{L}\p{Nl}\p{No}][\p{L}\p{N}_'’\-]*\.?)[ \u00a0]+$/u;
function namesBefore(text, a, has) {
  const names = [];
  let first = a;
  while (names.length < 3) {
    const m = NAME_BEFORE.exec(text.slice(Math.max(0, first - 40), first));
    if (!m) break;
    const token = m[1];
    const low = token.toLowerCase();
    if (TITLES.has(low.replace(/\.+$/, '')) || PARTICLES.has(low)) { first -= m[0].length; continue; }
    const initial = /^[A-Z]\.$/.test(token);
    if (!isUpper(token[0]) || (!initial && (token.endsWith('.') || has(low)))) break;
    names.unshift(low);
    first -= m[0].length;
  }
  return [first, names];
}

// The given name (or its initial) of the public person with this surname.
function sameGiven(name, pub) {
  if (/^[a-z]\.$/.test(name)) return [...pub].some((g) => g.slice(0, 1) === name[0]);
  return pub.has(name);
}

function roles(t, has) {
  const text = t.text;
  const found = { court: new Set(), counsel: new Set(), official: new Set() };
  const surnames = { court: new Set(), counsel: new Set(), official: new Set() };
  const given = { court: new Map(), counsel: new Map(), official: new Map() };
  const person = (category, run) => {
    surnames[category].add(run[run.length - 1]);           // only the surname stands for the person elsewhere
    const key = run[run.length - 1].toLowerCase();
    if (!given[category].has(key)) given[category].set(key, new Set());
    for (const n of run.slice(0, -1)) given[category].get(key).add(n.toLowerCase());
  };
  const anonymized = new Set();
  const spans = [];
  for (const m of all('role', text)) {
    if (!VISIBLE.has(t.kind(m.index))) continue;     // a comment or a property makes no one public
    const category = ['court', 'counsel', 'official'].find((k) => m.groups[k] !== undefined);
    let pos = m.index + m[0].length;
    if (at('placeholder', text, pos) || at('initial', text, pos)) { anonymized.add(category); continue; }
    for (let i = 0; i < 8; i++) {
      const [names, end] = runs(text, pos);
      if (!names.length) break;
      // "…Kunz, Beschwerdeführer," and "avocat à Genève": common words are not names.
      if (!names.every((n) => has(n.toLowerCase()))) {
        for (const n of names) found[category].add(n);
        person(category, names);
      }
      spans.push([category, m.index, end]);
      const join = matchStart('run_join', text.slice(end, end + 20));
      if (!join || at('role', text, end + join[0].length)) break;
      pos = end + join[0].length;
    }
  }
  // The bench block at the head of a ruling: from "Besetzung", "Composition", "Siégeant" … to the
  // first party marker. Parties never stand in it; every capitalised word in it is the court's.
  for (const m of all('bench_open', text)) {
    if (!VISIBLE.has(t.kind(m.index))) continue;
    const start = m.index + m[0].length;
    let end = Math.min(text.length, start + 700, t.endOfKind(start));
    const close = P.bench_close.t.exec(text.slice(start, end));
    if (close) end = start + close.index;
    let run = [];
    let last = 0;
    for (const w of all('word', text.slice(start, end))) {
      const token = w[0];
      // A run of names ends at punctuation: "Wullschleger (Vorsitz)" is a name and an office.
      if (run.length && /[^\s-]/.test(text.slice(start + last, start + w.index))) {
        person('court', run);
        run = [];
      }
      last = w.index + token.length;
      if (TITLES.has(token.toLowerCase())) continue;
      if (at('role', text, start + w.index)) {          // "Bundesrichterin" is the office, not a name
        if (run.length) { person('court', run); run = []; }
        continue;
      }
      if (isUpper(token[0]) && !has(token.toLowerCase())) {
        found.court.add(token);
        run.push(token);
      } else if (run.length) {
        person('court', run);                             // the last of a run of names is the surname
        run = [];
      }
    }
    if (run.length) person('court', run);
    spans.push(['court', start, end]);
  }
  for (const k of anonymized) { delete found[k]; delete surnames[k]; delete given[k]; }
  const publicGiven = new Map();
  for (const bySurname of Object.values(given)) {
    for (const [surname, names] of bySurname) {
      if (!publicGiven.has(surname)) publicGiven.set(surname, new Set());
      for (const n of names) publicGiven.get(surname).add(n);
    }
  }
  return [found, surnames, anonymized, spans.filter(([k]) => !anonymized.has(k)).map(([, a, b]) => [a, b]), publicGiven];
}

export function check(parts, vocabulary) {
  const t = new Joined(parts);
  const text = t.text;
  const taken = new Spans();
  const explained = new Spans();
  const pub = {};
  // A ruling repeats its words; each is looked up in the list once.
  const known = new Map();
  const has = (w) => {
    let v = known.get(w);
    if (v === undefined) { v = vocabulary.has(w); known.set(w, v); }
    return v;
  };

  const placeholders = {};
  for (const m of all('placeholder', text)) {
    explained.add(m.index, m.index + m[0].length);
    bump(placeholders, m[0].replace(/_{2,}/g, '________'));
  }
  let initials = 0;
  for (const _ of all('initial', text)) initials++;      // eslint-disable-line no-unused-vars

  const shown = identifiers(t, taken, explained, pub);
  const germanAt = germanByLine(text);
  const [byOffice, officeSurnames, anonymizedRoles, officeSpans, publicGiven] = roles(t, has);
  for (const [a, b] of officeSpans) explained.add(a, b);
  const officeWords = new Map();
  for (const [k, ws] of Object.entries(officeSurnames)) for (const w of ws) officeWords.set(w.toLowerCase(), k);   // the later office wins, as in Python

  const counts = { common: 0, numbers: 0, unassessed: 0, unassessedWords: new Set() };
  const inflected = [];                              // common words ending in s/es: "Müllers"
  const lowerCase = [];                            // words in lower case, judged once the names are known
  const deferred = [];                             // a public surname, judged once every Müller is known
  const contested = new Set();                     // public surnames a private person also bears
  const named = { court: new Set(), counsel: new Set(), official: new Set(), author: new Set(), case: new Set() };
  for (const [k, ws] of Object.entries(byOffice)) for (const w of ws) named[k].add(w);

  for (const m of all('word', text)) {
    const a = m.index;
    const token = m[0];
    const b = a + token.length;
    if (!isUpper(token[0])) { lowerCase.push([a, b, token]); continue; }
    if (taken.overlaps(a, b) || explained.overlaps(a, b)) continue;
    const low = token.toLowerCase();
    const listed = ['', 's', 'es', 'n'].some((x) => has('!' + low.slice(0, low.length - x.length)));
    const title = token.length > 1 && token.slice(1) === token.slice(1).toLowerCase();
    // After "Herr", "Frau", "Mr", "Mme" (initials between): a name, even one that is a word ("Herr Frei").
    const titled = test('title_before', text.slice(Math.max(0, a - 30), a)) && !TITLE_NOUNS.has(low) && !at('role', text, a);
    if (!titled && (has(low) || (!listed && (germanAt(a) || low.length >= LONG_COMPOUND) && compoundSplit(low, has) && !nameWithS(low, has)))) {
      // "~saldo": ordinary in lower case; "Saldo" in mid-sentence is the name.
      if (!(title && has('~' + low) && !sentenceStart(text, a) && !test('det_before', text.slice(Math.max(0, a - 25), a)))) {
        counts.common++;
        if (low.endsWith('s')) inflected.push([a, b, token]);
        continue;
      }
    } else if (has('^' + low) && (test('det_before', text.slice(Math.max(0, a - 25), a)) || adjective(text, b, has))) {
      counts.common++;                                 // "^streit": "der Streit" is the noun, "Streit" alone the name
      continue;
    }
    // The bench's or counsel's surname elsewhere is theirs, unless it is someone else's: another
    // given name ("Bundesrichter Hans Müller ... Anna Müller") or a party word before the name
    // ("Die Klägerin Hans Müller"). Then every bare "Müller" is shown too: it may be either.
    if (officeWords.has(low)) {
      const [first, names] = namesBefore(text, a, has);
      const pub = publicGiven.get(low) || new Set();
      if (!(test('party_before', text.slice(Math.max(0, first - 40), first)) || names.some((n) => !sameGiven(n, pub)))) {
        deferred.push([a, b, token, low, first]);
        continue;
      }
      contested.add(low);
    }
    const after = text.slice(b, b + 90);
    if (matchStart('author_after', after) || cited(text, a, b)) { named.author.add(token); continue; }
    if (matchStart('case_after', after)) { named.case.add(token); continue; }
    shown.push({ kind: 'word', label: null, start: a, end: b, text: token });
  }

  // A public surname stays public with the given names written before it: "Hans Müller" beside
  // "Bundesrichter Hans Müller" is the judge, not a "Hans" to replace in front of the judge's surname.
  const givenSpans = [];
  for (const [a, b, token, low, first] of deferred) {
    if (contested.has(low)) { shown.push({ kind: 'word', label: null, start: a, end: b, text: token }); continue; }
    named[officeWords.get(low)].add(token);
    if (first < a) givenSpans.push([first, a, officeWords.get(low)]);
  }
  for (let i = shown.length - 1; givenSpans.length && i >= 0; i--) {
    const x = shown[i];
    const span = x.kind === 'word' && givenSpans.find(([f, a]) => f <= x.start && x.end <= a);
    if (span) { named[span[2]].add(x.text); shown.splice(i, 1); }
  }

  // A common word whose stem is shown here is that name inflected ("Müllers" beside "Müller").
  const stems = new Set(shown.filter((x) => x.kind === 'word').map((x) => fold(x.text)));
  for (const [a, b, token] of inflected) {
    const k = fold(token);
    if (stems.has(k.slice(0, -1)) || (k.endsWith('es') && stems.has(k.slice(0, -2)))) {
      counts.common--;
      shown.push({ kind: 'word', label: null, start: a, end: b, text: token });
    }
  }

  // Words in lower case. A word of the list, or a compound of its words, is explained. A name the
  // document shows capitalised is shown in lower case too ("müller"), unless that is a word
  // ("frei"). Two or more unknown words side by side are shown ("hans müller"): in published
  // rulings such pairs are almost only names and foreign phrases. A single unknown word is not
  // shown but counted, and the summary says how many.
  const unknown = [];
  for (const [a, b, token] of lowerCase) {
    if (taken.overlaps(a, b) || explained.overlaps(a, b)) continue;
    const low = token.toLowerCase();
    if (has(low) && (!low.endsWith('s') || has(low.slice(0, -1)))) { counts.common++; continue; }   // a word: the common case, before folding
    const k = fold(token);
    if (stems.size && ((stems.has(k) && !has(low)) || (k.endsWith('s') && stems.has(k.slice(0, -1)) && !has(low.slice(0, -1))))) {
      shown.push({ kind: 'word', label: null, start: a, end: b, text: token });
      continue;
    }
    if (has(low) || ((germanAt(a) || low.length >= LONG_COMPOUND) && compoundSplit(low, has))) { counts.common++; continue; }
    unknown.push([a, b, token]);
  }
  for (let i = 0; i < unknown.length;) {
    let j = i;
    while (j + 1 < unknown.length && LINK.test(text.slice(unknown[j][1], unknown[j + 1][0]) || 'x')) j++;
    if (j > i) for (const [x, y, w] of unknown.slice(i, j + 1)) shown.push({ kind: 'word', label: null, start: x, end: y, text: w });
    else { counts.unassessed++; counts.unassessedWords.add(unknown[i][2]); }
    i = j + 1;
  }

  for (const m of all('code', text)) {
    const a = m.index;
    let value = m[0];
    while (value && ".'’/-".includes(value[value.length - 1])) value = value.slice(0, -1);
    const b = a + value.length;
    if (!value || taken.overlaps(a, b) || explained.overlaps(a, b)) continue;
    if (digitsOf(value) <= 4 || matchStart('date', value) || matchStart('amount', value) ||
        matchStart('section', value) || matchStart('span', value) || matchStart('reference', value) ||
        test('ref_before', text.slice(Math.max(0, a - 40), a)) || test('docket_before', text.slice(Math.max(0, a - 12), a)) ||
        matchStart('unit_after', text.slice(b, b + 20))) {
      counts.numbers++;
      continue;
    }
    shown.push({ kind: 'number', label: null, start: a, end: b, text: value });
  }

  return assemble(t, shown, placeholders, initials, counts, named, pub, anonymizedRoles, has);
}

const byCodePoint = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

function assemble(t, shown, placeholders, initials, counts, named, pub, anonymizedRoles, has) {
  shown.sort((x, y) => x.start - y.start);
  const words = new Set(shown.filter((s) => s.kind === 'word').map((s) => fold(s.text)));

  const keyOf = (s) => {
    if (s.kind === 'word') {
      const k = fold(s.text);
      for (const suffix of ['s', 'es']) {
        if (k.endsWith(suffix) && words.has(k.slice(0, -suffix.length))) return 'w:' + k.slice(0, -suffix.length);
      }
      return 'w:' + k;
    }
    if (s.kind === 'identifier') return 'i:' + s.label + ':' + s.text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    return 'n:' + s.text;
  };

  const entries = new Map();
  for (const s of shown) {
    const k = keyOf(s);
    if (!entries.has(k)) entries.set(k, { key: k, kind: s.kind, label: s.label, occurrences: [] });
    const where = t.locate(s.start, s.end);
    where.visible = VISIBLE.has(t.kind(s.start));
    entries.get(k).occurrences.push(where);
  }

  const out = [];
  for (const e of entries.values()) {
    const forms = new Map();
    for (const o of e.occurrences) forms.set(o.text, (forms.get(o.text) || 0) + 1);
    let best = null;
    for (const [f, n] of forms) if (best === null || n > forms.get(best)) best = f;   // first seen wins a tie
    e.text = best;
    e.forms = [...forms.keys()].sort(byCodePoint);
    e.hidden = !e.occurrences.some((o) => o.visible);
    out.push(e);
  }
  out.sort((x, y) => RANK[x.kind] - RANK[y.kind] || x.occurrences[0].part - y.occurrences[0].part || x.occurrences[0].start - y.occurrences[0].start);
  out.forEach((e, i) => { e.id = i; });

  const found = people(t, shown.filter((s) => s.kind === 'word'), has);
  const anonymized = Object.values(placeholders).reduce((s, n) => s + n, 0) >= 3 || initials >= 5;
  const sortedNames = (set) => [...set].sort(byCodePoint);
  return {
    anonymized,
    placeholders: Object.fromEntries(Object.entries(placeholders).sort((x, y) => y[1] - x[1] || byCodePoint(x[0], y[0]))),
    entries: out,
    people: found[0],
    ambiguous: found[1],
    explained: {
      common: counts.common, numbers: counts.numbers, unassessed: counts.unassessed,
      unassessed_words: [...counts.unassessedWords].sort(byCodePoint),
      court: sortedNames(named.court), counsel: sortedNames(named.counsel), official: sortedNames(named.official),
      author: sortedNames(named.author), case: sortedNames(named.case),
      public: Object.fromEntries(Object.entries(pub).sort((x, y) => byCodePoint(x[0], y[0]))),
      anonymized_roles: [...anonymizedRoles].sort(byCodePoint),
    },
  };
}

// People, not words. A mention is a name as written: shown words next to each
// other ("Hans Müller"), with the other half of a double name where that half is
// a name made public elsewhere ("Müller-Meier"), and a capital initial before it
// ("H. Müller"). A person is a full name, in any order and case ("MÜLLER Hans");
// a longer name holding exactly one person's name is that person ("Anna
// Müller-Keller" is Anna Müller). A single word ("Müller", "Hans", "Müllers")
// belongs to the one person it fits; where it fits several it is ambiguous and
// the clerk decides; where it fits none it is a person of its own.
const LINK = /^[ \u00a0\u202f\-\u2011]$/u;
const HALF_AFTER = /^[\-\u2011]([\p{L}\p{Nl}\p{No}]{2,})/u;
const HALF_BEFORE = /(?<![\p{L}\p{N}_])([\p{L}\p{Nl}\p{No}]{2,})[\-\u2011]$/u;
const INITIAL_BEFORE = /(?<![\p{L}\p{N}_.])([A-Z])\.[ \u00a0\u202f]?$/u;

function people(t, words, has) {
  const text = t.text;
  const stems = new Set(words.map((w) => fold(w.text)));

  const runs = [];
  for (const w of [...words].sort((x, y) => x.start - y.start)) {
    const last = runs[runs.length - 1];
    if (last && t.index(last.end) === t.index(w.start) && LINK.test(text.slice(last.end, w.start) || 'x')) {
      last.end = w.end;
      last.names.push(w.text);
    } else {
      runs.push({ start: w.start, end: w.end, names: [w.text] });
    }
  }

  const half = (name) => isUpper(name[0]) && !has(name.toLowerCase());

  const mentions = [];
  for (const r of runs) {
    const i = t.index(r.start);
    const lo = t.starts[i];
    const hi = t.starts[i] + t.parts[i].text.length;
    let { start, end } = r;
    const names = [...r.names];
    let m = HALF_AFTER.exec(text.slice(end, Math.min(hi, end + 40)));
    if (m && half(m[1])) {
      end += m[0].length;
      names.push(m[1]);
    }
    m = HALF_BEFORE.exec(text.slice(Math.max(lo, start - 40), start));
    if (m && half(m[1])) {
      start -= m[0].length;
      names.unshift(m[1]);
    }
    m = INITIAL_BEFORE.exec(text.slice(Math.max(lo, start - 4), start));
    const initial = m ? m[1].toLowerCase() : null;
    if (m) start -= m[0].length;
    const tokens = [];
    names.forEach((name, k) => {
      let f = fold(name);
      if (f.endsWith('s') && stems.has(f.slice(0, -1))) {
        f = f.slice(0, -1);
        if (k === names.length - 1 && end === r.end) end -= 1;   // the genitive s stays: "A.________s Anwalt"
      }
      tokens.push(f);
    });
    mentions.push({ start, end, tokens: [...new Set(tokens)].sort(byCodePoint), initial });
  }

  const same = (x, y) => x.size === y.size && [...x].every((v) => y.has(v));
  const within = (x, y) => [...x].every((v) => y.has(v));
  const persons = [];
  const full = mentions.map((m, i) => i).filter((i) => mentions[i].tokens.length >= 2)
    .sort((x, y) => mentions[x].tokens.length - mentions[y].tokens.length || mentions[x].start - mentions[y].start);
  for (const i of full) {
    const toks = new Set(mentions[i].tokens);
    let fits = persons.map((q, k) => k).filter((k) => same(persons[k].tokens, toks));
    if (!fits.length) fits = persons.map((q, k) => k).filter((k) => within(persons[k].tokens, toks));
    if (fits.length === 1) persons[fits[0]].mentions.push(i);
    else persons.push({ tokens: toks, mentions: [i] });
  }
  const named = persons.length;
  const ambiguous = new Map();
  const alone = new Map();
  mentions.forEach((m, i) => {
    if (m.tokens.length >= 2) return;
    const tok = m.tokens[0];
    const fits = [];
    for (let k = 0; k < named; k++) {
      if (persons[k].tokens.has(tok)
          && (m.initial === null || [...persons[k].tokens].some((x) => x !== tok && x.startsWith(m.initial)))) fits.push(k);
    }
    if (fits.length === 1) {
      persons[fits[0]].mentions.push(i);
    } else if (fits.length) {
      if (!ambiguous.has(tok)) ambiguous.set(tok, { mentions: [], candidates: new Set() });
      ambiguous.get(tok).mentions.push(i);
      for (const k of fits) ambiguous.get(tok).candidates.add(k);
    } else if (alone.has(tok)) {
      persons[alone.get(tok)].mentions.push(i);
    } else {
      alone.set(tok, persons.length);
      persons.push({ tokens: new Set([tok]), mentions: [i] });
    }
  });

  const group = (ms) => {
    ms = [...ms].sort((x, y) => mentions[x].start - mentions[y].start);
    const places = [];
    const texts = [];
    for (const i of ms) {
      const m = mentions[i];
      const where = t.locate(m.start, m.end);
      where.visible = VISIBLE.has(t.kind(m.start));
      places.push(where);
      texts.push(where.text);
    }
    // the fullest form, the most frequent among those, the first among those (each form counted once)
    const forms = new Map();
    texts.forEach((x, i) => {
      const f = forms.get(x);
      if (f) f.count++;
      else forms.set(x, { words: x.split(/\s+/).filter(Boolean).length, count: 1, first: i });
    });
    let name = texts[0];
    let best = forms.get(name);
    for (const [x, f] of forms) {
      if (f.words > best.words || (f.words === best.words && (f.count > best.count || (f.count === best.count && f.first < best.first)))) {
        name = x;
        best = f;
      }
    }
    return { name, mentions: places };
  };

  const firstOf = (k) => Math.min(...persons[k].mentions.map((i) => mentions[i].start));
  const order = persons.map((q, k) => k).sort((x, y) => firstOf(x) - firstOf(y));
  const rank = new Map(order.map((k, n) => [k, n]));
  const outPeople = order.map((k) => group(persons[k].mentions));
  const outAmbiguous = [];
  for (const a of ambiguous.values()) {
    const g = group(a.mentions);
    g.candidates = [...a.candidates].map((k) => rank.get(k)).sort((x, y) => x - y);
    outAmbiguous.push(g);
  }
  outAmbiguous.sort((x, y) => x.mentions[0].part - y.mentions[0].part || x.mentions[0].start - y.mentions[0].start);
  return [outPeople, outAmbiguous];
}
