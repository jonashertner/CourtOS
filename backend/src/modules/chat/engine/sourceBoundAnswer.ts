/** A syntactic coverage gate, deliberately not an entailment or truth claim.
 * Every prose paragraph and every list/table row needs a verified reference.
 * Headings, code, links and an uncited concluding question get no exemption. */
export function hasUncitedProse(text: string, verifiedRefs: ReadonlySet<number>): boolean {
  const blocks = text.trim().split(/\n\s*\n|\n(?=\s*(?:[-*+]\s|\d+[.)]\s|\|))/u).map(block => block.trim()).filter(Boolean);
  if (!blocks.length || /```|~~~|<[^>]+>|\]\([^)]*\)/u.test(text)) return true;
  return blocks.some(block => {
    const refs = [...block.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1]));
    return !refs.length || refs.some(ref => !verifiedRefs.has(ref));
  });
}
export const SOURCE_BOUND_ANSWER_RULES = `Answer only from the freshly supplied original sources. The application-loaded evidence already satisfies the source-read requirement; do not repeat a full-document tool call merely to satisfy a generic read instruction. User allegations, previous conversation and your model memory are not evidence. Do not supply external legal knowledge. Write at most three short plain paragraphs, at most 120 words total. Every paragraph (including uncertainty or a question) must contain a [n] citation to an exact quotation in a currently supplied source. No uncited headings, introduction or conclusion. Identify interpretation as provisional; quoted words do not prove an allegation, legal holding or applicability. If the selected sources do not support an answer, state that limited scope in one paragraph citing the source examined; do not invent missing facts. Put the exact short quotations in the required CITATIONS block. No arbitrary links or invented sources.`;
