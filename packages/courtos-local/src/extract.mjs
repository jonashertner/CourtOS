// Local text extraction. Originals are read, never written. Each result is a
// list of pages (PDF) or fixed text sections (DOCX, text), each with canonical
// text that every later quotation check refers to.
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { canonicalText, sha256 } from "./util.mjs";

export const EXTRACTOR = "courtos-local-extract/1";
export const SUPPORTED = new Set([".pdf", ".docx", ".txt", ".md"]);
const SECTION_CHARS = 3500;
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_PAGES = 1500;

let pdfjsPromise;
async function pdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/** Joins pdf.js text items into lines, then reflows lines into paragraphs. */
function reflow(items) {
  const lines = [];
  let line = null;
  const flush = () => {
    if (line && line.parts.join("").trim()) lines.push({ y: line.y, text: line.parts.join("").replace(/\s+/g, " ").trim() });
    line = null;
  };
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = item.transform[5];
    if (line && Math.abs(y - line.y) > 2) flush();
    line ??= { y, parts: [] };
    line.parts.push(item.str);
    if (item.hasEOL) flush();
  }
  flush();
  if (!lines.length) return "";
  const gaps = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    if (gap > 0) gaps.push(gap);
  }
  gaps.sort((a, b) => a - b);
  // Sparse pleadings have many paragraph gaps; the lower quartile is the line gap.
  const typical = gaps.length ? gaps[Math.floor((gaps.length - 1) / 4)] : 0;
  let text = lines[0].text;
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y;
    const paragraph = gap <= 0 || (typical > 0 && gap > typical * 1.3);
    if (paragraph) text += "\n\n" + lines[i].text;
    else if (/[\p{L}]-$/u.test(text) && /^\p{Ll}/u.test(lines[i].text)) text += lines[i].text;
    else text += " " + lines[i].text;
  }
  return text;
}

async function extractPdf(bytes) {
  const { getDocument } = await pdfjs();
  const task = getDocument({
    data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true,
    useSystemFonts: false, verbosity: 0, stopAtErrors: false,
  });
  const document = await task.promise;
  try {
    if (document.numPages > MAX_PAGES) return { pages: [], status: "too_large" };
    const pages = [];
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const text = canonicalText(reflow(content.items));
      pages.push({ n, label: `S. ${n}`, text, has_text: text.replace(/\s/g, "").length >= 20 });
      page.cleanup();
    }
    return { pages, status: "ok" };
  } finally {
    await task.destroy();
  }
}

const xmlEntities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
  if (entity[0] === "#") return String.fromCodePoint(entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  return xmlEntities[entity] ?? match;
});

/** Paragraph text from word/document.xml; tracked deletions are excluded. */
export function docxParagraphs(bytes) {
  const files = unzipSync(new Uint8Array(bytes), { filter: (file) => file.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) return [];
  const body = strFromU8(xml).replace(/<w:del\b[\s\S]*?<\/w:del>/g, "");
  const paragraphs = [];
  for (const match of body.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    let text = "";
    for (const run of match[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      text += run[1] !== undefined ? decodeXml(run[1]) : run[0] === "<w:tab/>" ? " " : "\n";
    }
    if (text.trim()) paragraphs.push(text);
  }
  return paragraphs;
}

/** Fixed-size sections built from whole paragraphs, labelled by paragraph range. */
function sectionise(paragraphs, unit) {
  const pages = [];
  let buffer = [], first = 1;
  const flush = (last) => {
    if (!buffer.length) return;
    const text = canonicalText(buffer.join("\n\n"));
    pages.push({ n: pages.length + 1, label: first === last ? `${unit} ${first}` : `${unit} ${first}–${last}`, text, has_text: text.length > 0 });
    buffer = [];
  };
  paragraphs.forEach((paragraph, index) => {
    if (buffer.length && buffer.join("\n\n").length + paragraph.length > SECTION_CHARS) {
      flush(index);
      first = index + 1;
    }
    buffer.push(paragraph);
  });
  flush(paragraphs.length);
  return pages;
}

export async function extractFile(absolutePath) {
  const extension = extname(absolutePath).toLowerCase();
  if (!SUPPORTED.has(extension)) return { status: "unsupported", pages: [], sha256: null, bytes: 0 };
  const bytes = await readFile(absolutePath);
  const fileHash = sha256(bytes);
  if (bytes.length > MAX_FILE_BYTES) return { status: "too_large", pages: [], sha256: fileHash, bytes: bytes.length };
  try {
    let result;
    if (extension === ".pdf") result = await extractPdf(bytes);
    else if (extension === ".docx") result = { status: "ok", pages: sectionise(docxParagraphs(bytes), "Abs.") };
    else result = { status: "ok", pages: sectionise(bytes.toString("utf8").split(/\n\s*\n/), "Abs.") };
    for (const page of result.pages) page.sha256 = sha256(page.text);
    return { ...result, sha256: fileHash, bytes: bytes.length, extractor: EXTRACTOR };
  } catch {
    // Error text can contain file content or paths; report a code only.
    return { status: "unreadable", pages: [], sha256: fileHash, bytes: bytes.length, extractor: EXTRACTOR };
  }
}
