// Lookup keys of the cite index. build/build_cite_index.py implements the same
// two functions in Python; tests/fixtures/key_cases.json holds the cases both
// sides must agree on. A key is never shown to the user and is never a citation.

// Word writes non-breaking spaces and hyphens inside references; each is one
// UTF-16 unit and is replaced by one, so offsets into the text stay valid.
export function normaliseText(text) {
  return (text || '')
    .replace(/[\u00a0\u2007\u2009\u202f]/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
}

const PARTS = new Set(['I', 'IA', 'IB', 'II', 'III', 'IV', 'V']);

// "BGE 140 III 115" -> "BGE 140 III 0115": pages padded so that the decisions
// of one volume and part sort by page and a page pinpoint finds its decision.
export function bgeKey(volume, part, page) {
  const p = String(part).toUpperCase();
  if (!PARTS.has(p)) return null;
  return 'BGE ' + String(Number(volume)).padStart(3, '0') + ' ' + p + ' ' + String(Number(page)).padStart(4, '0');
}

export function parseBgeKey(key) {
  const m = /^BGE (\d{3}) (IA|IB|III|II|IV|I|V) (\d{4})$/.exec(key || '');
  return m ? { volume: Number(m[1]), part: m[2], page: Number(m[3]) } : null;
}

// Federal files are written 4A_747/2012, 4A 747/2012 and, before 2007,
// 4C.230/2006: one key. Spacing around slashes and runs of spaces are folded.
export function docketKey(docket) {
  let s = normaliseText(docket).toUpperCase();
  s = s.replace(/(\d[A-Z]{1,2})[ _.](\d{1,5}\/\d{4})/g, '$1_$2');
  s = s.replace(/\s*\/\s*/g, '/');
  return s.replace(/\s+/g, ' ').trim();
}
