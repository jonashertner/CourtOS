import { describe, expect, it } from "vitest";
import type { CaseCitation, DocumentCitation, PublicDecisionCitation } from "@/app/components/shared/types";
import { hasCheckedCitationLocation } from "./citationEvidence";

const proof = { verified: true, version_id: "v1", pdf_sha256: "a".repeat(64), page_hashes: [{ page: 2, sha256: "b".repeat(64) }] };
const citation: DocumentCitation = { type: "citation_data", document_id: "d", doc_id: "doc-0", ref: 1, filename: "Quelle.pdf", version_id: "v1", page: 2, quote: "Behauptung", verified: true, quotes: [{ page: 2, quote: "Behauptung", verification: proof }] };
describe("generated citation location evidence", () => {
    it("accepts the matching fixed PDF and page evidence", () => expect(hasCheckedCitationLocation(citation)).toBe(true));
    it("accepts a verified case citation without any PDF evidence", () => {
        const caseCitation: CaseCitation = { type: "citation_data", kind: "case", ref: 1, cluster_id: 1, verified: true, quotes: [] };
        expect(hasCheckedCitationLocation(caseCitation)).toBe(true);
    });
    it.each([
        undefined,
        { verified: true },
        { verified: true, version_id: "v1" },
        { ...proof, version_id: "different" },
        { ...proof, pdf_sha256: "invalid" },
        { ...proof, page_hashes: [{ page: 3, sha256: "b".repeat(64) }] },
        { ...proof, page_hashes: [{ page: 2, sha256: "invalid" }] },
        { ...proof, page_hashes: [] },
    ])("rejects missing, stale or different-page verification (%j)", verification => {
        expect(hasCheckedCitationLocation({ ...citation, quotes: [{ ...citation.quotes![0], verification }] })).toBe(false);
    });
    it("rejects a verified document citation with no version id or no quotes", () => {
        expect(hasCheckedCitationLocation({ ...citation, version_id: null })).toBe(false);
        expect(hasCheckedCitationLocation({ ...citation, quotes: [] })).toBe(false);
    });
    it("requires both pages of a cross-page quote", () => {
        const cross = { ...citation, quotes: [{ ...citation.quotes![0], page: "2-3" }] };
        expect(hasCheckedCitationLocation(cross)).toBe(false);
        expect(hasCheckedCitationLocation({ ...cross, quotes: [{...cross.quotes[0], verification: {...proof, page_hashes: [2,3].map(page => ({page, sha256: "b".repeat(64)}))}}] })).toBe(true);
    });
    it("rejects a quote whose page cannot be parsed", () => {
        expect(hasCheckedCitationLocation({ ...citation, quotes: [{ ...citation.quotes![0], page: "two" }] })).toBe(false);
    });
    it("rejects an out-of-range or reversed page span", () => {
        expect(hasCheckedCitationLocation({ ...citation, quotes: [{ ...citation.quotes![0], page: "0" }] })).toBe(false);
    });
});

describe("public decision citation location evidence", () => {
    const base: PublicDecisionCitation = {
        type: "citation_data", kind: "public_decision", ref: 1, decision_id: "BGE_137_I_195", title: "T",
        source_url: null, pdf_url: null, content_hash: null, start: 0, end: 5, quote: "abcde", verified: true,
    };
    it("accepts a verified public excerpt with matching unicode length and no fingerprint", () => {
        expect(hasCheckedCitationLocation(base)).toBe(true);
    });
    it("accepts a verified public excerpt whose fingerprint is present and well-formed", () => {
        expect(hasCheckedCitationLocation({ ...base, content_hash: "a".repeat(40) })).toBe(true);
    });
    it.each([
        { decision_id: 5 },
        { decision_id: "" },
        { decision_id: "bad\u0000id" },
        { start: 1.5 },
        { start: -1 },
        { end: 1.5 },
        { end: 0 },
        { quote: 5 },
        { quote: "   " },
        { quote: "a\uD800bcd" },
        { quote: "abcdef" },
        { content_hash: 5 },
        { content_hash: "" },
        { content_hash: "a".repeat(201) },
        { content_hash: "bad\u0000hash" },
    ])("rejects a malformed public excerpt location %j", (change) => {
        expect(hasCheckedCitationLocation({ ...base, ...change } as unknown as PublicDecisionCitation)).toBe(false);
    });
});
