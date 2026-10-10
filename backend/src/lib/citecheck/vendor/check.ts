// @ts-nocheck -- Pinned upstream plain JavaScript; see PROVENANCE.json and MIT-LICENSE.
// Checks found references against the cite list. Pure functions: no DOM, no
// network, no Word. Every finding says what was compared and what the list
// holds; nothing here judges whether a decision supports the draft.
//
// status   found      the decision is in the list and nothing written contradicts it
//          differs    the decision is in the list, a written detail is not
//                     (Erwägung, page, date, court)
//          missing    nothing in the list under this label; near labels are offered
//          unchecked  looks like a reference, in a form the list cannot answer
import { bgeKey, docketKey, parseBgeKey } from './keys';
import { findCitations, findLoose, parseReference, pinpointParent } from './parser';

const FEDERAL_FAMILY = new Set(['bger', 'bge', 'bge_egmr']);
const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BGE_PARTS = ['I', 'IA', 'IB', 'II', 'III', 'IV', 'V'];

function inScope(parsed, row) {
  if (parsed.courts.size) {
    if (parsed.courts.has(row.court)) return true;
    return [...parsed.courts].some((c) => FEDERAL_FAMILY.has(c)) && FEDERAL_FAMILY.has(row.court);
  }
  if (parsed.canton) return row.canton.toUpperCase() === parsed.canton || row.court.toLowerCase().startsWith(parsed.canton.toLowerCase() + '_');
  return true;
}

// Which court a label's shape belongs to, for the coverage note on a miss.
function courtOfShape(parsed) {
  if (parsed.bge && parsed.bgeFirst) return 'bge';
  const d = parsed.dockets[0] || '';
  if (/^\d[A-Z]{1,2}[ _.]\d{1,5}\/\d{4}$/.test(d)) return 'bger';
  if (/^[A-Z]{1,2}-\d{1,5}\/\d{4}$/.test(d)) return 'bvger';
  if (parsed.courts.size === 1) return [...parsed.courts][0];
  return null;
}

// Labels one typing error away: a wrong, missing, extra or swapped character.
function* oneEditAway(key) {
  const seen = new Set([key]);
  const emit = function* (candidate) {
    if (!seen.has(candidate)) { seen.add(candidate); yield candidate; }
  };
  for (let i = 0; i < key.length; i++) {
    const c = key[i];
    const pool = DIGITS.includes(c) ? DIGITS : LETTERS.includes(c) ? LETTERS : null;
    if (pool) for (const r of pool) yield* emit(key.slice(0, i) + r + key.slice(i + 1));
    if (pool) yield* emit(key.slice(0, i) + key.slice(i + 1));
    if (i + 1 < key.length && key[i + 1] !== c) yield* emit(key.slice(0, i) + key[i + 1] + c + key.slice(i + 2));
  }
  for (let i = 0; i <= key.length; i++) {
    const around = (key[i - 1] || '') + (key[i] || '');
    const pool = /\d/.test(around) ? DIGITS : /[A-Z]/.test(around) ? LETTERS : '';
    for (const r of pool) yield* emit(key.slice(0, i) + r + key.slice(i));
  }
}

// In a dense series nearly every number has neighbours one character away, so
// nearness alone says little. What the draft itself says decides the order: a
// neighbour with the written date first, then one that has the written Erwägung,
// then the court named. Without any of these the neighbours are only "similar".
function suggestDockets(index, key, parsed, { dateOnly = false } = {}) {
  const out = [];
  for (const candidate of oneEditAway(key)) {
    for (const row of index.lookup(candidate)) {
      const date = Boolean(parsed.date) && row.date === parsed.date;
      const pin = Boolean(parsed.pinpoint) && row.enums.some((e) => e === parsed.pinpoint || e.startsWith(parsed.pinpoint + '.'));
      if (dateOnly && !date) continue;
      out.push({ reason: date ? 'one_character_same_date' : 'one_character', row, score: (date ? 0 : 4) + (pin ? 0 : 2) + (inScope(parsed, row) ? 0 : 1) });
    }
  }
  out.sort((a, b) => a.score - b.score);
  const best = out.length && out[0].score < 4 ? out.filter((s) => s.score < 4) : out;
  return best.slice(0, 3).map(({ score, ...s }) => s);
}

