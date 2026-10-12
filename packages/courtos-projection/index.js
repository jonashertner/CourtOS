/** Single shared, dependency-free projection implementation. Authored runtime; no generated client copy. */
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportProjectionError = exports.PseudonymisationError = void 0;
exports.transformTextCore = transformTextCore;
exports.capitalisedForms = capitalisedForms;
exports.compileTextTransformation = compileTextTransformation;
exports.resolveDerivativeSpan = resolveDerivativeSpan;
exports.buildProjectionCore = buildProjectionCore;
exports.buildProjectionV2Core = buildProjectionV2Core;
exports.prepareProjectionV2AnswerBinding = prepareProjectionV2AnswerBinding;
exports.projectionMarkdown = projectionMarkdown;
class PseudonymisationError extends Error {
    code;
    constructor(code) {
        // Error messages intentionally never interpolate names or source text.
        super(code);
        this.code = code;
    }
}
exports.PseudonymisationError = PseudonymisationError;
const byteLength = (text) => new TextEncoder().encode(text).byteLength;
const key = (text) => text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
const count = (text) => Array.from(text).length;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const forbidden = /[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const invalidUnicode = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
function expression(alias, match) {
    const escaped = (text) => text.split(/\s+/u).map(escapeRegex).join("\\s+");
    // Unicode word boundaries protect, e.g., Ann from replacing Anne.
    if (match !== "capitalised")
        return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${escaped(alias)})(?![\\p{L}\\p{N}\\p{M}_])`, "giu");
    // A word that is also an ordinary word ("Pour", "Date") is a name only where it is
    // capitalised. The lower-case word stays readable. Aliases differing only in case are
    // one alias here, so every capitalised form is derived from whichever spelling is kept.
    const forms = capitalisedForms(alias).map(escaped).join("|");
    return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])(?:${forms})(?![\\p{L}\\p{N}\\p{M}_])`, "gu");
}
/** "ledger" → Ledger, LEDGER; "date document" → Date document, Date Document, DATE DOCUMENT. */
function capitalisedForms(alias) {
    const upperFirst = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
    const lower = alias.toLocaleLowerCase();
    return [...new Set([upperFirst(alias), upperFirst(lower), lower.split(" ").map(upperFirst).join(" "), alias.toLocaleUpperCase()])];
}
function validateTerms(terms) {
    if (terms.length > 500 || terms.reduce((total, term) => total + term.aliases.length, 0) > 1000) {
        throw new PseudonymisationError("invalid_mapping");
    }
    const entities = new Set();
    const aliases = new Map();
    const replacements = new Map();
    const canonical = [];
    for (const term of terms) {
        if (!term.reviewed)
            throw new PseudonymisationError("unreviewed_mapping");
        if (!term.entity_id || entities.has(term.entity_id) || !Number.isSafeInteger(term.revision) || term.revision < 1
            || !term.aliases.length || term.aliases.length > 100 || count(term.replacement) < 2
            || count(term.replacement) > 80 || term.replacement !== term.replacement.trim()
            || /[\r\n]/u.test(term.replacement) || forbidden.test(term.replacement) || invalidUnicode.test(term.replacement)
            || (term.reading !== undefined && term.reading !== true)
            || (term.match !== undefined && term.match !== "capitalised")) {
            throw new PseudonymisationError("invalid_mapping");
        }
        entities.add(term.entity_id);
        const replacementKey = key(term.replacement);
        if (replacements.has(replacementKey))
            throw new PseudonymisationError("ambiguous_mapping");
        replacements.set(replacementKey, term.entity_id);
        const distinct = new Map();
        for (const alias of term.aliases) {
            if (alias !== alias.trim() || count(alias) < 2 || count(alias) > 300 || forbidden.test(alias) || invalidUnicode.test(alias)) {
                throw new PseudonymisationError("invalid_mapping");
            }
            const aliasKey = key(alias);
            const existing = aliases.get(aliasKey);
            if (existing && existing !== term.entity_id)
                throw new PseudonymisationError("ambiguous_mapping");
            aliases.set(aliasKey, term.entity_id);
            // Store canonical composed strings. Source normalization is mapped below.
            distinct.set(aliasKey, alias.normalize("NFC"));
        }
        canonical.push({ ...term, aliases: [...distinct.values()].sort(), replacement: term.replacement.normalize("NFC") });
    }
    return canonical.sort((a, b) => a.entity_id.localeCompare(b.entity_id, "en"));
}
/** Normalise graphemes for matching while preserving exact original offsets. */
function matchView(text) {
    const segments = new Intl.Segmenter("und", { granularity: "grapheme" }).segment(text);
    let normalized = "";
    const boundaries = new Map();
    boundaries.set(0, 0);
    for (const segment of segments) {
        boundaries.set(normalized.length, segment.index);
        normalized += segment.segment.normalize("NFC");
        boundaries.set(normalized.length, segment.index + segment.segment.length);
    }
    const codepoints = new Uint32Array(text.length + 1);
    let position = 0, points = 0;
    for (const character of text) {
        codepoints[position] = points++;
        position += character.length;
        codepoints[position] = points;
    }
    return { normalized, boundaries, codepoints };
}
/**
 * Replaces only reviewed registered aliases. Unknown identifying information is
 * deliberately not guessed away: the entire derivative still needs review.
 * Matches of different identities that cross fail closed; a match inside a
 * longer one is covered by it.
 */
