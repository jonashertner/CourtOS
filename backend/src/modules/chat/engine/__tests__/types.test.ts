import { describe, it, expect } from "vitest";
import {
    resolveDoc,
    resolveDocLabel,
    type DocIndex,
    type DocStore,
} from "../types";

// ---------------------------------------------------------------------------
// resolveDoc
// ---------------------------------------------------------------------------

describe("resolveDoc", () => {
    const index: DocIndex = {
        "doc-1": { document_id: "uuid-aaa", filename: "contract.pdf" },
        "doc-2": { document_id: "uuid-bbb", filename: "nda.pdf" },
    };

    it("returns the doc entry for a known label", () => {
        expect(resolveDoc("doc-1", index)).toEqual({
            document_id: "uuid-aaa",
            filename: "contract.pdf",
        });
    });

    it("returns undefined for an unknown label", () => {
        expect(resolveDoc("doc-99", index)).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
        expect(resolveDoc("", index)).toBeUndefined();
    });
    it("does not resolve object prototype names as selected sources", () => {
        expect(resolveDoc("constructor", index)).toBeUndefined();
        expect(resolveDoc("__proto__", index)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// resolveDocLabel
// ---------------------------------------------------------------------------

describe("resolveDocLabel", () => {
    const store: DocStore = new Map([
        ["doc-1", { storage_path: "path/a", file_type: "pdf", filename: "contract.pdf" }],
        ["doc-2", { storage_path: "path/b", file_type: "pdf", filename: "nda.pdf" }],
    ]);

    const index: DocIndex = {
        "doc-1": { document_id: "uuid-aaa", filename: "contract.pdf" },
        "doc-2": { document_id: "uuid-bbb", filename: "nda.pdf" },
    };

    it("resolves by label when the label is in the store", () => {
        expect(resolveDocLabel("doc-1", store, index)).toBe("doc-1");
    });

    it("resolves by filename when the filename matches a store entry", () => {
        expect(resolveDocLabel("contract.pdf", store, index)).toBe("doc-1");
    });

    it("resolves by document UUID via the docIndex", () => {
        expect(resolveDocLabel("uuid-bbb", store, index)).toBe("doc-2");
    });

    it("returns null when nothing matches", () => {
        expect(resolveDocLabel("unknown-id", store, index)).toBeNull();
    });

    it("returns null when docIndex is omitted and only UUID matches", () => {
        // Without the index there is no fallback for raw UUIDs.
        expect(resolveDocLabel("uuid-aaa", store)).toBeNull();
    });

    it("rejects duplicate filenames and UUIDs bound to multiple selected versions", () => {
        const duplicateStore = new Map(store);
        duplicateStore.set("doc-3", { ...store.get("doc-1")!, storage_path: "older/a" });
        const duplicateIndex = { ...index, "doc-3": { ...index["doc-1"], version_id: "older" } };
        expect(resolveDocLabel("contract.pdf", duplicateStore, duplicateIndex)).toBeNull();
        expect(resolveDocLabel("uuid-aaa", duplicateStore, duplicateIndex)).toBeNull();
        expect(resolveDocLabel("doc-3", duplicateStore, duplicateIndex)).toBe("doc-3");
    });
    it("rejects an index-only document not in the selected source store", () => {
        const staleIndex = { ...index, "doc-3": { document_id: "unselected", filename: "secret.pdf" } };
        expect(resolveDocLabel("unselected", store, staleIndex)).toBeNull();
        expect(resolveDocLabel("doc-3", store, staleIndex)).toBeNull();
        expect(resolveDocLabel("secret.pdf", store, staleIndex)).toBeNull();
    });
    it("rejects an alias matching one filename and another document UUID", () => {
        const collision = new Map(store);
        collision.set("doc-2", { ...store.get("doc-2")!, filename: "uuid-aaa" });
        expect(resolveDocLabel("uuid-aaa", collision, index)).toBeNull();
    });
    it("prioritises exact label match over filename match", () => {
        // If a label happens to equal a filename of a different doc,
        // the label match wins.
        const storeWithCrossMatch: DocStore = new Map([
            ["nda.pdf", { storage_path: "path/c", file_type: "pdf", filename: "contract.pdf" }],
        ]);
        // "nda.pdf" is a label here, and it IS in the store, so it should
        // be returned directly without the filename-fallback loop.
        expect(resolveDocLabel("nda.pdf", storeWithCrossMatch)).toBe("nda.pdf");
    });
});
