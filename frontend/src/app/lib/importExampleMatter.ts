import type { CaseReviewRole } from "@mike/contracts";
import type { Document } from "@/app/components/shared/types";
import { uploadLibraryDocuments } from "./mikeApi";
import type { ExampleMatter } from "./exampleMatters";

export type ExampleSelection = {document: Document; role: CaseReviewRole; party: string};
export class ExampleImportError extends Error {
    constructor(readonly code: "asset" | "upload", readonly uploadAttempted: boolean) {
        super(code); this.name = "ExampleImportError";
    }
}

/** Explicit user action only. Uploads use the ordinary personal-library session,
 * its owner checks and storage allowance. This never starts a model or search. */
export async function importExampleMatter(matter: ExampleMatter, signal: AbortSignal): Promise<ExampleSelection[]> {
    const files = await Promise.all(matter.documents.map(async entry => {
        if (!/^\/examples\/(DE|FR|IT|EN)-01\/CourtOS_[A-Z]{2}-01_D0[1-4]\.pdf$/.test(entry.path)) throw new ExampleImportError("asset", false);
        const response = await fetch(entry.path, {credentials: "same-origin", signal, redirect: "error"});
        if (!response.ok) throw new ExampleImportError("asset", false);
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2,"0")).join("");
        if (bytes.byteLength !== entry.bytes || hash !== entry.sha256 || new TextDecoder().decode(bytes.slice(0,5)) !== "%PDF-") throw new ExampleImportError("asset", false);
        return {file: new File([bytes], entry.filename, {type:"application/pdf"}), clientId:entry.id};
    }));
    signal.throwIfAborted();
    try {
        const results = await uploadLibraryDocuments("files", files, {signal});
        signal.throwIfAborted();
        return matter.documents.map(entry => {
            const matches = results.filter(result => result.clientId === entry.id);
            const item = matches[0];
            const document = item?.result;
            if (matches.length !== 1 || item.status !== "completed" || !document?.id || !document.current_version_id || document.status !== "ready" || document.filename !== entry.filename) throw new ExampleImportError("upload", true);
            return {document,role:entry.role,party:entry.party};
        });
    } catch (error) {
        if (signal.aborted) throw error;
        throw new ExampleImportError("upload", true);
    }
}
