// Where a quotation sits on the original page, for highlighting it in the
// source view. Positions come only from the page itself: the pdf.js text
// layer, or the word boxes of local OCR for a scan. Nothing the model said is
// used. If the quotation is not found exactly once, there is no highlight.
import { ocrPageWords } from "./ocr.mjs";

let pdfjsPromise;
const pdfjs = () => (pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs"));

// Matching ignores whitespace: line breaks and spacing differ between the
// text layer and the reflowed page text, the characters do not.
const key = (text) => text.normalize("NFC").replace(/[\s\p{Cf}]/gu, "");

/**
 * Rectangles (fractions of the page, origin top left) covering `quote`
 * within `words` ([{t, b:[x,y,w,h]}] in reading order).
 * Returns {rects} or {rects: [], reason: "not_found" | "ambiguous" | "empty"}.
 */
export function quoteRects(words, quote) {
  const needle = key(quote);
  if (!needle) return { rects: [], reason: "empty" };
  let haystack = "";
  const owner = []; // per haystack character: [word index, character index within the word's key]
  words.forEach((word, i) => {
    const k = Array.from(key(word.t));
    k.forEach((ch, j) => { haystack += ch; for (let u = 0; u < ch.length; u++) owner.push([i, j]); });
  });
  const at = haystack.indexOf(needle);
  if (at < 0) return { rects: [], reason: "not_found" };
  if (haystack.indexOf(needle, at + 1) >= 0) return { rects: [], reason: "ambiguous" };
  const spans = new Map(); // word index → [first char, last char]
  for (let u = at; u < at + needle.length; u++) {
    const [i, j] = owner[u];
    const span = spans.get(i);
    spans.set(i, span ? [Math.min(span[0], j), Math.max(span[1], j)] : [j, j]);
  }
  const rects = [];
  for (const [i, [from, to]] of spans) {
    const [x, y, w, h] = words[i].b;
    const length = Array.from(key(words[i].t)).length || 1;
    const rect = { x: x + (w * from) / length, y, w: (w * (to - from + 1)) / length, h };
    // Join with the previous rectangle when it is on the same line.
    const last = rects.at(-1);
    if (last && Math.abs(last.y - rect.y) < rect.h * 0.5 && Math.abs(last.h - rect.h) < rect.h * 0.5 && rect.x >= last.x - 0.002 && rect.x - (last.x + last.w) < 0.05) {
      const right = Math.max(last.x + last.w, rect.x + rect.w), top = Math.min(last.y, rect.y), bottom = Math.max(last.y + last.h, rect.y + rect.h);
      Object.assign(last, { w: right - last.x, y: top, h: bottom - top });
    } else rects.push(rect);
  }
  return { rects: rects.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v * 1e5) / 1e5]))) };
}

/** Text runs of one PDF page with their boxes, from the pdf.js text layer. */
export async function pdfPageWords(bytes, n) {
  const { getDocument } = await pdfjs();
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false });
  const document = await task.promise;
  try {
    const page = await document.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });
    const words = [];
    for (const item of content.items) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const [a, b, c, d, e, f] = item.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b) || item.height || 10;
      // A run's box: from just below the baseline to the top of its capitals.
      const width = item.width || size * item.str.length * 0.5;
      const [x1, y1] = viewport.convertToViewportPoint(e, f - size * 0.22), [x2, y2] = viewport.convertToViewportPoint(e + width, f + size * 0.9);
      const left = Math.min(x1, x2), top = Math.min(y1, y2);
      words.push({ t: item.str, b: [left / viewport.width, top / viewport.height, Math.abs(x2 - x1) / viewport.width, Math.abs(y2 - y1) / viewport.height] });
    }
    return words;
  } finally {
    await task.destroy();
  }
}

/**
 * The geometry of one page of a case document, cached per file version:
 * the OCR word boxes for a scanned page, the text layer otherwise.
 */
export function pageLayouts() {
  const cache = new Map();
  return async function layout({ path, bytes, sha256, page }) {
    const id = `${sha256}:${page.n}`;
    if (!cache.has(id)) {
      cache.set(id, (async () => {
        if (page.ocr) return { source: "ocr", words: await ocrPageWords(path, page.n) };
        return { source: "text", words: await pdfPageWords(bytes, page.n) };
      })().catch(() => ({ source: page.ocr ? "ocr" : "text", words: null })));
      if (cache.size > 300) cache.delete(cache.keys().next().value);
    }
    return cache.get(id);
  };
}

/**
 * Highlight rectangles for a citation: the span [start, end) in code points of
 * the original page text, on the page as it is now. A page whose text changed
 * since the citation was checked gets no highlight.
 */
export async function citationRects(store, layout, { document, page: n, start, end, sha256: expected }) {
  const { bytes, source, path } = await store.originalFile(document);
  if (source.ext !== ".pdf") return { rects: [], reason: "not_a_pdf" };
  const page = store.originalPage(document, n);
  if (expected && expected !== page.sha256) return { rects: [], reason: "changed" };
  const chars = Array.from(page.text);
  if (!(Number.isInteger(start) && Number.isInteger(end) && 0 <= start && start < end && end <= chars.length)) return { rects: [], reason: "invalid_span" };
  const { source: kind, words } = await layout({ path, bytes, sha256: source.sha256, page });
  if (!words?.length) return { rects: [], reason: "no_layout", source: kind };
  return { ...quoteRects(words, chars.slice(start, end).join("")), source: kind };
}
