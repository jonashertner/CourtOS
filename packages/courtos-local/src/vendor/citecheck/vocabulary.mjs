// The vocabulary of the anonymization check: the words that cannot identify anyone.
//
//   #ocl-vocabulary 1
//   one lower-case word per line, sorted by UTF-8 bytes
//   "!name" lines: names the compound rule must not explain (Hof+mann)
//
// Held as bytes and searched in place, like the cite list: some 400,000 words
// cost their file size in memory, not 400,000 strings.

const NL = 10;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class Vocabulary {
  constructor(bytes) {
    this.bytes = bytes;
    const end = bytes.indexOf(NL);
    if (!/^#ocl-vocabulary 1\b/.test(decoder.decode(bytes.subarray(0, end < 0 ? 0 : end)))) {
      throw new Error('not a vocabulary (schema 1)');
    }
    this.start = end + 1;        // the header sits before the sorted lines
  }

  _lineStart(pos) {
    const b = this.bytes;
    while (pos > this.start && b[pos - 1] !== NL) pos--;
    return pos;
  }

  // -1, 0, 1: the line at `start` against the query bytes.
  _compare(start, q) {
    const b = this.bytes;
    for (let i = 0; ; i++) {
      const c = start + i < b.length ? b[start + i] : NL;
      if (c === NL || i === q.length) return c === NL ? (i === q.length ? 0 : -1) : 1;
      if (c !== q[i]) return c < q[i] ? -1 : 1;
    }
  }

  has(word) {
    const q = encoder.encode(word);
    let lo = this.start;
    let hi = this.bytes.length;
    while (lo < hi) {
      const start = this._lineStart((lo + hi) >>> 1);
      const c = this._compare(start, q);
      if (c === 0) return true;
      if (c < 0) {
        const end = this.bytes.indexOf(NL, start);
        lo = end < 0 ? this.bytes.length : end + 1;
      } else {
        hi = start;
      }
    }
    return false;
  }
}