function bgeRange(index, row) {
  const at = parseBgeKey(row.key);
  const next = parseBgeKey((index.neighbours(row.key).after || {}).key);
  const last = next && next.volume === at.volume && next.part === at.part ? next.page - 1 : null;
  return { first: at.page, last };
}

function suggestBge(index, parsed) {
  const { volume, part, page } = parsed.bge;
  const key = bgeKey(volume, part, page);
  const out = [];
  // The cited page may be the pinpoint page: the decision that contains it.
  const before = index.neighbours(key).before;
  const at = before && parseBgeKey(before.key);
  if (at && at.volume === volume && at.part === part.toUpperCase()) {
    const range = bgeRange(index, before);
    // The last decision of a part in the list has no known end: only a page close to its start counts.
    if (range.last === null ? page - range.first <= 40 : page <= range.last) out.push({ reason: 'contains_page', row: before, range });
  }
  for (const other of BGE_PARTS) {
    if (other === part.toUpperCase()) continue;
    for (const row of index.lookup(bgeKey(volume, other, page))) out.push({ reason: 'other_part', row });
  }
  const digits = String(volume).padStart(3, '0') + String(page).padStart(4, '0');
  for (const candidate of oneEditAway(digits)) {
    if (candidate.length !== 7 || /\D/.test(candidate)) continue;
    const k = bgeKey(candidate.slice(0, 3), part, candidate.slice(3));
    for (const row of index.lookup(k)) if (!out.some((o) => o.row.key === row.key)) out.push({ reason: 'one_character', row });
    if (out.length >= 6) break;
  }
  return out.slice(0, 4);
}

// The Erwägung against the decision's own numbering.
function checkPinpoint(pinpoint, rows) {
  const withNumbers = rows.filter((r) => r.enums.length);
  if (!withNumbers.length) return { state: 'no_structure' };
  // A published extract may list 4.1 and 4.2 without a line for 4 itself: a number
  // with listed sub-numbers exists.
  const covers = (e) => e === pinpoint || (e.startsWith(pinpoint) && /^[.a-z/]/.test(e.slice(pinpoint.length)));
  if (withNumbers.some((r) => r.enums.some(covers))) return { state: 'exists' };
  const parent = pinpointParent(pinpoint);
  if (parent && withNumbers.some((r) => r.enums.includes(parent))) return { state: 'parent_only', parent };
  // What the decision does have at that place: the siblings, or the top level.
  // A number known only through its sub-numbers (4 through 4.1 and 4.2) is there too.
  const stem = pinpoint.includes('.') ? pinpoint.slice(0, pinpoint.lastIndexOf('.') + 1) : '';
  const depth = pinpoint.split('.').length;
  const enums = withNumbers[0].enums;
  const level = (prefix, n) => [...new Set(enums.filter((e) => e.startsWith(prefix) && e.split('.').length >= n)
    .map((e) => e.split('.').slice(0, n).join('.').replace(/\/.*$/, '')))];
  let nearby = stem ? level(stem, depth) : [];
  if (!nearby.length) nearby = level('', 1);
  return { state: 'absent', nearby: nearby.slice(0, 14), more: nearby.length > 14 };
}

