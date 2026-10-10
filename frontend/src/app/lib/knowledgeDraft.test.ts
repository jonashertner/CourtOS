import { afterEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/app/components/shared/types";
import { consumeKnowledgeDraft, getKnowledgeDraft, knowledgeAnalysisIssue, prepareKnowledgeDraft, prepareChronologyDraft } from "./knowledgeDraft";
const doc = { id: "doc-a", filename: "Literatur.pdf", current_version_id: "version-a", status: "ready" } as Document;
afterEach(() => { getKnowledgeDraft("clear-owner"); vi.restoreAllMocks(); });
describe("same-tab knowledge draft", () => {
    it.each(["docx", "xlsx", "pptx"])("rejects a ready %s even if it has a derived PDF", type => {
        const source = { ...doc, filename: `Quelle.${type}`, file_type: type, pdf_storage_path: "derived.pdf" };
        expect(knowledgeAnalysisIssue([source])).toContain("ursprüngliche PDF");
        expect(prepareChronologyDraft("user-a", [source])).toBe(false);
        expect(prepareKnowledgeDraft("user-a", "Vergleichen", [source])).toBe(false);
        expect(getKnowledgeDraft("user-a")).toBeNull();
    });
    it("requires ready fixed versions and at most five sources without silently reducing selection", () => {
        expect(knowledgeAnalysisIssue([{ ...doc, status: "processing" }])).toContain("noch nicht bereit");
        expect(prepareChronologyDraft("user-a", Array(6).fill(doc))).toBe(false);
        expect(prepareKnowledgeDraft("user-a", "Vergleichen", Array(6).fill(doc))).toBe(false);
        expect(getKnowledgeDraft("user-a")).toBeNull();
        expect(knowledgeAnalysisIssue([{ ...doc, filename: "QUELLE.PDF" }])).toBeNull();
    });
    it("requires immutable selected sources for a chronology and preserves the other party", () => {
        const reply = { ...doc, id: "doc-b", filename: "Klageantwort.pdf", current_version_id: "version-b" } as Document;
        expect(prepareChronologyDraft("user-a", [doc, reply])).toBe(true);
        const draft = getKnowledgeDraft("user-a")!;
        expect(draft.documents.map(value => value.current_version_id)).toEqual(["version-a", "version-b"]);
        expect(draft.prompt).toContain("sämtlichen ausgewählten Dokumenten");
        expect(draft.prompt).toContain("abweichende Darstellungen separat");
        expect(draft.prompt).toContain("ohne bestimmbares Datum");
        consumeKnowledgeDraft(draft);
        expect(prepareChronologyDraft("user-a", [{ ...doc, current_version_id: null } as Document])).toBe(false);
        expect(getKnowledgeDraft("user-a")).toBeNull();
    });
    it("retains explicit document/version references and can be consumed once", () => {
        expect(prepareKnowledgeDraft("user-a", "Gehör?", [doc])).toBe(true);
        const draft = getKnowledgeDraft("user-a")!;
        expect(draft.documents[0]).toMatchObject({ id: "doc-a", current_version_id: "version-a" });
        expect(draft.prompt).toContain("Gehör?");
        consumeKnowledgeDraft(draft);
        expect(getKnowledgeDraft("user-a")).toBeNull();
    });
    it("clears across account changes and after five minutes", () => {
        prepareKnowledgeDraft("user-a", "Gehör?", [doc]);
        expect(getKnowledgeDraft("user-b")).toBeNull();
        expect(getKnowledgeDraft("user-a")).toBeNull();
        vi.spyOn(Date, "now").mockReturnValue(1000);
        prepareKnowledgeDraft("user-a", "Gehör?", [doc]);
        vi.mocked(Date.now).mockReturnValue(301001);
        expect(getKnowledgeDraft("user-a")).toBeNull();
    });
    it("does not prepare an unscoped or oversized selection", () => {
        expect(prepareKnowledgeDraft("", "Gehör?", [doc])).toBe(false);
        expect(prepareKnowledgeDraft("user-a", " ", [doc])).toBe(false);
        expect(prepareKnowledgeDraft("user-a", "Gehör?", [])).toBe(false);
        expect(prepareKnowledgeDraft("user-a", "Gehör?", Array(21).fill(doc))).toBe(false);
    });
});
