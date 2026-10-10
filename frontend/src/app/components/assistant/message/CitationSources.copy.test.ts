import { describe, expect, it } from "vitest";
import type { DocumentCitation } from "../../shared/types";
import { buildCitationAppendix } from "./CitationSources";
const document_id = "00000000-0000-0000-0000-000000000001";
const version_id = "00000000-0000-0000-0000-000000000002";
const checkedQuote = (page: number | string, quote: string, pages: number[]) => ({page, quote, verification: {verified: true, version_id, pdf_sha256: "a".repeat(64), page_hashes: pages.map(page => ({page, sha256: "b".repeat(64)}))}});
const citation: DocumentCitation = { type: "citation_data", ref: 1, doc_id: "doc1", document_id, version_id, version_number: 3, filename: "Klage <A>.pdf", page: 2, quote: "Betrag: CHF 1 250.", verified: true, quotes: [checkedQuote(2, "Betrag: CHF 1 250.", [2])] };
describe("copied source provenance", () => {
    it("retains version, page and an authenticated durable link in both copy formats", () => {
        const result = buildCitationAppendix([citation, { ...citation, ref: 2 }], "https://sandbox.swisslaw.io");
        expect(result.text).toContain("Version 3, Page 2");
        expect(result.text).toContain(`/sources/library/${document_id}/${version_id}?page=2`);
        expect(result.text).not.toContain("Id.");
        expect(result.html).toContain("Klage &lt;A&gt;.pdf");
        expect(result.html).toContain('href="https://sandbox.swisslaw.io/sources/library/');
    });
    it("does not invent a version or page link for unconfirmed or unversioned quotations", () => {
        for (const value of [{ ...citation, verified: false }, { ...citation, version_id: null }, { ...citation, page: "Appendix", quotes: undefined }]) {
            expect(buildCitationAppendix([value], "https://sandbox.swisslaw.io").text).not.toContain("https://");
        }
        expect(buildCitationAppendix([{ ...citation, verified: false }]).text).toContain("Zitat nicht bestätigt");
    });
    it("retains each page of a supported multipage quotation", () => {
        const result = buildCitationAppendix([{ ...citation, quotes: [checkedQuote(2, "A", [2]), checkedQuote(3, "B", [3])] }], "https://sandbox.swisslaw.io");
        expect(result.text).toContain("?page=2");
        expect(result.text).toContain("?page=3");
    });
    it("links both verified pages of a single cross-page quotation", () => {
        const result = buildCitationAppendix([{ ...citation, page: "2-3", quote: "A [[PAGE_BREAK]] B",
            quotes: [checkedQuote("2-3", "A [[PAGE_BREAK]] B", [2,3])] }], "https://sandbox.swisslaw.io");
        for (const value of [result.text, result.html]) {
            expect(value).toContain("?page=2");
            expect(value).toContain("?page=3");
            expect(value).not.toContain("?page=4");
        }
    });
    it.each(["0-2", "3-2", "2-5", "2.5", "2-999999999"])("does not manufacture links for invalid or unbounded page ranges (%s)", (page) => {
        expect(buildCitationAppendix([{ ...citation, page, quotes: [checkedQuote(page, "A", [2])] }], "https://sandbox.swisslaw.io").text).not.toContain("https://");
    });
});
