import { describe, expect, it } from "vitest";
import { librarySourcePath, librarySourceUrl, parseLibrarySourcePath } from "./sourceLinks";

const documentId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const path = `/sources/library/${documentId}/${versionId}?page=7`;
describe("durable source references", () => {
    it("binds a plain same-origin URL to the exact document, version and PDF page", () => {
        expect(librarySourcePath(documentId, versionId, 7)).toBe(path);
        expect(parseLibrarySourcePath(path)).toEqual({ documentId, versionId, page: 7 });
        expect(librarySourceUrl("https://sandbox.swisslaw.io", documentId, versionId, 7)).toBe(`https://sandbox.swisslaw.io${path}`);
    });
    it.each([0, -1, 1.5, Infinity, 100000])("rejects an invalid page %s", page => {
        expect(librarySourcePath(documentId, versionId, page)).toBeNull();
    });
    it.each(["", "../secret", "https://other.example", "11111111-1111-1111-1111-11111111111/"])("rejects invalid identities %s", id => {
        expect(librarySourcePath(id, versionId, 1)).toBeNull();
        expect(librarySourcePath(documentId, id, 1)).toBeNull();
    });
    it.each([`${path}&url=https://evil.example`, `${path}#private-text`, `${path}&page=2`, path.replace("?page=7", "?page=07"), `https://evil.example${path}`, `${path}\n`])("does not accept extra data or redirects %s", value => {
        expect(parseLibrarySourcePath(value)).toBeNull();
    });
    it.each(["javascript:alert(1)", "https://user:password@example.org", "https://sandbox.swisslaw.io/extra", "https://sandbox.swisslaw.io?token=x", "not a url"])("rejects an unsafe origin %s", origin => {
        expect(librarySourceUrl(origin, documentId, versionId, 7)).toBeNull();
    });
    it("returns null when the underlying source path itself is invalid", () => {
        expect(librarySourceUrl("https://sandbox.swisslaw.io", "not-a-uuid", versionId, 7)).toBeNull();
    });
});

import { originalTextSearchUrl, selectedSourcePassage } from "./sourceLinks";
function rangeSelection(text: string, from: number, to: number) {
    const element = document.createElement("pre"); element.textContent = text;
    document.body.append(element);
    const range = document.createRange(); range.setStart(element.firstChild!, from); range.setEnd(element.firstChild!, to);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const passage = { start: 500, end: 500 + Array.from(text).length, total_chars: 2000, text };
    return { element, selection, passage };
}
describe("explicit public excerpt selection", () => {
    it("preserves the literal text and Unicode positions after supplementary characters", () => {
        const phrase = "Der genaue Wortlaut steht hier.";
        const prefix = "😀 Kontext. ";
        const value = rangeSelection(prefix + phrase + " Nachtext.", prefix.length, prefix.length + phrase.length);
        expect(selectedSourcePassage(value.element, value.selection, value.passage)).toEqual({
            start: 500 + Array.from(prefix).length, end: 500 + Array.from(prefix + phrase).length, total_chars: 2000, text: phrase,
        });
        value.element.remove();
    });
    it("trims only boundary whitespace and adjusts the precise start position", () => {
        const value = rangeSelection("\n  Ein unveränderter genauer Wortlaut.  \n", 0, 40);
        expect(selectedSourcePassage(value.element, value.selection, value.passage)).toMatchObject({ start: 503, text: "Ein unveränderter genauer Wortlaut." });
        value.element.remove();
    });
    it.each(["Zu kurz.", "x".repeat(801)])("rejects selections outside the 20–800-character bounds", text => {
        const value = rangeSelection(text, 0, text.length);
        expect(selectedSourcePassage(value.element, value.selection, value.passage)).toBeNull(); value.element.remove();
    });
    it("rejects an unrelated page selection and inconsistent source offsets", () => {
        const value = rangeSelection("Ein unveränderter genauer Wortlaut.", 0, 35);
        const other = document.createElement("pre"); other.textContent = value.passage.text;
        expect(selectedSourcePassage(other, value.selection, value.passage)).toBeNull();
        expect(selectedSourcePassage(value.element, value.selection, { ...value.passage, end: 502 })).toBeNull();
        expect(selectedSourcePassage(value.element, null, value.passage)).toBeNull(); value.element.remove();
    });
    it("rejects a selection boundary that splits a supplementary character's surrogate pair", () => {
        // Starting mid-emoji makes the DOM Range slice code units, not code
        // points, so the reconstructed text silently diverges from what the
        // codepoint-counted offset would read back from the passage.
        const text = "😀 Ein ausreichend langer Testtext fuer die zwanzig-Zeichen-Grenze.";
        const element = document.createElement("pre"); element.textContent = text;
        document.body.append(element);
        const range = document.createRange();
        range.setStart(element.firstChild!, 1); // between the emoji's two surrogate code units
        range.setEnd(element.firstChild!, 31);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        const passage = { start: 500, end: 500 + Array.from(text).length, total_chars: 2000, text };
        expect(selectedSourcePassage(element, selection, passage)).toBeNull();
        element.remove();
    });
});
describe("unverified browser search at original sources", () => {
    const text = "Ein unveränderter, genauer Wortlaut - mit Zusatz.";
    it("preserves an existing anchor and safely encodes the exact public quotation", () => {
        const url = new URL(originalTextSearchUrl("https://example.org/source#page197", null, text)!);
        expect(url.origin).toBe("https://example.org");
        expect(url.hash).toBe("#page197:~:text=" + encodeURIComponent(text).replace(/-/g, "%2D"));
        expect(url.search).toBe(""); // Quoted material is not sent in a server request.
    });
    it.each([null, "javascript:alert(1)", "data:text/html,x", "https://secret@example.org", "https://example.org/source.PDF"])("does not invent a text jump for unsafe or PDF sources %s", url => {
        expect(originalTextSearchUrl(url, null, text)).toBeNull();
    });
    it("rejects a known PDF URL even when its pathname has no file extension", () => {
        expect(originalTextSearchUrl("https://example.org/download?id=1", "https://example.org/download?id=1", text)).toBeNull();
    });
    it("rejects a source URL that cannot be parsed", () => {
        expect(originalTextSearchUrl("not a valid url", null, text)).toBeNull();
    });
});
