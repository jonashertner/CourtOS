import { describe, expect, it } from "vitest";
import { conversationSourceIssue, conversationSourcesFromHistory, emptyConversationSources, snapshotConversationSources } from "./researchConversation";
describe("research source boundary", () => {
    it("requires originals and saved versions, not source-shaped free text", () => {
        expect(conversationSourceIssue({ files: [], public_sources: [] })).toBe("empty");
        expect(conversationSourceIssue({ files: [{ filename: "Quelle.pdf" }], public_sources: [] })).toBe("unready");
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "BGE_137_I_195", start: 5, end: 25, content_hash: null }] })).toBeNull();
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "../../private", start: 5, end: 25, content_hash: null }] })).toBe("unready");
    });
    it("rejects more than five private files or more than three public sources", () => {
        const files = Array.from({ length: 6 }, (_, index) => ({ filename: `Quelle-${index}.pdf` }));
        expect(conversationSourceIssue({ files, public_sources: [] })).toBe("many");
        const publicSources = Array.from({ length: 4 }, () => ({ decision_id: "BGE_137_I_195", start: 5, end: 25, content_hash: null }));
        expect(conversationSourceIssue({ files: [], public_sources: publicSources })).toBe("many");
    });
    it("rejects an empty or an oversized content hash but accepts a short one", () => {
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "BGE_137_I_195", start: 5, end: 25, content_hash: "" }] })).toBe("unready");
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "BGE_137_I_195", start: 5, end: 25, content_hash: "a".repeat(201) }] })).toBe("unready");
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "BGE_137_I_195", start: 5, end: 25, content_hash: "a".repeat(64) }] })).toBeNull();
    });
    it("flags each missing or mismatched identity independently", () => {
        const uuidFile = { filename: "Quelle.pdf", document_id: "11111111-1111-4111-8111-111111111111", version_id: "22222222-2222-4222-8222-222222222222" };
        expect(conversationSourceIssue({ files: [uuidFile], public_sources: [] })).toBeNull();
        expect(conversationSourceIssue({ files: [{ ...uuidFile, version_id: undefined }], public_sources: [] })).toBe("unready");
        expect(conversationSourceIssue({ files: [{ ...uuidFile, filename: "Quelle.docx" }], public_sources: [] })).toBe("unready");
    });
    it("takes only the last user's explicit source selection, not old attachments", () => {
        expect(conversationSourcesFromHistory([{ role: "user", content: "old", files: [{ filename: "old.pdf" }] }, { role: "assistant", content: "answer" }, { role: "user", content: "new" }])).toEqual({ files: [], public_sources: [] });
    });
    it("starts from an explicitly empty source selection", () => {
        expect(emptyConversationSources()).toEqual({ files: [], public_sources: [] });
    });
    it("copies descriptors without quote/title/URL authority or mutable references", () => {
        const file = { filename: "Quelle.pdf", document_id: "doc-a", version_id: "version-a", version_number: 1 };
        const selected = { decision_id: "CH_CASE", start: 0, end: 40, content_hash: null, quote: "UNTRUSTED" };
        const snapshot = snapshotConversationSources({ files: [file], public_sources: [selected] }); selected.end = 50; file.version_number = 2;
        expect(snapshot.files).toEqual([{ filename: "Quelle.pdf", document_id: "doc-a", version_id: "version-a", version_number: 1 }]);
        expect(snapshot.public_sources).toEqual([{ decision_id: "CH_CASE", start: 0, end: 40, content_hash: null }]);
    });
});
