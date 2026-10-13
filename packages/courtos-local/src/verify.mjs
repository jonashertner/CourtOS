// Binding a validated result back to the originals, locally. Each quotation in
// the mirror is located by codepoint offsets, mapped through the private span
// map to the original page, and re-checked against the original page hash.
// Real names are restored for display only; nothing here is sent anywhere.
import { REPLACEMENT_PREFIX } from "./language.mjs";
import { resolveDerivativeSpan } from "./mirror.mjs";
import { aliasExpression, codepoints, escapeRegex, LEGAL_FORM, sha256, toCodepointIndex, toUnitIndex } from "./util.mjs";

// "n° Parcelle 2" stands for "n° 1846"; "la Parcelle 2" for "la parcelle 1846".
const NUMBER_WORD = /(?:n°|no\.|nr\.|n\.|nummer|numéro|numero|number)\s*$/iu;
const SENTENCE_START = /(?:^|[.!?:]\s+|\n\s*)$/u;

/** Replace neutral labels with the real names, for local display. */
export function rehydrator(register) {
  // A damaged OCR word read as its repaired form ("Rüge") is not a name: "Rüge" in a
  // result stays "Rüge" rather than turning back into the damaged "Ruge".
  const entries = register.entities.filter(e => e.decision === "replace" && e.replacement && !e.read_as)
    .sort((a, b) => b.replacement.length - a.replacement.length)
    .map(e => {
      let pattern = aliasExpression(e.replacement, "gu");
      // The mirror keeps a company's legal form after its letter ("AZ.________ AG"), and a
      // model may add one; the name restored already ends in it.
      const form = e.kind === "organisation" ? e.label.trim().split(/\s+/u).at(-1) : null;
      if (form && LEGAL_FORM.test(form)) pattern = new RegExp(`${pattern.source}(?:[ \\t]+${escapeRegex(form)}(?![\\p{L}\\p{N}\\p{M}_]))?`, "gu");
      // A parcel registered by its number alone: its label stands for the word as well.
      const word = e.kind === "parcel" && !/\p{L}/u.test(e.label) ? /^(\p{L}+)\s+\d+$/u.exec(e.replacement)?.[1] : null;
      return { pattern, label: e.label, replacement: e.replacement, word };
    });
  const parcelLabel = (entry, before) => {
    if (!entry.word || NUMBER_WORD.test(before) || new RegExp(`${escapeRegex(entry.word)}\\s+$`, "iu").test(before)) return entry.label;
    const word = entry.word === REPLACEMENT_PREFIX.de.parcel || SENTENCE_START.test(before) ? entry.word : entry.word.toLocaleLowerCase();
    return `${word} ${entry.label}`;
  };
  return (text) => {
    const marks = [];
    let out = text;
    for (const entry of entries) {
      out = out.replace(entry.pattern, (...args) => {
        const label = parcelLabel(entry, args.at(-1).slice(Math.max(0, args.at(-2) - 16), args.at(-2)));
        return `\u0000${marks.push({ label, replacement: entry.replacement }) - 1}\u0001`;
      });
    }
    const segments = [];
    let plain = "";
    for (const part of out.split(/(\u0000\d+\u0001)/)) {
      const match = /^\u0000(\d+)\u0001$/.exec(part);
      if (match) { const mark = marks[Number(match[1])]; segments.push({ text: mark.label, pseudonym: mark.replacement }); plain += mark.label; }
      else if (part) { segments.push({ text: part }); plain += part; }
    }
    return { text: plain, segments };
  };
}

/** A quotation from a published decision or a working note: matched against
 *  the exact text the agent received. Names in public decisions are the
 *  court's own and are not rehydrated. */
function bindExtra(store, section, citation) {
  const unit = section.text.indexOf(citation.exact_quote);
  const unique = unit >= 0 && section.text.indexOf(citation.exact_quote, unit + 1) < 0;
  if (section.kind === "working_note") {
    const note = store.notes.find(n => n.id === section.meta.note);
    return { section_id: section.id, kind: "note", note: section.meta.note, label: section.meta.label, page_label: "", match: unique ? "exact" : unit < 0 ? "absent" : "ambiguous",
      quote_pseudonymised: citation.exact_quote, quote_original: note ? rehydrator(store.register)(citation.exact_quote).text : null };
  }
  const decision = section.meta.decision;
  return {
    section_id: section.id, kind: "authority", label: decision.docket ?? decision.decision_id, page_label: `Abschnitt ${section.meta.passage}`,
    decision_id: decision.decision_id, date: decision.date, court: decision.court, url: decision.url, source_url: decision.source_url,
    match: unique ? "exact" : unit < 0 ? "absent" : "ambiguous", wording: "original_verbatim",
    quote_original: citation.exact_quote, quote_pseudonymised: citation.exact_quote,
    context: section.text.slice(Math.max(0, unit - 400), unit + citation.exact_quote.length + 400),
  };
}

