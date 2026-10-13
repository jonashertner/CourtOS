// Decision citations in case documents or a Word draft, checked against
// OpenCaseLaw. Only the public reference (e.g. "bge_129_I_232") is looked up;
// no surrounding text leaves the computer. A missing hit is "not found in
// OpenCaseLaw", never "the citation is wrong".
import { findCitations, findLoose } from "./vendor/citecheck/parser.mjs";

const PART = { I: "I", IA: "Ia", IB: "Ib", II: "II", III: "III", IV: "IV", V: "V" };

/** OpenCaseLaw identifier for a parsed reference, or null when it cannot be derived. */
export function lookupId(parsed) {
  if (parsed.bge) return `bge_${parsed.bge.volume}_${PART[String(parsed.bge.part).toUpperCase()] ?? parsed.bge.part}_${parsed.bge.page}`;
  for (const docket of parsed.dockets) {
    const federal = /^(\d[A-Z]{1,2})[ _.](\d{1,5})\/(\d{4})$/.exec(docket);
    if (federal) return `bger_${federal[1]}_${federal[2]}_${federal[3]}`;
    const bvger = /^([A-Z]{1,2})-(\d{1,5})\/(\d{4})$/.exec(docket);
    if (bvger) return `bvger_${bvger[1]}-${bvger[2]}_${bvger[3]}`;
  }
  return null;
}

/** "3.2" appears as an Erwägung heading in the decision text. Heuristic. */
export function pinpointInText(text, pinpoint) {
  if (!pinpoint || !text) return null;
  const base = pinpoint.split("/")[0].replace(/[a-z]+$/i, "");
  if (!base) return null;
  const escaped = base.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*(?:E\\.\\s*|Erw\\.\\s*|consid\\.\\s*)?${escaped}\\.?(?:[a-z]{1,2})?\\s+\\S`, "m").test(text);
}

/**
 * @param {Array<{ref:any, text:string}>} paragraphs  any text units; ref is returned unchanged
 * @param {{decision:(id:string)=>Promise<any>, guard?:{check:(t:string)=>void}}} deps
 */
export async function checkCitations(paragraphs, { decision, guard = null, limit = 60 }) {
  const texts = paragraphs.map(p => p.text);
  const found = findCitations(texts);
  const loose = findLoose(texts, found);
  const cache = new Map();
  const results = [];
  for (const hit of found.slice(0, limit)) {
    const id = lookupId(hit.parsed);
    const base = { ref: paragraphs[hit.paragraph].ref, written: hit.text, start: hit.start, end: hit.end, pinpoint: hit.parsed.pinpoint, written_date: hit.parsed.date };
    if (!id) { results.push({ ...base, status: "not_checked", reason: "no_public_identifier" }); continue; }
    if (guard) guard.check(id);
    if (!cache.has(id)) cache.set(id, decision(id).catch(error => ({ error: error.code ?? "caselaw_unavailable" })));
    const value = await cache.get(id);
    if (value?.error) { results.push({ ...base, id, status: "not_checked", reason: value.error }); continue; }
    if (!value) { results.push({ ...base, id, status: "not_found" }); continue; }
    const dateMatches = hit.parsed.date && value.date && !value.date_is_estimated ? hit.parsed.date === value.date.slice(0, 10) : null;
    results.push({
      ...base, id: value.decision_id, status: dateMatches === false ? "date_differs" : "found",
      docket: value.docket, date: value.date, court: value.court, regeste: value.regeste?.slice(0, 300) ?? null,
      pinpoint_found: value.text_available ? pinpointInText(value.text, hit.parsed.pinpoint) : null,
      url: value.opencaselaw_url, source_url: value.source_url,
    });
  }
  const unchecked = loose.slice(0, 40).map(item => ({ ref: paragraphs[item.paragraph].ref, written: item.text, start: item.start, end: item.end, status: "not_checked", reason: item.collection ? "collection" : "unrecognised" }));
  return { results, unchecked, truncated: found.length > limit };
}
