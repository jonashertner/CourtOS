import { describe, expect, it } from "vitest";
import type { DocumentCitation } from "@/app/components/shared/types";
import { hasCheckedCitationLocation } from "./citationEvidence";

const proof = { verified: true, version_id: "v1", pdf_sha256: "a".repeat(64), page_hashes: [{ page: 2, sha256: "b".repeat(64) }] };
const citation: DocumentCitation = { type: "citation_data", document_id: "d", doc_id: "doc-0", ref: 1, filename: "Quelle.pdf", version_id: "v1", page: 2, quote: "Behauptung", verified: true, quotes: [{ page: 2, quote: "Behauptung", verification: proof }] };
describe("generated citation location evidence", () => {
    it("accepts the matching fixed PDF and page evidence", () => expect(hasCheckedCitationLocation(citation)).toBe(true));
    it.each([
        undefined,
        { verified: true },
        { ...proof, version_id: "different" },
        { ...proof, pdf_sha256: "invalid" },
        { ...proof, page_hashes: [{ page: 3, sha256: "b".repeat(64) }] },
        { ...proof, page_hashes: [{ page: 2, sha256: "invalid" }] },
        { ...proof, page_hashes: [] },
    ])("rejects missing, stale or different-page verification (%j)", verification => {
        expect(hasCheckedCitationLocation({ ...citation, quotes: [{ ...citation.quotes![0], verification }] })).toBe(false);
    });
    it("requires both pages of a cross-page quote", () => {
        const cross = { ...citation, quotes: [{ ...citation.quotes![0], page: "2-3" }] };
        expect(hasCheckedCitationLocation(cross)).toBe(false);
        expect(hasCheckedCitationLocation({ ...cross, quotes: [{...cross.quotes[0], verification: {...proof, page_hashes: [2,3].map(page => ({page, sha256: "b".repeat(64)}))}}] })).toBe(true);
    });
});
