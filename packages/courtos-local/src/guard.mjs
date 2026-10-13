// Outbound guard. Every request body sent to a model provider and every query
// sent to OpenCaseLaw passes through it. A registered original (any spelling
// the user replaces), the case folder's path or file names, or an e-mail, IBAN,
// AHV or phone number stops the request before it is sent.
//
// Two deliberate exceptions, both decided by the user or by the source:
// - text that occurs verbatim in an allowed corpus around the hit: occurrences
//   the user chose to keep ("Mai" as a month), and passages of published
//   decisions, which can contain a common surname that is also registered;
// - values of identifiers the user marked "keep" (e.g. a court's e-mail).
// A hit is allowed only if its surrounding text (±24 characters, clipped at the
// string's ends) is found in that corpus, so a model sentence that introduces
// the same word in new wording is still blocked. Errors carry kinds and entity
// ids only, never the matched text.
import { basename } from "node:path";
import { CourtosError, matchExpression } from "./util.mjs";

const STRUCTURED = [
  ["email", /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?\.[\p{L}]{2,24}/giu],
  ["iban", /\b(?:CH|LI|DE|AT|FR|IT)[0-9]{2}(?:[ \t]?[A-Z0-9]){12,30}\b/g],
  ["ahv", /(?<!\d)756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}(?!\d)/g],
  ["phone", /(?<![\p{L}\p{N}])(?:\+|00)[1-9][0-9]{0,2}(?:[ ().-]*[0-9]){7,12}(?![\p{L}\p{N}])/gu],
];
const WINDOW = 24;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bounded = (text) => new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escape(text).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}\\p{M}_])`, "giu");

export class OutboundBlocked extends CourtosError {
  constructor(hits) {
    super("outbound_blocked", { hits }, 409);
  }
}

export function compileGuard({ register, realRoot, workRoot = null, relPaths = [], allowCorpus = [] }) {
  const checks = [];
  for (const entity of register.entities) {
    if (entity.decision !== "replace") continue;
    // A name that is also an ordinary word ("Pour", "Date") counts only where CourtOS or the
    // files put it, not in what the model wrote: the model saw it replaced wherever it was
    // capitalised, so its own "Pour" is French.
    for (const alias of new Set(entity.aliases)) checks.push({ kind: "registered", entity: entity.id, test: matchExpression(alias, entity.match), word: entity.match === "capitalised" });
  }
  // Neither the case folder's nor the work folder's path leaves the computer: both usually name the case.
  for (const path of new Set([realRoot, workRoot].filter(Boolean))) checks.push({ kind: "path", test: new RegExp(escape(path), "gi"), strict: true });
  // File names never reach the model (documents carry neutral labels); this
  // catches a code path that would accidentally include one.
  for (const rel of relPaths) checks.push({ kind: "file_name", test: new RegExp(escape(basename(rel)), "gi"), strict: true });
  for (const [kind, test] of STRUCTURED) checks.push({ kind, test });
  const keptPatterns = register.entities.filter(e => e.decision === "keep").flatMap(e => e.aliases).filter(a => a.length >= 3).map(bounded);
  // Replacement labels are never originals (a label is chosen so that the case
  // folder does not contain it): "Lieu" registered as a name inside "Lieu 6".
  for (const entity of register.entities) if (entity.decision === "replace" && entity.replacement) keptPatterns.push(bounded(entity.replacement));
  // Ranges of values the user chose to keep readable, and of replacement labels;
  // a pattern hit inside one (the digits of a kept IBAN that look like a phone number) is allowed.
  const keptRanges = (text) => {
    const ranges = [];
    for (const pattern of keptPatterns) { pattern.lastIndex = 0; for (const m of text.matchAll(pattern)) ranges.push([m.index, m.index + m[0].length]); }
    return ranges;
  };
  const corpus = [];
  const corpusSet = new Set();

  const allowed = (text, start, end, ranges) => {
    if (ranges.some(([a, b]) => a <= start && end <= b)) return true;
    if (!corpus.length) return false;
    const window = text.slice(Math.max(0, start - WINDOW), Math.min(text.length, end + WINDOW));
    return corpus.some(entry => entry.includes(window));
  };

  const guard = {
    /** Add text that may be repeated verbatim (kept occurrences, public decisions). */
    allow(text) {
      if (typeof text === "string" && text.length && !corpusSet.has(text)) { corpusSet.add(text); corpus.push(text); }
    },
    scan(text, { authored = false } = {}) {
      const hits = [];
      let ranges = null;
      for (const check of checks) {
        if (authored && check.word) continue;
        check.test.lastIndex = 0;
        for (const match of text.matchAll(check.test)) {
          ranges ??= keptRanges(text);
          if (!check.strict && allowed(text, match.index, match.index + match[0].length, ranges)) continue;
          hits.push({ kind: check.kind, entity: check.entity ?? null });
          break;
        }
      }
      return hits;
    },
    check(text) {
      const hits = guard.scan(text);
      if (hits.length) throw new OutboundBlocked(hits);
      return true;
    },
    /** Scan every string inside a request body. Scanning the serialised JSON
     *  would miss words after "\n" (escaped as backslash-n) and Windows paths.
     *  An assistant message (both wire formats carry `role`) is the model's own text. */
    checkBody(body) {
      const hits = [];
      const visit = (value, authored = false) => {
        if (typeof value === "string") hits.push(...guard.scan(value, { authored }));
        else if (Array.isArray(value)) value.forEach(item => visit(item, authored));
        else if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value)) {
            // A thinking block's signature and a redacted block's data are the provider's
            // encrypted output, returned unchanged: base64 can spell "+FC/", which is no name.
            if ((key === "signature" && value.type === "thinking") || (key === "data" && value.type === "redacted_thinking")) continue;
            visit(item, authored || value.role === "assistant");
          }
        }
      };
      visit(body);
      if (hits.length) throw new OutboundBlocked(hits);
      return true;
    },
  };
  for (const text of allowCorpus) guard.allow(text);
  return guard;
}
