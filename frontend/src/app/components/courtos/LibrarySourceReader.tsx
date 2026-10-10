"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDocumentVersions, type DocumentVersion } from "@/app/lib/mikeApi";
import { PdfView } from "@/app/components/shared/views/PdfView";
import { librarySourcePath, type LibrarySourceTarget } from "@/app/lib/sourceLinks";

/** All metadata and bytes remain behind the existing ownership-checked document API. */
export function LibrarySourceReader({ documentId, versionId, page }: LibrarySourceTarget) {
    const [version, setVersion] = useState<DocumentVersion | null>(null);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        setVersion(null); setError("");
        if (!librarySourcePath(documentId, versionId, page)) { setError("Dieser Quellenverweis ist ungültig."); return; }
        void listDocumentVersions(documentId).then(data => {
            if (cancelled) return;
            const exact = data.versions.find(candidate => candidate.id === versionId && !candidate.deleted_at);
            if (!exact) { setError("Diese Dokumentversion ist für Ihr Konto nicht verfügbar."); return; }
            setVersion(exact);
        }).catch(() => { if (!cancelled) setError("Diese Quelle ist für Ihr Konto nicht verfügbar oder konnte nicht geladen werden."); });
        return () => { cancelled = true; };
    }, [documentId, versionId, page, retry]);

    return <section className="courtos-research-page" aria-label="Originaldokument">
        <Link className="courtos-link" href="/research">Zur Recherche</Link>
        <h1 className="mt-5 text-2xl font-bold break-words">{version?.filename || "Quellendokument"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{version ? `Version ${version.version_number ?? "nicht nummeriert"} · ` : ""}PDF-Seite {page}</p>
        {error ? <div role="alert" className="mt-5"><p>{error}</p><button type="button" className="courtos-link mt-3" onClick={() => setRetry(value => value + 1)}>Erneut laden</button></div>
            : !version ? <p role="status" className="mt-5">Dokumentversion wird geladen…</p>
                : <>
                    <div className="mt-4 flex flex-wrap gap-4 text-sm"><a className="courtos-link" href={`/api/single-documents/${documentId}/file?version_id=${versionId}`} target="_blank" rel="noopener noreferrer">Originaldatei öffnen</a><span className="text-muted-foreground">PDF-Fassung dieser Version · Nur lesbar</span></div>
                    <div className="mt-4 flex flex-col h-[70dvh] min-h-80 overflow-hidden border border-border"><PdfView doc={{ document_id: documentId, version_id: versionId }} initialPage={page} rounded={false} /></div>
                </>}
    </section>;
}
