// @ts-nocheck -- Pinned upstream plain JavaScript; see PROVENANCE.json and MIT-LICENSE.
// The cite list: one sorted text file, held as bytes and searched in place.
//
//   #ocl-cite-index 1
//   key \t court \t canton \t date \t e-numbers (comma separated) \t decision id
//
// Lines are sorted by the UTF-8 bytes of the key, so a lookup is a binary search
// over the buffer and a million decisions cost their file size in memory, not a
// million objects. Several decisions may share a key (the same file number at
// two courts); their lines are adjacent.


const NL = 10;
const TAB = 9;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class CiteIndex {
  constructor(bytes) {
    this.bytes = bytes;
    const end = bytes.indexOf(NL);
    const header = decoder.decode(bytes.subarray(0, end < 0 ? 0 : end));
    if (!/^#ocl-cite-index 1\b/.test(header)) throw new Error('not a cite index (schema 1)');
  }

  _lineStart(pos) {
    const b = this.bytes;
    while (pos > 0 && b[pos - 1] !== NL) pos--;
    return pos;
  }

  _lineEnd(pos) {
    const end = this.bytes.indexOf(NL, pos);
    return end < 0 ? this.bytes.length : end;
  }

  // Compares the key of the line at `start` with the query bytes.
  _compare(start, q) {
    const b = this.bytes;
    let i = 0;
    for (;; i++) {
      const c = start + i < b.length ? b[start + i] : NL;
      const keyEnded = c === TAB || c === NL;
      if (keyEnded || i === q.length) return keyEnded ? (i === q.length ? 0 : -1) : 1;
      if (c !== q[i]) return c < q[i] ? -1 : 1;
    }
  }

  // Offset of the first line whose key is >= the query.
  _lowerBound(q) {
    let lo = 0;
    let hi = this.bytes.length;
    while (lo < hi) {
      const start = this._lineStart((lo + hi) >>> 1);
      if (this._compare(start, q) < 0) lo = Math.min(this._lineEnd(start) + 1, this.bytes.length);
      else hi = start;
    }
    return lo;
  }

  _row(start) {
    if (start >= this.bytes.length) return null;
    const line = decoder.decode(this.bytes.subarray(start, this._lineEnd(start)));
    if (!line || line[0] === '#') return null;
    const [key, court, canton, date, enums, id] = line.split('\t');
    return { key, court, canton: canton || '', date: date || '', enums: enums ? enums.split(',') : [], id: id || '' };
  }

  // Every decision filed under the key.
  lookup(key) {
    const q = encoder.encode(key);
    const rows = [];
    let pos = this._lowerBound(q);
    while (pos < this.bytes.length && this._compare(pos, q) === 0) {
      const row = this._row(pos);
      if (row) rows.push(row);
      pos = this._lineEnd(pos) + 1;
    }
    return rows;
  }

  has(key) {
    const q = encoder.encode(key);
    const pos = this._lowerBound(q);
    return pos < this.bytes.length && this._compare(pos, q) === 0;
  }

  // The last row with a key below the query, and the first with a key above it.
  neighbours(key) {
    const q = encoder.encode(key);
    const at = this._lowerBound(q);
    const before = at > 0 ? this._row(this._lineStart(at - 1)) : null;
    let pos = at;
    while (pos < this.bytes.length && this._compare(pos, q) === 0) pos = this._lineEnd(pos) + 1;
    return { before, after: this._row(pos) };
  }
}
