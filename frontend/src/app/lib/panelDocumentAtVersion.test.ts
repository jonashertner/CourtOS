import { describe, expect, it } from "vitest";
import type { PanelDocument } from "@/app/components/shared/types";
import type { DocumentVersion } from "./mikeApi";
import { panelDocumentAtVersion } from "./panelDocumentAtVersion";

const document: PanelDocument = {
    document_id: "doc-a",
    title: "Original.pdf",
    type: "pdf",
    metadata: [],
    quotes: [{ quote: "existing", target: { page: 1 } }],
    version_id: "version-a",
    version_number: 1,
};
const version: DocumentVersion = {
    id: "version-b",
    version_number: 2,
    source: "upload",
    created_at: "2024-01-01T00:00:00.000Z",
    filename: "Renamed.docx",
    file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

describe("panel document selected at a version", () => {
    it("adopts the selected version's filename, type and identifiers, and drops stale quotes", () => {
        const result = panelDocumentAtVersion(document, version);
        expect(result).toEqual({
            ...document,
            title: "Renamed.docx",
            type: "docx",
            version_id: "version-b",
            version_number: 2,
            quotes: [],
        });
    });
    it("keeps the document's own title when the version has no filename", () => {
        const result = panelDocumentAtVersion(document, { ...version, filename: null, file_type: null });
        expect(result.title).toBe("Original.pdf");
        expect(result.type).toBe("pdf");
    });
});
