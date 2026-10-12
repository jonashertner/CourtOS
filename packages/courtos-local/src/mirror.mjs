// The sanitised mirror: the only representation of the case folder a model
// ever sees. Replacement uses the shared projection kernel in ordered passes
// (identifiers, then addresses, then names, then places), so a name inside an
// e-mail address or a town inside a land-register entry cannot overlap another
// identity. Each pass is composed into one private span map per page.
import { pageLabel } from "./language.mjs";
import { createRequire } from "node:module";
import { reviewedTerms } from "./register.mjs";
import { CourtosError, matchExpression, sha256 } from "./util.mjs";

const require = createRequire(import.meta.url);
const kernel = require("@courtos/projection");

const LATER = [
  new Set(["parcel", "address"]),
  new Set(["organisation", "person"]),
  new Set(["place"]),
];
// The first pass takes every other kind: e-mail, IBAN, AHV, UID, phone, and
// plates, dates of birth, document numbers and any kind added later. A kind
// no pass names would be registered but never replaced.
export const PASSES = [{ has: (kind) => !LATER.some(kinds => kinds.has(kind)) }, ...LATER];

/** Map a position in the previous text to the original text, given spans. */
function toOriginal(spans, position) {
  let delta = 0;
  for (const span of spans) {
    if (span.derivative_end <= position) delta += (span.original_end - span.original_start) - (span.derivative_end - span.derivative_start);
    else if (span.derivative_start < position) throw new CourtosError("pass_overlap");
  }
  return position + delta;
}

/** Shift a position in the previous text into the new pass's text. */
function toNext(passSpans, position) {
  let delta = 0;
  for (const span of passSpans) {
    if (span.original_end <= position) delta += (span.derivative_end - span.derivative_start) - (span.original_end - span.original_start);
    else if (span.original_start < position) throw new CourtosError("pass_overlap");
  }
  return position + delta;
}

/** Composes the kernel passes. Returns the kernel's TextTransformation shape.
 *  `keep` is a set of original codepoint offsets whose replacement the user
 *  declined for this page (occurrence review); those stay verbatim. */
export function compilePageTransform(register) {
  const compiled = PASSES.map(kinds => {
    const terms = reviewedTerms(register, kinds);
    return terms.length ? kernel.compileTextTransformation(terms) : null;
  });
  const originals = register.entities.filter(e => e.decision === "replace").flatMap(e => e.aliases.map(alias => matchExpression(alias, e.match, false)));
  return (text, keep = null) => {
    let current = text;
    let spans = [];
    for (const transform of compiled) {
      if (!transform) continue;
      // Labels put in by an earlier pass are CourtOS's own text: a later pass does not look
      // inside them ("Date" registered as a name, in "Date of birth 1"). They are masked with a
      // character no alias contains, and put back after the pass.
      const pass = transform(maskLabels(current, spans));
      const passText = restoreLabels(pass.text, current, spans, pass.spans);
      for (const span of spans) {
        if (pass.spans.some(p => p.original_start < span.derivative_end && p.original_end > span.derivative_start)) throw new CourtosError("pass_overlap");
      }
      const carried = spans.map(span => ({ ...span, derivative_start: toNext(pass.spans, span.derivative_start), derivative_end: toNext(pass.spans, span.derivative_end) }));
      const added = pass.spans.map(span => {
        const originalStart = toOriginal(spans, span.original_start);
        const originalEnd = toOriginal(spans, span.original_end);
        return { ...span, original_start: originalStart, original_end: originalEnd, original: Array.from(text).slice(originalStart, originalEnd).join("") };
      });
      spans = [...carried, ...added].sort((a, b) => a.original_start - b.original_start);
      current = passText;
    }
    let kept = [];
    if (keep?.size && spans.some(span => keep.has(span.original_start))) ({ text: current, spans, kept } = rebuild(text, spans, keep));
    // Kept occurrences, and the labels just put in, are not originals: "Lieu" registered as a
    // name is not left over in the place label "Lieu 6".
    const masked = maskKept(current, [...kept, ...spans]);
    return { text: current, original_text: text, spans, kept, requires_human_review: true, external_eligible: false, residual: residualOriginals(masked, originals) };
  };
}

const MASK = "\uE000";

function maskLabels(text, spans) {
  if (!spans.length) return text;
  const chars = Array.from(text);
  for (const span of spans) chars.fill(MASK, span.derivative_start, span.derivative_end);
  return chars.join("");
}

function restoreLabels(text, previous, spans, passSpans) {
  if (!spans.length) return text;
  const chars = Array.from(text), before = Array.from(previous);
  for (const span of spans) {
    const at = toNext(passSpans, span.derivative_start);
    chars.splice(at, span.derivative_end - span.derivative_start, ...before.slice(span.derivative_start, span.derivative_end));
  }
  return chars.join("");
}