function checkOne(index, parsed) {
  const useBge = parsed.bge && (parsed.bgeFirst || !parsed.dockets.length);
  const key = useBge ? bgeKey(parsed.bge.volume, parsed.bge.part, parsed.bge.page) : docketKey(parsed.dockets[0]);
  const all = index.lookup(key);
  const rows = all.filter((r) => inScope(parsed, r));
  const result = { key, label: useBge ? 'bge' : 'docket', status: 'found', rows, issues: [], notes: [] };

  if (!all.length) {
    result.status = 'missing';
    result.suggestions = useBge ? suggestBge(index, parsed) : suggestDockets(index, key, parsed);
    result.courtOfShape = courtOfShape(parsed);
    return result;
  }
  if (!rows.length) {
    result.rows = all;
    result.status = 'differs';
    result.issues.push({ kind: 'court', named: [...parsed.courts], canton: parsed.canton, rows: all });
    return result;
  }
  // A date the calendar does not have ("31. Februar 2013") is wrong whatever the list says.
  if (parsed.dateInvalid) {
    result.status = 'differs';
    result.issues.push({ kind: 'date_invalid', written: parsed.dateInvalid });
  }
  // 1 January is how the corpus writes a decision of which only the year is known.
  const dated = rows.filter((r) => r.date && !r.date.endsWith('-01-01'));
  if (parsed.date && !useBge && dated.length === rows.length && dated.every((r) => r.date !== parsed.date)) {
    result.status = 'differs';
    result.issues.push({ kind: 'date', written: parsed.date, listed: [...new Set(rows.map((r) => r.date))] });
    // The number may be the typing error, not the date: neighbours decided on the written date.
    result.suggestions = suggestDockets(index, key, parsed, { dateOnly: true });
  }
  if (parsed.pinpoint) {
    const pin = checkPinpoint(parsed.pinpoint, rows);
    if (pin.state === 'absent') {
      result.status = 'differs';
      result.issues.push({ kind: 'pinpoint', written: parsed.pinpoint, ...pin });
    } else if (pin.state !== 'exists') {
      result.notes.push({ kind: 'pinpoint_' + pin.state, written: parsed.pinpoint, parent: pin.parent });
    }
  }
  if (useBge && parsed.pages.length) {
    const range = bgeRange(index, rows[0]);
    const outside = parsed.pages.filter((p) => p < range.first || (range.last !== null && p > range.last));
    if (outside.length) {
      result.status = 'differs';
      result.issues.push({ kind: 'page', written: outside, range });
    } else if (range.last !== null) {
      result.notes.push({ kind: 'page_inside', written: parsed.pages, range });
    }
  }
  if (rows.length > 1 && new Set(rows.map((r) => r.court + r.date)).size > 1) result.notes.push({ kind: 'several', rows });
  return result;
}

function occurrencesBefore(text, needle, position) {
  let n = 0;
  for (let at = text.indexOf(needle); at >= 0 && at < position; at = text.indexOf(needle, at + needle.length)) n++;
  return n;
}

// Runs of spaces as one ("BGE 140  III 115"), and none around the slash of a docket number
// ("4A_747 / 2012"), with a map back to the paragraph as written.
const SPACED_SLASH = /(?:\d[A-Z]{1,2}[ _.]|[A-Z]{1,2}-)\d{1,5}([ \t\u00a0\u202f]*)\/([ \t\u00a0\u202f]*)\d{4}(?!\d)/g;
function collapse(text) {
  const drop = new Set();
  for (const m of text.matchAll(SPACED_SLASH)) {
    const slash = m.index + m[0].length - 4 - m[2].length - 1;          // the year is the last four digits
    for (let k = 1; k <= m[1].length; k++) drop.add(slash - k);
    for (let k = 1; k <= m[2].length; k++) drop.add(slash + k);
  }
  if (!drop.size && !/[ \t\u00a0\u202f]{2}/.test(text)) return { text, at: null };
  let out = '';
  const at = [];
  for (let i = 0; i < text.length; i++) {
    if (drop.has(i)) continue;
    if (/[ \t\u00a0\u202f]/.test(text[i]) && i > 0 && /[ \t\u00a0\u202f]/.test(text[i - 1])) continue;
    at.push(i);
    out += text[i];
  }
  at.push(text.length);
  return { text: out, at };
}

// What the finder leaves after a reference and the draft still says of it, in any order and
// any capitals: an Erwägung ("Erwägung 99", "Consid. 99", "Considerando 99"), pages ("pp. 999",
// "S. 118" before the Erwägung), a date ("vom 6. April 2013"); separated by ordinary,
// non-breaking or narrow non-breaking spaces. One qualifier at a time, at most four.
const GAP = String.raw`[\s  ]`;
const QUALIFIER = new RegExp(String.raw`^,?${GAP}*(?:` +
  String.raw`(?:E\.|Erw\.|Erwägung|Erwaegung|consid\.|consid|cons\.|considérant|considerando|c\.)${GAP}*\d+(?:\.\d+)*[a-z]{0,2}(?:\/[a-z]{1,2})?(?![\d.]\d)` +
  String.raw`|(?:S\.|SS\.|p\.|pp\.|pag\.|pagg\.)${GAP}*\d{1,4}(?:${GAP}*(?:ff?\.|ss?\.))?(?!\d)` +
  String.raw`|(?:vom|du|del|de|of)${GAP}+(?:\d{1,2}(?:\.|er)?${GAP}*[A-Za-zÀ-ÿ]+${GAP}+\d{4}|\d{1,2}\.${GAP}?\d{1,2}\.${GAP}?\d{4})(?!\d))`, 'i');