function transformTextCore(text, terms) {
    return compileTextTransformation(terms)(text);
}
/** Compile once for a selected multi-document packet; no global private cache. */
function compileTextTransformation(terms) {
    const canonical = validateTerms(terms);
    const mapJson = JSON.stringify(canonical);
    const patterns = canonical.flatMap(term => term.aliases.map(alias => ({ term, pattern: expression(alias, term.match) })));
    // A reading replaces a damaged word with the ordinary word it was reviewed to be;
    // that word elsewhere in the text is the same word, not another identity.
    const replacementPatterns = canonical.filter(term => !term.reading).map(term => expression(term.replacement));
    for (const term of canonical)
        for (const { pattern } of patterns) {
            pattern.lastIndex = 0;
            if (pattern.test(term.replacement))
                throw new PseudonymisationError("remaining_registered_term");
            pattern.lastIndex = 0;
        }
    return (text) => transformText(text, mapJson, patterns, replacementPatterns);
}
function transformText(text, mapJson, patterns, replacementPatterns) {
    if (byteLength(text) > 200_000)
        throw new PseudonymisationError("text_too_large");
    if (forbidden.test(text) || invalidUnicode.test(text)) {
        throw new PseudonymisationError("unsafe_text");
    }
    const view = matchView(text);
    // A pre-existing neutral label may denote someone else. Never silently
    // merge it with a registered identity, including in another packet section.
    for (const pattern of replacementPatterns) {
        pattern.lastIndex = 0;
        if (pattern.test(view.normalized)) throw new PseudonymisationError("ambiguous_mapping");
        pattern.lastIndex = 0;
    }
    const candidates = [];
    for (const { term, pattern } of patterns) {
        pattern.lastIndex = 0;
        for (const match of view.normalized.matchAll(pattern)) {
            const start = view.boundaries.get(match.index);
            const end = view.boundaries.get(match.index + match[0].length);
            if (start === undefined || end === undefined)
                throw new PseudonymisationError("unsafe_text");
            candidates.push({ start, end, term });
            if (candidates.length > 20_000)
                throw new PseudonymisationError("text_too_large");
        }
    }
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    const hits = [];
    for (const next of candidates) {
        const previous = hits.at(-1);
        if (previous && next.start < previous.end) {
            // Two matches that cross ("Anna Keller" and "Keller Bau") are ambiguous. A match
            // inside a longer one ("Herrmann" in "Moser Herrmann") is covered by it: every
            // character of both is replaced, under the longer one's identity. Two aliases of
            // the same identity that cross ("M. F." and "F. Mercier") are replaced together.
            if (next.end > previous.end) {
                if (next.term.entity_id !== previous.term.entity_id)
                    throw new PseudonymisationError("ambiguous_occurrence");
                previous.end = next.end;
            }
            continue;
        }
        hits.push(next);
    }
    let derivative = "";
    let cursor = 0;
    let derivativePoints = 0;
    const spans = [];
    for (const hit of hits) {
        derivative += text.slice(cursor, hit.start);
        derivativePoints += view.codepoints[hit.start] - view.codepoints[cursor];
        const start = derivativePoints;
        derivative += hit.term.replacement;
        derivativePoints += count(hit.term.replacement);
        spans.push({ entity_id: hit.term.entity_id, original_start: view.codepoints[hit.start],
            original_end: view.codepoints[hit.end], derivative_start: start, derivative_end: derivativePoints,
            original: text.slice(hit.start, hit.end), replacement: hit.term.replacement });
        cursor = hit.end;
    }
    derivative += text.slice(cursor);
    const after = derivative.normalize("NFC");
    for (const { pattern } of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(after))
            throw new PseudonymisationError("remaining_registered_term");
        pattern.lastIndex = 0;
    }
    return { text: derivative, original_text: text, map_json: mapJson,
        spans, requires_human_review: true, external_eligible: false };
}
/** Maps a derivative quote to its original span. Never calls changed wording verbatim. */
function resolveDerivativeSpan(result, start, end) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > count(result.text)) {
        return null;
    }
    let startDelta = 0;
    let endDelta = 0;
    let originalStart = start;
    let originalEnd = end;
    let transformed = false;
    for (const span of result.spans) {
        const delta = (span.original_end - span.original_start) - (span.derivative_end - span.derivative_start);
        if (span.derivative_end <= start)
            startDelta += delta;
        if (span.derivative_end <= end)
            endDelta += delta;
        if (span.derivative_start < end && span.derivative_end > start) {
            transformed = true;
            if (start > span.derivative_start)
                originalStart = span.derivative_start;
            if (end < span.derivative_end)
                originalEnd = span.derivative_end;
        }
    }
    // A quote cutting a replacement word must expand to the entire original term.
    const intersectingStart = result.spans.find(s => s.derivative_start <= start && s.derivative_end > start);
    const intersectingEnd = result.spans.find(s => s.derivative_start < end && s.derivative_end >= end);
    return {
        original_start: intersectingStart ? intersectingStart.original_start : originalStart + startDelta,
        original_end: intersectingEnd ? intersectingEnd.original_end : originalEnd + endDelta,
        wording: transformed ? "pseudonymised_derivative" : "original_verbatim",
    };
}
class ExportProjectionError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
exports.ExportProjectionError = ExportProjectionError;
/** Explicitly selected text only: no implicit history, filename or memory. */
function buildProjectionCore(question, selected, terms) {
    if (!question.trim() || byteLength(question) > 2000 || !selected.length || selected.length > 40
        || !selected.some(s => s.kind === "source") || new Set(selected.map(s => s.original_key)).size !== selected.length
        || selected.some(s => !s.original_key || !s.text.trim() || !["source", "working_note", "conversation_excerpt"].includes(s.kind))) {
        throw new ExportProjectionError("export_invalid_selection");
    }
    if (byteLength(question) + selected.reduce((n, s) => n + byteLength(s.text), 0) > 200_000) {
        throw new ExportProjectionError("export_too_large");
    }
    const transform = compileTextTransformation(terms);
    const transformedQuestion = transform(question);
    const privateSections = selected.map((s, i) => ({ id: `S${i + 1}`, original_key: s.original_key, transformation: transform(s.text) }));
    const sections = privateSections.map((s, i) => ({ id: s.id, kind: selected[i].kind, text: s.transformation.text }));
    const outbound = { question: transformedQuestion.text, sections };
    const outbound_json = JSON.stringify(outbound);
    // The cap includes JSON escaping and question, not just document text. Nothing is truncated.
    if (byteLength(outbound_json) > 12000)
        throw new ExportProjectionError("export_too_large");
    return { ...outbound, outbound_json, map_json: transformedQuestion.map_json, private_question: transformedQuestion, private_sections: privateSections, requires_human_review: true };
}
const sourceRoles = new Set(["submission", "claim", "response", "exhibit", "authority", "literature", "other"]);
const hashes = /^[a-f0-9]{64}$/;
const privateKey = (value) => typeof value === "string" && value.trim().length > 0 && byteLength(value) <= 1024
    && !forbidden.test(value) && !invalidUnicode.test(value);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const invalidSelection = () => { throw new ExportProjectionError("export_invalid_selection"); };