/** Rebuild the derivative from the original, leaving kept occurrences verbatim. */
function rebuild(text, spans, keep) {
  const chars = Array.from(text);
  const out = [], next = [], kept = [];
  let cursor = 0, position = 0;
  for (const span of spans) {
    const before = chars.slice(cursor, span.original_start);
    out.push(...before);
    position += before.length;
    if (keep.has(span.original_start)) {
      const word = chars.slice(span.original_start, span.original_end);
      out.push(...word);
      kept.push({ derivative_start: position, derivative_end: position + word.length, entity_id: span.entity_id, original_start: span.original_start });
      position += word.length;
    } else {
      const replacement = Array.from(span.replacement);
      out.push(...replacement);
      next.push({ ...span, derivative_start: position, derivative_end: position + replacement.length });
      position += replacement.length;
    }
    cursor = span.original_end;
  }
  out.push(...chars.slice(cursor));
  return { text: out.join(""), spans: next, kept };
}

function maskKept(text, kept) {
  const chars = Array.from(text);
  // Not a space: "Acheteur [label] Nordsee" must not read as "Acheteur Nordsee".
  for (const k of kept) for (let i = k.derivative_start; i < k.derivative_end; i++) chars[i] = MASK;
  return chars.join("");
}

/** Text around kept occurrences, which the outbound guard may let pass verbatim. */
export function keptWindows(text, kept, radius = 48) {
  const chars = Array.from(text);
  return kept.map(k => chars.slice(Math.max(0, k.derivative_start - radius), Math.min(chars.length, k.derivative_end + radius)).join(""));
}

/** Registered originals still present (word-bounded; in any case unless the alias is an ordinary word). */
function residualOriginals(text, originals) {
  return originals.filter(pattern => pattern.test(text));
}

export const resolveDerivativeSpan = kernel.resolveDerivativeSpan;

/**
 * Build the mirror for released documents.
 * @returns {{ mirror, maps, issues }} mirror is model-visible; maps is private.
 */
export function buildMirror(register, documents, lang = "de", parties = []) {
  const transform = compilePageTransform(register);
  // Occurrence decisions are bound to the exact page version they were made on.
  const exceptions = new Map();
  for (const entity of register.entities) for (const ex of entity.exceptions ?? []) {
    const key = `${ex.doc}:${ex.page}:${ex.page_sha256}`;
    if (!exceptions.has(key)) exceptions.set(key, new Set());
    exceptions.get(key).add(ex.start);
  }
  // The parties as the model sees them: id, procedural role and the name as it appears in the text.
  const mirror = { schema: 1, language: lang, register_rev: register.rev, parties, documents: [], sections: [], kept: [] };
  const maps = {};
  const issues = [];
  let sectionNumber = 0;
  for (const document of documents) {
    const out = { id: document.id, label: document.label, role: document.role, party: document.party, kind: document.kind, pages: [] };
    maps[document.id] = { file_sha256: document.sha256, pages: [] };
    for (const page of document.pages) {
      if (!page.has_text) {
        out.pages.push({ n: page.n, label: pageLabel(page.label, lang), section: null, text: "", status: "no_text" });
        maps[document.id].pages.push({ n: page.n, page_sha256: page.sha256, spans: [] });
        continue;
      }
      let result;
      try {
        result = transform(page.text, exceptions.get(`${document.id}:${page.n}:${page.sha256}`) ?? null);
      } catch (error) {
        issues.push({ document: document.id, page: page.n, code: error.code ?? "transform_failed" });
        out.pages.push({ n: page.n, label: pageLabel(page.label, lang), section: null, text: "", status: "blocked" });
        maps[document.id].pages.push({ n: page.n, page_sha256: page.sha256, spans: [] });
        continue;
      }
      if (result.residual.length) issues.push({ document: document.id, page: page.n, code: "registered_term_remains" });
      const section = `S${++sectionNumber}`;
      out.pages.push({ n: page.n, label: pageLabel(page.label, lang), section, text: result.text, status: "ok", ...(page.ocr ? { ocr: true } : {}) });
      if (result.kept.length) mirror.kept.push(...keptWindows(result.text, result.kept));
      mirror.sections.push({ id: section, document: document.id, page: page.n });
      maps[document.id].pages.push({ n: page.n, page_sha256: page.sha256, section, spans: result.spans, derivative_sha256: sha256(result.text) });
    }
    mirror.documents.push(out);
  }
  if (sectionNumber > 9999) throw new CourtosError("folder_too_large");
  // The language and the parties are part of what is released, even when no page text changes.
  mirror.sha256 = sha256(JSON.stringify({ language: mirror.language, parties: mirror.parties, documents: mirror.documents }));
  mirror.kept = [...new Set(mirror.kept)];
  return { mirror, maps, issues };
}
