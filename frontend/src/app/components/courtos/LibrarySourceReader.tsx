"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDocumentVersions, type DocumentVersion } from "@/app/lib/mikeApi";
import { PdfView } from "@/app/components/shared/views/PdfView";
import { librarySourcePath, type LibrarySourceTarget } from "@/app/lib/sourceLinks";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { readerMessages as m } from "@/app/lib/courtosReaderMessages";
import type { CourtOSText } from "@/app/lib/courtosLocale";

/** All metadata and bytes remain behind the existing ownership-checked document API. */
export function LibrarySourceReader({ documentId, versionId, page }: LibrarySourceTarget) {
    const { t } = useCourtOSLocale();
    const [version, setVersion] = useState<DocumentVersion | null>(null);
    const [error, setError] = useState<CourtOSText | null>(null);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let cancelled = false;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- each source link or retry starts a new version lookup
        setVersion(null); setError(null);
        if (!librarySourcePath(documentId, versionId, page)) { setError(m.invalidLink); return; }
        void listDocumentVersions(documentId).then(data => {
            if (cancelled) return;
            const exact = data.versions.find(candidate => candidate.id === versionId && !candidate.deleted_at);
            if (!exact) { setError(m.missingVersion); return; }
            setVersion(exact);
        }).catch(() => { if (!cancelled) setError(m.sourceUnavailable); });
        return () => { cancelled = true; };
    }, [documentId, versionId, page, retry]);

    return <section className="courtos-research-page" aria-label={t(m.originalDocument)}>
        <Link className="courtos-link" href="/research">{t(m.backToResearch)}</Link>
        <h1 className="mt-5 text-2xl font-bold break-words">{version?.filename || t(m.sourceDocument)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{version ? `${t(m.version, { number: version.version_number ?? t(m.unnumbered) })} · ` : ""}{t(m.pdfPage, { page })}</p>
        {error ? <div role="alert" className="mt-5"><p>{t(error)}</p><button type="button" className="courtos-link mt-3" onClick={() => setRetry(value => value + 1)}>{t(m.reload)}</button></div>
            : !version ? <p role="status" className="mt-5">{t(m.loadingVersion)}</p>
                : <>
                    <div className="mt-4 flex flex-wrap gap-4 text-sm"><a className="courtos-link" href={`/api/single-documents/${documentId}/file?version_id=${versionId}`} target="_blank" rel="noopener noreferrer">{t(m.openOriginal)}</a><span className="text-muted-foreground">{t(m.readOnlyPdf)}</span></div>
                    <div className="mt-4 flex flex-col h-[70dvh] min-h-80 overflow-hidden border border-border"><PdfView doc={{ document_id: documentId, version_id: versionId }} initialPage={page} rounded={false} /></div>
                </>}
    </section>;
}