/** Explicit V2 packet. Private source lineage is never part of neutral handles. */
function buildProjectionV2Core(question, selected, terms) {
    if (typeof question !== "string" || !question.trim() || byteLength(question) > 2000 || !Array.isArray(selected)
        || selected.length < 1 || selected.length > 40 || !selected.some(s => s?.kind === "source")) invalidSelection();
    const keys = new Set(), documents = new Map(), parties = new Map();
    let textBytes = byteLength(question);
    const sectionsMetadata = selected.map(item => {
        if (!record(item) || !privateKey(item.original_key) || keys.has(item.original_key)
            || typeof item.text !== "string" || !item.text.trim()) invalidSelection();
        keys.add(item.original_key); textBytes += byteLength(item.text);
        if (textBytes > 200_000) throw new ExportProjectionError("export_too_large");
        if (item.kind === "source") {
            const s = item.source;
            if (!record(s) || !privateKey(s.document_key) || !privateKey(s.version_key)
                || !hashes.test(s.file_sha256) || !hashes.test(s.page_sha256)
                || (s.party_key !== null && !privateKey(s.party_key)) || !sourceRoles.has(s.role)
                || !Number.isSafeInteger(s.page) || s.page < 1 || s.page > 100_000
                || !Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || s.start < 0
                || s.end <= s.start || s.end - s.start !== count(item.text)
                || !["browser-pdfjs-text-v1", "server-readPdfPages-v1", "browser-pdfjs-tesseract-v1"].includes(s.extractor)) invalidSelection();
            let document = documents.get(s.document_key);
            if (!document) {
                document = { id: `D${documents.size + 1}`, party: s.party_key, role: s.role, versions: new Map() };
                documents.set(s.document_key, document);
            }
            // Conflicting attribution cannot be hidden behind one neutral handle.
            if (document.party !== s.party_key || document.role !== s.role) invalidSelection();
            let version = document.versions.get(s.version_key);
            if (!version) {
                version = { id: `V${document.versions.size + 1}`, hash: s.file_sha256, extractor: s.extractor, pages: new Map() };
                document.versions.set(s.version_key, version);
            }
            if (version.hash !== s.file_sha256 || version.extractor !== s.extractor
                || (version.pages.has(s.page) && version.pages.get(s.page) !== s.page_sha256)) invalidSelection();
            version.pages.set(s.page, s.page_sha256);
            if (s.party_key !== null && !parties.has(s.party_key)) parties.set(s.party_key, `P${parties.size + 1}`);
            const source = { document_key: s.document_key, version_key: s.version_key, file_sha256: s.file_sha256,
                party_key: s.party_key, role: s.role, page: s.page, page_sha256: s.page_sha256,
                start: s.start, end: s.end, extractor: s.extractor };
            return { private: { kind: "source", source }, neutral: { kind: "source", source: {
                document: document.id, version: version.id, party: s.party_key === null ? null : parties.get(s.party_key),
                role: s.role, page: s.page,
            } } };
        }
        const a = item.attribution;
        if (!record(a)) invalidSelection();
        if (item.kind === "working_note" && ["party", "user", "model"].includes(a.author)
            && ["open", "proposed", "adopted", "disputed", "superseded"].includes(a.status)) {
            const value = { kind: "working_note", attribution: { author: a.author, status: a.status } };
            return { private: value, neutral: value };
        }
        if (item.kind === "conversation_excerpt" && ["user", "assistant"].includes(a.speaker)
            && ["question", "source_bound", "unverified"].includes(a.status)) {
            const value = { kind: "conversation_excerpt", attribution: { speaker: a.speaker, status: a.status } };
            return { private: value, neutral: value };
        }
        invalidSelection();
    });
    const transform = compileTextTransformation(terms), transformedQuestion = transform(question);
    const privateSections = selected.map((s, i) => ({ id: `S${i + 1}`, original_key: s.original_key,
        ...sectionsMetadata[i].private, transformation: transform(s.text) }));
    const sections = privateSections.map((s, i) => ({ id: s.id, ...sectionsMetadata[i].neutral, text: s.transformation.text }));
    const outbound = { version: 2, question: transformedQuestion.text, sections };
    const outbound_json = JSON.stringify(outbound);
    // V2 preserves the prototype admission bound. No source is silently dropped.
    if (byteLength(outbound_json) > 12000) throw new ExportProjectionError("export_too_large");
    return { ...outbound, outbound_json, map_json: transformedQuestion.map_json,
        private_question: transformedQuestion, private_sections: privateSections, requires_human_review: true };
}
/** Human-readable derivative only; trusted approvals are never Markdown fields. */
function projectionMarkdown(projection) {
    const lines = ["# Reviewed-text candidate", "", "## Question", "", projection.question];
    for (const section of projection.sections) {
        lines.push("", `## ${section.id} · ${section.kind}`);
        if (section.source) lines.push("", `${section.source.document} · ${section.source.version} · ${section.source.party ?? "unassigned"} · ${section.source.role} · page ${section.source.page}`);
        if (section.attribution) lines.push("", `${section.attribution.author ?? section.attribution.speaker} · ${section.attribution.status}`);
        lines.push("", section.text);
    }
    return lines.join("\n") + "\n";
}
class ProjectionAnswerBindingError extends Error {
    code;
    constructor(code) { super(code); this.code = code; }
}
exports.ProjectionAnswerBindingError = ProjectionAnswerBindingError;
const bindingFail = (code) => { throw new ProjectionAnswerBindingError(code); };
function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
}
function sameJson(one, two) {
    try { return canonicalJson(one) === canonicalJson(two); } catch { return false; }
}
function exactKeys(value, allowed) {
    return record(value) && Object.keys(value).every(key => allowed.includes(key));
}
function answerSchema(value, version = 2) {
    let size;
    try { size = byteLength(JSON.stringify(value)); } catch { bindingFail("answer_schema"); }
    if (size > (version === 3 ? 1_000_000 : 128_000) || !exactKeys(value, ["claims"]) || !Array.isArray(value.claims)
        || value.claims.length < (version === 3 ? 0 : 1) || value.claims.length > (version === 3 ? 512 : 64)) bindingFail("answer_schema");
    const citation = (item) => exactKeys(item, ["section_id", "exact_quote"])
        && typeof item.section_id === "string" && /^S[1-9][0-9]{0,2}$/.test(item.section_id)
        && typeof item.exact_quote === "string" && item.exact_quote.trim().length > 0
        && (version === 3 ? count(item.exact_quote) <= 8000 : byteLength(item.exact_quote) <= 12_000) && !forbidden.test(item.exact_quote) && !invalidUnicode.test(item.exact_quote);
    for (const claim of value.claims) {
        if (!exactKeys(claim, ["text", "citations", "context_references", ...(version === 3 ? ["id"] : [])]) || (version === 3 && (typeof claim.id !== "string" || !/^C[1-9][0-9]{0,3}$/.test(claim.id))) || typeof claim.text !== "string"
            || !claim.text.trim() || count(claim.text) > 4000 || forbidden.test(claim.text) || invalidUnicode.test(claim.text)
            || !Array.isArray(claim.citations) || claim.citations.length < 1 || claim.citations.length > 8
            || !claim.citations.every(citation)
            || (claim.context_references !== undefined && (!Array.isArray(claim.context_references)
                || claim.context_references.length > 8 || !claim.context_references.every(citation)))) bindingFail("answer_schema");
    }
    if (version === 3 && new Set(value.claims.map(claim => claim.id)).size !== value.claims.length) bindingFail("answer_schema");
    return value;
}
/**
 * Rebuilds selected derivatives and private maps before binding a structured
 * answer. Does not read files, authenticate source hashes or assess entailment.
 * Platform adapters must complete ALL hash_checks before exposing result.
 */