function qualifiers(rest) {
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const m = QUALIFIER.exec(rest.slice(n));
    if (!m) break;
    n += m[0].length;
  }
  return n;
}

// paragraphs: [{text, where}] in reading order; `where` is opaque to this module.
// Returns {findings, counts, paragraphs}; a finding carries its place in the
// document (paragraph, start, end, position 0..1) and the check result.
export function checkDocument(paragraphs, index) {
  const texts = paragraphs.map((p) => p.text);
  const lengths = texts.map((t) => t.length + 1);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const offsets = [];
  lengths.reduce((sum, n, i) => { offsets[i] = sum; return sum + n; }, 0);

  // The finder is the research client's; spaces and suffixes are handled around it.
  const collapsed = texts.map(collapse);
  const back = (f) => {
    const c = collapsed[f.paragraph];
    if (!c.at) return f;
    const start = c.at[f.start];
    const end = c.at[f.end - 1] + 1;
    return { ...f, start, end, text: texts[f.paragraph].slice(start, end) };
  };
  const found = findCitations(collapsed.map((c) => c.text)).map(back);
  for (const f of found) {
    const n = qualifiers(texts[f.paragraph].slice(f.end));
    if (!n) continue;
    const text = texts[f.paragraph].slice(f.start, f.end + n);
    const parsed = parseReference(text);
    if (parsed.bge && f.parsed.bge ? parsed.bge.page !== f.parsed.bge.page : parsed.dockets[0] !== f.parsed.dockets[0]) continue;
    Object.assign(f, { end: f.end + n, text, parsed });
  }
  // "BGE 129 III 320, 324": the page after a comma is the pinpoint page. Read here, not
  // in the finder, which stays the research client's; a number that cannot be a page
  // of the decision (a year, another volume) is left alone.
  for (const f of found) {
    if (!f.parsed.bge || f.parsed.pages.length || f.parsed.dockets.length) continue;
    const m = /^,[ \u00a0]?(\d{1,4})(?![\d\/]|\.\d|[ \u00a0]*(?:Ia|Ib|III|II|IV|I|V)\b)/.exec(texts[f.paragraph].slice(f.end));
    const page = m && Number(m[1]);
    if (page && page > f.parsed.bge.page && page - f.parsed.bge.page <= 200) f.parsed = { ...f.parsed, pages: [page] };
  }
  const memo = new Map();
  const findings = found.map((f) => {
    const memoKey = f.text + '|' + f.parsed.pages.join(',');
    if (!memo.has(memoKey)) memo.set(memoKey, checkOne(index, f.parsed));
    return { ...f, ...memo.get(memoKey) };
  });

  // Loose labels outside every reference, the references as read (with their suffixes) in the written text.
  for (const loose of findLoose(texts, found)) {
    const rows = loose.collection ? [] : index.lookup(docketKey(loose.text));
    findings.push({
      ...loose, parsed: null, key: docketKey(loose.text), label: 'docket', rows, issues: [],
      status: rows.length ? 'found' : 'unchecked',
      notes: rows.length ? [] : [{ kind: loose.collection ? 'collection' : 'unknown_shape' }],
    });
  }

  findings.sort((a, b) => a.paragraph - b.paragraph || a.start - b.start);
  findings.forEach((f, i) => {
    f.id = i;
    f.where = paragraphs[f.paragraph].where;
    f.position = (offsets[f.paragraph] + f.start) / total;
    const text = texts[f.paragraph];
    // Which of Word's search hits for the written text this finding is: every earlier,
    // non-overlapping occurrence counts, including one inside a longer reference
    // ("BGE 140 III 115" inside "BGE 140 III 115 E. 6.4.1" before it stands alone).
    f.nth = occurrencesBefore(text, f.text, f.start);
    f.context = { before: text.slice(Math.max(0, f.start - 48), f.start), after: text.slice(f.end, f.end + 48) };
    f.paragraphText = text;      // what Word must still hold there before the pane selects or comments
  });
  const counts = { found: 0, differs: 0, missing: 0, unchecked: 0 };
  for (const f of findings) counts[f.status]++;
  return { findings, counts, paragraphs: paragraphs.length };
}
