"use strict";

const MAX_SOURCE_CONTEXT_CHARACTERS = 2000;
/** Display-only context. Callers must first validate ownership, source version,
 * bytes/page hash or live public window. This never edits a model citation or
 * determines whether its source supports a claim. Offsets are Unicode points. */
function sourceQuoteContext(source, citation) {
  const badUnicode = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
  if (!source || !citation || typeof source.id !== "string" || !source.id || source.id.length > 2000
      || source.id !== citation.source_id || typeof source.text !== "string" || source.text.length > 2_000_000
      || badUnicode.test(source.text) || typeof citation.quote !== "string" || !citation.quote.trim()
      || badUnicode.test(citation.quote) || !Number.isSafeInteger(source.start) || source.start < 0
      || !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end)
      || citation.start < source.start || citation.end <= citation.start) throw new Error("source_context_invalid");
  const points = Array.from(source.text), start = citation.start - source.start, end = citation.end - source.start;
  if (!Number.isSafeInteger(source.start + points.length) || end > points.length || points.slice(start, end).join("") !== citation.quote) throw new Error("source_context_invalid");
  // Keep the full model quote elsewhere; never shorten it to fit the context.
  if (end - start > MAX_SOURCE_CONTEXT_CHARACTERS) return null;
  const before = points.slice(0, start).join(""), after = points.slice(end).join("");
  const breaks = [...before.matchAll(/\r?\n[ \t]*(?:\r?\n)+/g)], last = breaks.at(-1);
  const paragraphStart = last ? Array.from(before.slice(0, last.index + last[0].length)).length : 0;
  const next = /\r?\n[ \t]*(?:\r?\n)+/.exec(after);
  const paragraphEnd = next ? end + Array.from(after.slice(0, next.index)).length : points.length;
  let contextStart = paragraphStart, contextEnd = paragraphEnd;
  if (contextEnd - contextStart > MAX_SOURCE_CONTEXT_CHARACTERS) {
    const left = Math.floor((MAX_SOURCE_CONTEXT_CHARACTERS - (end - start)) / 2);
    contextStart = Math.max(paragraphStart, start - left);
    contextEnd = Math.min(paragraphEnd, contextStart + MAX_SOURCE_CONTEXT_CHARACTERS);
    contextStart = Math.max(paragraphStart, contextEnd - MAX_SOURCE_CONTEXT_CHARACTERS);
  }
  return { source_id:source.id, start:source.start + contextStart, end:source.start + contextEnd,
    text:points.slice(contextStart, contextEnd).join(""), quote_start:citation.start, quote_end:citation.end,
    clipped_before:contextStart > paragraphStart, clipped_after:contextEnd < paragraphEnd,
    semantic_support:"not_checked" };
}
module.exports = { sourceQuoteContext, MAX_SOURCE_CONTEXT_CHARACTERS };