export function bindCitation(store, mirror, citation, extra = []) {
  const meta = mirror.sections.find(s => s.id === citation.section_id);
  if (!meta) {
    const section = extra.find(s => s.id === citation.section_id);
    return section ? bindExtra(store, section, citation) : { section_id: citation.section_id, match: "section_unknown" };
  }
  const document = mirror.documents.find(d => d.id === meta.document);
  const page = document.pages.find(p => p.n === meta.page);
  const map = store.maps[document.id]?.pages.find(p => p.n === page.n);
  const source = store.sources.find(s => s.id === document.id);
  const base = { section_id: citation.section_id, document: document.id, label: document.label, page: page.n, page_label: page.label, kind: document.kind, quote_pseudonymised: citation.exact_quote, ...(document.role === "internal_note" ? { internal_note: true } : {}) };
  const unit = page.text.indexOf(citation.exact_quote);
  if (unit < 0 || page.text.indexOf(citation.exact_quote, unit + 1) >= 0) return { ...base, match: unit < 0 ? "absent" : "ambiguous" };
  let original;
  try { original = store.originalPage(document.id, page.n); } catch { return { ...base, match: "original_unavailable" }; }
  if (original.sha256 !== map?.page_sha256 || source?.missing) return { ...base, match: "original_changed" };
  const start = toCodepointIndex(page.text, unit), end = start + codepoints(citation.exact_quote);
  const resolved = resolveDerivativeSpan({ text: page.text, spans: map.spans }, start, end);
  if (!resolved) return { ...base, match: "unresolved" };
  const from = toUnitIndex(original.text, resolved.original_start), to = toUnitIndex(original.text, resolved.original_end);
  return {
    ...base, match: "exact", wording: resolved.wording,
    quote_original: original.text.slice(from, to),
    original_start: resolved.original_start, original_end: resolved.original_end, page_sha256: original.sha256,
    file_sha256: source.sha256,
  };
}

/** Everything the interfaces need, with citations bound and names restored. */
export function bindResult(store, mirror, result, task, extra = []) {
  const rehydrate = rehydrator(store.register);
  const claims = result.claims.map(claim => ({
    id: claim.id,
    text: claim.text,
    display: rehydrate(claim.text),
    citations: claim.citations.map(citation => bindCitation(store, mirror, citation, extra)),
    context: (claim.context_references ?? []).map(citation => bindCitation(store, mirror, citation, extra)),
  }));
  const coverage = {
    sections: result.coverage.source_inventory.length,
    reviewed: result.coverage.source_inventory.filter(entry => entry.review === "reviewed").length,
    unreadable_pages: mirror.documents.flatMap(d => d.pages.filter(p => !p.section).map(p => ({ document: d.id, label: d.label, page: p.label }))),
    more_claims_reported: result.coverage.more_claims_reported,
    unread: result.coverage.source_inventory.filter(entry => entry.review === "unresolved" && mirror.sections.some(s => s.id === entry.section_id)).map(entry => {
      const meta = mirror.sections.find(s => s.id === entry.section_id);
      const document = mirror.documents.find(d => d.id === meta?.document);
      return { section: entry.section_id, label: document?.label, page: meta?.page };
    }),
  };
  // Internal notes of the court are context, not part of the file Claude has to read.
  const notePages = new Set(mirror.documents.filter(d => d.role === "internal_note").flatMap(d => d.pages.map(p => p.section)).filter(Boolean));
  coverage.sections = mirror.sections.filter(s => !notePages.has(s.id)).length;
  coverage.reviewed = result.coverage.source_inventory.filter(entry => entry.review === "reviewed" && mirror.sections.some(s => s.id === entry.section_id)).length;
  const authorities = [];
  for (const section of extra) if (section.meta?.decision && !authorities.some(a => a.decision_id === section.meta.decision.decision_id)) authorities.push(section.meta.decision);
  coverage.authorities_read = authorities.filter(a => extra.some(s => s.meta?.decision?.decision_id === a.decision_id && result.coverage.source_inventory.some(e => e.section_id === s.id && e.review === "reviewed")));
  return {
    task, rows: result.rows, claims, coverage,
    integrity: {
      result_sha256: sha256(JSON.stringify(result)), mirror_sha256: mirror.sha256, register_rev: store.register.rev, original_bytes_revalidated: false,
      // The file versions this result was produced from, for marking it stale later.
      sources: Object.fromEntries(mirror.documents.map(d => [d.id, store.sources.find(s => s.id === d.id)?.sha256 ?? null])),
    },
    status: "ai_draft_requires_review",
  };
}

/**
 * Has a file changed since the result was produced? A document Claude read
 * that changed or disappeared makes the result stale. Each entry lists the
 * cited pages whose text is no longer the text that was checked; documents
 * added to the folder since are listed. Results from before the per-run file
 * list fall back to the files their citations name.
 */
export function staleness(store, bound) {
  if (!bound) return null;
  const recorded = new Map(Object.entries(bound.integrity?.sources ?? {}));
  if (!bound.integrity?.sources) for (const claim of bound.claims) for (const c of [...claim.citations, ...claim.context]) if (c.document && c.file_sha256) recorded.set(c.document, c.file_sha256);
  const current = new Map(store.sources.filter(s => !s.missing).map(s => [s.id, s]));
  // A changed file need not touch the cited passage: compare each cited page's text.
  const citedPages = (id) => {
    const pages = new Map();
    for (const claim of bound.claims) for (const c of [...claim.citations, ...claim.context]) if (c.document === id && c.page) pages.set(c.page, c.page_sha256 ?? null);
    return pages;
  };
  const pageMoved = (id, n, hash) => { try { return !hash || store.originalPage(id, n).sha256 !== hash; } catch { return true; } };
  const changed = [];
  for (const [id, hash] of recorded) {
    const source = current.get(id);
    const pages = [...citedPages(id)];
    if (!source) changed.push({ document: id, label: store.sources.find(s => s.id === id)?.label ?? id, reason: "missing", pages: pages.map(([n]) => n).sort((a, b) => a - b) });
    else if (hash && source.sha256 !== hash) changed.push({ document: id, label: source.label, reason: "changed", pages: pages.filter(([n, h]) => pageMoved(id, n, h)).map(([n]) => n).sort((a, b) => a - b) });
  }
  const added = bound.integrity?.sources ? [...current.values()].filter(s => s.include && s.status === "ok" && !recorded.has(s.id)).map(s => ({ document: s.id, label: s.label })) : [];
  return { stale: changed.length > 0, changed, added };
}