function prepareProjectionV2AnswerBinding(input) { return prepareProjectionAnswerBinding(input, 2); }
function prepareProjectionV3AnswerBinding(input) { return prepareProjectionAnswerBinding(input, 3); }
exports.prepareProjectionV3AnswerBinding = prepareProjectionV3AnswerBinding;
function prepareProjectionAnswerBinding(input, version) {
    const expected = input?.expected, current = input?.current;
    if (!record(expected) || !record(current) || !privateKey(expected.matterId)
        || !Number.isSafeInteger(expected.matterRevision) || expected.matterRevision < 1
        || current.matterId !== expected.matterId || current.matterRevision !== expected.matterRevision) bindingFail("stale_state");
    const projection = input.projection;
    if (!record(projection) || projection.version !== version || !hashes.test(expected.outboundSha256) || !hashes.test(expected.mapSha256)
        || projection.outbound_sha256 !== expected.outboundSha256 || projection.map_sha256 !== expected.mapSha256) bindingFail("projection_changed");
    let core;
    try { core = version === 3 ? exports.buildProjectionV3Core(input.preparation_input, input.decisions) : buildProjectionV2Core(input.question, input.selected, input.terms); }
    catch { bindingFail("private_mapping_changed"); }
    if (projection.outbound_json !== core.outbound_json || projection.question !== core.question
        || !sameJson(projection.sections, core.sections) || (version === 3 && (!sameJson(projection.parties, core.parties) || !sameJson(projection.coverage, core.coverage)))) bindingFail("projection_changed");
    if (!exactKeys(projection, ["version", "question", "sections", "outbound_json", "outbound_sha256", "map_sha256", "private_question", "private_sections", "requires_human_review", ...(version === 3 ? ["parties", "coverage", "private_occurrences"] : [])])
        || projection.requires_human_review !== true || !Array.isArray(projection.private_sections)
        || projection.private_sections.length !== core.private_sections.length || (version === 3 && !sameJson(projection.private_occurrences, core.private_occurrences))) bindingFail("private_mapping_changed");
    const hash_checks = [{ text: core.outbound_json, sha256: expected.outboundSha256 }, { text: core.map_json, sha256: expected.mapSha256 }];
    function validateTransformation(candidate, rebuilt) {
        if (!exactKeys(candidate, ["text", "original_sha256", "derivative_sha256", "map_sha256", "spans", "requires_human_review", "external_eligible"])
            || candidate.text !== rebuilt.text || candidate.requires_human_review !== true || candidate.external_eligible !== false
            || !sameJson(candidate.spans, rebuilt.spans) || candidate.map_sha256 !== expected.mapSha256
            || !hashes.test(candidate.original_sha256) || !hashes.test(candidate.derivative_sha256)) bindingFail("private_mapping_changed");
        hash_checks.push({ text: rebuilt.original_text, sha256: candidate.original_sha256 }, { text: rebuilt.text, sha256: candidate.derivative_sha256 });
    }
    validateTransformation(projection.private_question, core.private_question);
    core.private_sections.forEach((section, index) => {
        const candidate = projection.private_sections[index];
        if (!record(candidate) || !sameJson({ ...candidate, transformation: null }, { ...section, transformation: null })) bindingFail("private_mapping_changed");
        validateTransformation(candidate.transformation, section.transformation);
    });
    if (version === 3) for (const document of input.preparation_input.documents) for (const page of document.pages) hash_checks.push({ text: page.text, sha256: page.page_sha256 });
    const answer = answerSchema(input.answer, version);
    function bind(citation, contextOnly) {
        const section = core.sections.find(s => s.id === citation.section_id);
        if (!section) bindingFail("missing_section");
        if (!contextOnly && section.kind !== "source") bindingFail("non_source_citation");
        if (contextOnly && section.kind === "source") bindingFail("source_in_context");
        const startUtf16 = section.text.indexOf(citation.exact_quote);
        if (startUtf16 < 0) bindingFail("quote_absent");
        if (section.text.indexOf(citation.exact_quote, startUtf16 + 1) !== -1) bindingFail("quote_ambiguous");
        const start = count(section.text.slice(0, startUtf16)), end = start + count(citation.exact_quote);
        if (contextOnly) return { section_id: section.id, kind: section.kind, derivative_quote: citation.exact_quote,
            derivative_start: start, derivative_end: end, attribution: { ...section.attribution }, source_match: "exact", use: "context_only" };
        const privateSection = core.private_sections.find(s => s.id === section.id);
        const span = resolveDerivativeSpan(privateSection.transformation, start, end);
        if (!span || span.original_start < 0 || span.original_end > count(privateSection.transformation.original_text)
            || span.original_end <= span.original_start) bindingFail("private_mapping_changed");
        const source = privateSection.source;
        const originalQuote = Array.from(privateSection.transformation.original_text).slice(span.original_start, span.original_end).join("");
        return { section_id: section.id, kind: "source", derivative_quote: citation.exact_quote, derivative_start: start, derivative_end: end,
            wording: span.wording, source_match: "exact", original_bytes_revalidated: false,
            original: source.format === "public_decision" ? { format: "public_decision", document_key: source.document_key, version_key: source.version_key,
                start: source.start + span.original_start, end: source.start + span.original_end, quote: originalQuote,
                original_authority: { ...source.original_authority, start: source.start + span.original_start, end: source.start + span.original_end } }
              : { ...(version === 3 ? { format: "pdf" } : {}), document_key: source.document_key, version_key: source.version_key, file_sha256: source.file_sha256,
                page: source.page, page_sha256: source.page_sha256, extractor: source.extractor,
                start: source.start + span.original_start, end: source.start + span.original_end, quote: originalQuote } };
    }
    const result = { version: 1, projection_version: version, matter_id: expected.matterId, matter_revision: expected.matterRevision,
        outbound_sha256: expected.outboundSha256, map_sha256: expected.mapSha256, original_bytes_revalidated: false,
        claims: answer.claims.map(claim => ({ ...(version === 3 ? { id: claim.id } : {}), text: claim.text, citations: claim.citations.map(citation => bind(citation, false)),
            context_references: (claim.context_references ?? []).map(citation => bind(citation, true)), semantic_status: "ai_draft_requires_review" })) };
    return { result, hash_checks, requires_hash_validation: true };
}
Object.assign(exports, require("./preparation.js")({ExportProjectionError,record,byteLength,count,privateKey,hashes,sourceRoles,validateTerms,key,expression,matchView,forbidden,invalidUnicode}));
