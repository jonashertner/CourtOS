import { describe, expect, it } from "vitest";
import { conversationSourceIssue, conversationSourcesFromHistory, snapshotConversationSources } from "./researchConversation";
describe("research source boundary", () => {
    it("requires originals and saved versions, not source-shaped free text", () => {
        expect(conversationSourceIssue({ files: [], public_sources: [] })).toBe("empty");
        expect(conversationSourceIssue({ files: [{ filename: "Quelle.pdf" }], public_sources: [] })).toBe("unready");
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "BGE_137_I_195", start: 5, end: 25, content_hash: null }] })).toBeNull();
        expect(conversationSourceIssue({ files: [], public_sources: [{ decision_id: "../../private", start: 5, end: 25, content_hash: null }] })).toBe("unready");
    });
    it("takes only the last user's explicit source selection, not old attachments", () => {
        expect(conversationSourcesFromHistory([{ role: "user", content: "old", files: [{ filename: "old.pdf" }] }, { role: "assistant", content: "answer" }, { role: "user", content: "new" }])).toEqual({ files: [], public_sources: [] });
    });
    it("copies descriptors without quote/title/URL authority or mutable references", () => {
        const selected = { decision_id: "CH_CASE", start: 0, end: 40, content_hash: null, quote: "UNTRUSTED" };
        const snapshot = snapshotConversationSources({ files: [], public_sources: [selected] }); selected.end = 50;
        expect(snapshot.public_sources).toEqual([{ decision_id: "CH_CASE", start: 0, end: 40, content_hash: null }]);
    });
});
