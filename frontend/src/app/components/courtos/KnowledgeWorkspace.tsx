"use client";

import { ProcessingLocation } from "@/app/components/courtos/ProcessingLocation";

import { librarySourceUrl, selectedSourcePassage, originalTextSearchUrl, type SelectedSourcePassage } from "@/app/lib/sourceLinks";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { prepareFrontierDraft } from "@/app/lib/frontierDraft";
import { knowledgeAnalysisIssue, prepareChronologyDraft, prepareKnowledgeDraft } from "@/app/lib/knowledgeDraft";
import { prepareResearchDraft } from "@/app/lib/researchDraft";
import { useResearchModelPreference } from "@/app/lib/researchModelPreference";
import type { WordResearchHost, WordSourceCitation } from "@/app/lib/wordResearchHost";
import { BookOpen, Copy, ExternalLink, Search, X } from "lucide-react";
import { searchLibraryDocuments } from "@/app/lib/mikeApi";
import { panelDocumentFromCitation, type Document, type DocumentCitation } from "@/app/components/shared/types";
import { getPublicDecision, publicSourceUrl, searchKnowledge, searchPublicKnowledge, type KnowledgeResult, type KnowledgeSearch, type PublicDecision, type PublicDecisionDetail, type PublicSearch } from "@/app/lib/knowledgeApi";

const DocumentContent = dynamic(() => import("@/app/components/shared/DocumentContent").then((module) => module.DocumentContent), { ssr: false, loading: () => <p role="status" className="p-6">Dokument wird geöffnet…</p> });
const button = "courtos-button";
const secondary = "courtos-button courtos-button--secondary";
const field = "courtos-field";
const link = "courtos-link";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Das Laden ist fehlgeschlagen. Bitte versuchen Sie es erneut.";

function CopySource({ text, label, wordHost, wordCitation }: { text: string; label: string; wordHost?: WordResearchHost | null; wordCitation: WordSourceCitation }) {
    const [insertStatus, setInsertStatus] = useState<"idle" | "inserting" | "inserted" | "error">("idle");
    const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
    useEffect(() => { setStatus("idle"); setInsertStatus("idle"); }, [text]);
    return <div className="min-w-0">
        <button type="button" className={link} onClick={async () => {
            try { await navigator.clipboard.writeText(text); setStatus("copied"); }
            catch { setStatus("manual"); }
        }}><Copy size={15} aria-hidden="true" />{label}</button>
        {wordHost && <><button type="button" className={`${link} ml-4`} disabled={insertStatus === "inserting"} onClick={async () => {
            setInsertStatus("inserting");
            try { await wordHost.insertCitationAfterSelection(wordCitation); setInsertStatus("inserted"); }
            catch { setInsertStatus("error"); }
        }}>In Word einfügen</button>{insertStatus === "inserted" && <p role="status" className="mt-2 text-xs">In Word eingefügt.</p>}{insertStatus === "error" && <p role="alert" className="mt-2 text-xs">Einfügen nicht bestätigt. Prüfen Sie zuerst das Word-Dokument; der Text könnte bereits eingefügt sein.</p>}</>}
        {status === "copied" && <p role="status" className="mt-2 text-xs text-muted-foreground">Kopiert. In Ihrem Dokument einfügen.</p>}
        {status === "manual" && <div className="mt-3"><p role="status" className="text-xs text-muted-foreground">Die Zwischenablage ist nicht verfügbar. Text hier markieren und kopieren.</p><textarea aria-label="Text zum manuellen Kopieren" readOnly rows={6} className={field} value={text} onFocus={(event) => event.currentTarget.select()} /></div>}
    </div>;
}

function libraryExcerpt(hit: KnowledgeResult) {
    const url = typeof window !== "undefined" ? librarySourceUrl(window.location.origin, hit.document_id, hit.version_id, hit.page) : null;
    return `${hit.quote}\n\nQuelle: ${hit.filename}, Version ${hit.version_number ?? "nicht nummeriert"}, PDF-Seite ${hit.page}.${url ? `\nQuelle öffnen (Anmeldung erforderlich): ${url}` : ""}\nAuszug aus dem erfassten Dokumenttext; Zitat an der Quelle prüfen.`;
}

function libraryWordCitation(hit: KnowledgeResult): WordSourceCitation {
    return {
        quote: hit.quote, source: hit.filename,
        pinpoint: `Version ${hit.version_number ?? "nicht nummeriert"}, PDF-Seite ${hit.page}`,
        sourceUrl: typeof window !== "undefined" ? librarySourceUrl(window.location.origin, hit.document_id, hit.version_id, hit.page) : null,
        notes: ["Quelle öffnen: Anmeldung erforderlich. Auszug aus dem erfassten Dokumenttext; Zitat an der Quelle prüfen."],
    };
}

function publicWordCitation(decision: PublicDecision, excerpt: SelectedSourcePassage, originalSearch: string | null): WordSourceCitation {
    const date = decision.decision_date ? `${decision.decision_date}${decision.date_is_estimated ? " (Datum geschätzt)" : ""}` : null;
    const metadata = [courtLabel(decision.court), decision.docket_number, date].filter(Boolean).join(" · ");
    return {
        quote: excerpt.text,
        source: [decisionTitle(decision), metadata].filter(Boolean).join(" · "),
        pinpoint: `Zeichen ${excerpt.start}–${excerpt.end} von ${excerpt.total_chars} im erfassten Text; keine amtlichen Randnummern`,
        sourceUrl: publicSourceUrl(decision.source_url) || publicSourceUrl(decision.pdf_url),
        pinpointUrl: originalSearch,
        notes: [`OpenCaseLaw-ID: ${decision.decision_id}. Position im Original nicht geprüft; Wortlaut und Kontext an der Originalquelle prüfen.`, ...(decision.source_note ? [`Hinweis von OpenCaseLaw: ${decision.source_note}`] : [])],
    };
}

function publicReference(decision: PublicDecision) {
    const date = decision.decision_date ? `${decision.decision_date}${decision.date_is_estimated ? " (Datum geschätzt)" : ""}` : null;
    return [decisionTitle(decision), [courtLabel(decision.court), decision.docket_number, date].filter(Boolean).join(" · "), publicSourceUrl(decision.source_url) || publicSourceUrl(decision.pdf_url), `OpenCaseLaw-ID: ${decision.decision_id}`, decision.source_note ? `Hinweis von OpenCaseLaw: ${decision.source_note}` : null].filter(Boolean).join("\n");
}

function SourceDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); }, []);
    return <dialog ref={ref} onCancel={onClose} onClose={onClose} aria-label={title} className="courtos-source-dialog">
        <div className="flex h-full min-h-0 flex-col">
            <header className="courtos-source-dialog-header"><h2>{title}</h2><button className={secondary} onClick={onClose} aria-label="Quelle schliessen"><X size={18} aria-hidden="true" /></button></header>
            {children}
        </div>
    </dialog>;
}

function LocalSource({ result, onClose }: { result: KnowledgeResult; onClose: () => void }) {
    // This passage is a literal, page-local substring returned by the
    // version-bound server index, not a quotation generated by a model.
    const citation: DocumentCitation = { type: "citation_data", kind: "document", ref: 1, doc_id: result.document_id, document_id: result.document_id, version_id: result.version_id, version_number: result.version_number, filename: result.filename, page: result.page, quote: result.quote, verified: true, quotes: [{ page: result.page, quote: result.quote, verification: { verified: true } }] };
    return <SourceDialog title={`${result.filename} · Seite ${result.page}`} onClose={onClose}>
        <div className="min-h-0 flex-1"><DocumentContent document={panelDocumentFromCitation(citation)} mode={{ kind: "citation", citation }} canEdit={false} /></div>
    </SourceDialog>;
}

function LocalKnowledge({ wordHost, inWord }: { wordHost?: WordResearchHost | null; inWord?: boolean }) {
    const router = useRouter();
    const { user } = useAuth();
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selected, setSelected] = useState<Document[]>([]);
    const [filename, setFilename] = useState("");
    const [filter, setFilter] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingDocuments, setLoadingDocuments] = useState(true);
    const [listError, setListError] = useState("");
    const [query, setQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [result, setResult] = useState<KnowledgeSearch | null>(null);
    const [submitted, setSubmitted] = useState("");
    const [source, setSource] = useState<KnowledgeResult | null>(null);
    const analysisIssue = knowledgeAnalysisIssue(selected);
    const searchController = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        setLoadingDocuments(true); setListError("");
        searchLibraryDocuments("files", { search: filter, limit: 20, offset, sortKey: "name", sortDirection: "asc", signal: controller.signal })
            .then((data) => { if (!controller.signal.aborted) { setDocuments(data.documents); setHasMore(data.documentsHasMore); } })
            .catch(() => { if (!controller.signal.aborted) setListError("Die Bibliothek konnte nicht geladen werden. Bitte versuchen Sie es erneut."); })
            .finally(() => { if (!controller.signal.aborted) setLoadingDocuments(false); });
        return () => controller.abort();
    }, [filter, offset, refresh]);
    useEffect(() => () => searchController.current?.abort(), []);
    function changeSelection(doc: Document) {
        searchController.current?.abort(); setSearching(false); setResult(null); setSearchError("");
        setSelected((previous) => previous.some((item) => item.id === doc.id) ? previous.filter((item) => item.id !== doc.id) : [...previous, doc]);
    }
    async function search(event: FormEvent) {
        event.preventDefault();
        if (!selected.length || !query.trim() || searching) return;
        const controller = new AbortController(); searchController.current?.abort(); searchController.current = controller;
        setSearching(true); setSearchError(""); setResult(null); setSubmitted(query.trim());
        try { const data = await searchKnowledge(query.trim(), selected.map((doc) => doc.id), controller.signal); if (!controller.signal.aborted) setResult(data); }
        catch (error) { if (!controller.signal.aborted) setSearchError(errorText(error)); }
        finally { if (!controller.signal.aborted) setSearching(false); }
    }
    return <section aria-labelledby="private-knowledge-title" className="courtos-private-workspace">
        <h2 id="private-knowledge-title" className="courtos-research-section-title">Eigene Quellen</h2>
        <ProcessingLocation service="library" className="mt-3">Textsuche ohne KI · Verarbeitung auf dem Server</ProcessingLocation>
        <div className="mt-5 flex flex-wrap gap-5"><Link href={inWord ? "/library?host=word" : "/library"} target={inWord ? undefined : "_blank"} rel="noopener noreferrer" className={link}>Dokumente hinzufügen <ExternalLink size={14} aria-hidden="true" /></Link><button className={link} onClick={() => setRefresh((value) => value + 1)}>Bestand aktualisieren</button></div>
        <div className="courtos-library-grid">
            <div className="courtos-source-list">
                <h3 className="font-medium">Quellenauswahl</h3>
                <form className="mt-3" onSubmit={(event) => { event.preventDefault(); setFilter(filename.trim()); setOffset(0); setRefresh((value) => value + 1); }}><label htmlFor="library-filter" className="text-sm">Dateiname</label><div className="flex items-end gap-2"><input id="library-filter" className={field} value={filename} maxLength={200} onChange={(event) => setFilename(event.target.value)} /><button className={secondary} aria-label="Dateinamen filtern"><Search size={17} aria-hidden="true" /></button></div></form>
                <p className="mt-4 text-xs text-muted-foreground" role="status">{selected.length} von höchstens 20 Dokumenten ausgewählt</p>
                {selected.length > 0 && <div className="mt-2 space-y-1" aria-label="Ausgewählte Dokumente">{selected.map((doc) => <button key={doc.id} className="flex w-full items-center justify-between gap-2 rounded-lg bg-app-surface-active px-2 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring" onClick={() => changeSelection(doc)} aria-label={`${doc.filename} aus Auswahl entfernen`}><span className="break-all">{doc.filename}</span><X size={14} className="shrink-0" aria-hidden="true" /></button>)}</div>}
                {loadingDocuments ? <p className="mt-5 text-sm" role="status">Bibliothek wird geladen…</p> : listError ? <p className="mt-5 text-sm" role="alert">{listError}</p> : <>
                    {!documents.length && <p className="mt-5 text-sm leading-relaxed">{filter ? "Kein Dokument mit diesem Dateinamen gefunden." : "Noch keine Dokumente. Fügen Sie Ihre Quellen hinzu."}</p>}
                    <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">{documents.map((doc) => { const checked = selected.some((item) => item.id === doc.id); return <li key={doc.id}><label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-foreground" checked={checked} disabled={!checked && selected.length >= 20} onChange={() => changeSelection(doc)} /><span className="min-w-0 break-all">{doc.filename}<span className="mt-1 block text-xs text-muted-foreground">{doc.active_version_number ? `Version ${doc.active_version_number}` : "Aktuelle Version"}</span></span></label></li>; })}</ul>
                    <div className="mt-3 flex items-center justify-between gap-2"><button className={secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Zurück</button><span className="text-xs">Seite {offset / 20 + 1}</span><button className={secondary} disabled={!hasMore} onClick={() => setOffset(offset + 20)}>Weiter</button></div>
                </>}
            </div>
            <div>
                <form onSubmit={search} className="courtos-search-form">
                    <h3 className="font-medium">Textsuche</h3>
                    <label htmlFor="private-query" className="mt-4 block text-sm">Suchbegriffe</label><textarea id="private-query" className={field} rows={3} maxLength={300} value={query} onChange={(event) => setQuery(event.target.value)} aria-describedby="private-search-help" />
                    <p id="private-search-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">Durchsucht den erfassten Text. Bildscans benötigen eine Textebene.</p>
                    <button className={`${button} mt-4`} disabled={searching || selected.length === 0 || !query.trim()}><Search size={16} aria-hidden="true" />{searching ? "Passagen werden gesucht…" : "Auswahl durchsuchen"}</button>
                </form>
                {!inWord && <details className="mt-4 border-t border-border pt-4">
                    <summary className="cursor-pointer text-sm">Mit Gemma weiterarbeiten</summary>
                    <p id="knowledge-analysis-help" className="mt-3 text-xs leading-relaxed text-muted-foreground">Bis zu fünf PDF-Dateien mit auslesbarem Text.</p>
                    {analysisIssue && <p id="knowledge-analysis-issue" role="status" className="mt-2 text-sm leading-relaxed">{analysisIssue}</p>}
                    <div className="mt-3 flex flex-wrap gap-3">
                        <button type="button" className={secondary} aria-describedby={analysisIssue ? "knowledge-analysis-issue" : "knowledge-analysis-help"} disabled={!user?.id || !!analysisIssue || !query.trim()} onClick={() => { if (user?.id && prepareKnowledgeDraft(user.id, query, selected)) router.push("/assistant"); }}>Mit dieser Auswahl fragen</button>
                        <button type="button" className={secondary} aria-describedby={analysisIssue ? "knowledge-analysis-issue" : "knowledge-analysis-help"} disabled={!user?.id || !!analysisIssue} onClick={() => { if (user?.id && prepareChronologyDraft(user.id, selected)) router.push("/assistant"); }}>Chronologie erstellen</button>
                    </div>
                    <ProcessingLocation service="gemma" stage="draft" className="mt-3">Öffnet Auftrag und Quellenauswahl. Erst im Assistenten senden.</ProcessingLocation>
                </details>}
                {searching && <p role="status" className="mt-4 text-sm">Die Dokumenttexte werden auf dem CourtOS-Server durchsucht · ohne KI.</p>}
                {searchError && <p role="alert" className="mt-5 text-sm">{searchError}</p>}
                {result && <section aria-label="Lokale Suchergebnisse" className="mt-7"><h3 className="font-serif text-xl">{result.results.length} Passagen zu «{submitted}»</h3>
                    {result.notices.map((notice, index) => <p key={index} className="mt-2 text-sm leading-relaxed">{notice}</p>)}
                    <details className="mt-4 rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer">Umfang der erfassten Quellen prüfen</summary><ul className="mt-3 space-y-2">{result.documents.map((doc) => <li key={doc.document_id} className="break-words"><strong className="font-medium">{selected.find((item) => item.id === doc.document_id)?.filename ?? "Dokument"}</strong>: {doc.index_status === "ready" ? "Text erfasst" : doc.index_status === "partial" ? "Nur teilweise erfasst" : "Kein durchsuchbarer Text"} · {doc.indexed_pages} von {doc.total_pages} Seiten</li>)}</ul></details>
                    {result.results.length === 0 && <p className="mt-4 text-sm leading-relaxed">Keine passende Passage in den erfassten Seiten. Versuchen Sie einen anderen Begriff und prüfen Sie oben den Erfassungsumfang.</p>}
                    <ol className="mt-4 space-y-4">{result.results.map((hit, index) => <li key={`${hit.document_id}-${hit.version_id}-${hit.page}-${index}`} className="courtos-source-hit"><p className="courtos-source-meta">{hit.filename} · Version {hit.version_number ?? "nicht nummeriert"} · PDF-Seite {hit.page}</p><blockquote className="mt-3 whitespace-pre-wrap break-words font-serif text-base leading-relaxed">{hit.quote}</blockquote><div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3"><button className={link} onClick={() => setSource(hit)}>Beleg im Dokument öffnen <BookOpen size={15} aria-hidden="true" /></button><CopySource text={libraryExcerpt(hit)} label="Passage und Quelle kopieren" wordHost={wordHost} wordCitation={libraryWordCitation(hit)} /></div></li>)}</ol>
                </section>}
            </div>
        </div>
        {source && <LocalSource result={source} onClose={() => setSource(null)} />}
    </section>;
}

function OriginalLinks({ decision }: { decision: PublicDecision }) {
    const source = publicSourceUrl(decision.source_url); const pdf = publicSourceUrl(decision.pdf_url);
    return <div className="flex flex-wrap gap-x-5">{source && <a href={source} target="_blank" rel="noopener noreferrer" className={link}>Ganzes Original <ExternalLink size={14} aria-hidden="true" /></a>}{pdf && pdf !== source && <a href={pdf} target="_blank" rel="noopener noreferrer" className={link}>Ganzes Original-PDF <ExternalLink size={14} aria-hidden="true" /></a>}</div>;
}
// Only known source identifiers are expanded. Unknown metadata is displayed as supplied.
function courtLabel(court: string | null | undefined) {
    const known: Record<string, string> = { bger: "Bundesgericht", bge: "Bundesgericht", zh_verwaltungsgericht: "Verwaltungsgericht Zürich", ow_gerichte: "Gerichte Obwalden", lu_gerichte: "Gerichte Luzern", ag_gerichte: "Gerichte Aargau" };
    return court ? known[court] ?? court.replaceAll("_", " ") : "";
}
function decisionTitle(decision: PublicDecision) { return decision.title || [courtLabel(decision.court), decision.docket_number].filter(Boolean).join(" · ") || decision.decision_id; }

function PublicSource({ decision, onClose, wordHost, inWord }: { decision: PublicDecision; onClose: () => void; wordHost?: WordResearchHost | null; inWord?: boolean }) {
    const { user } = useAuth();
    const router = useRouter();
    const [handoffError, setHandoffError] = useState("");
    const sourceText = useRef<HTMLPreElement>(null);
    const [excerpt, setExcerpt] = useState<SelectedSourcePassage | null>(null);
    const [selectionError, setSelectionError] = useState("");
    const { model } = useResearchModelPreference(user?.id, !inWord);
    const [detail, setDetail] = useState<PublicDecisionDetail | null>(null);
    const [start, setStart] = useState(0); const [history, setHistory] = useState<number[]>([]);
    const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController(); setLoading(true); setError(""); setExcerpt(null); setSelectionError(""); setHandoffError("");
        getPublicDecision(decision.decision_id, start, controller.signal).then((data) => { if (!controller.signal.aborted) setDetail(data); }).catch((problem) => { if (!controller.signal.aborted) setError(errorText(problem)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [decision.decision_id, start, retry]);
    const authoritative = detail ?? decision;
    const originalSearch = detail && excerpt ? originalTextSearchUrl(publicSourceUrl(detail.source_url), publicSourceUrl(detail.pdf_url), excerpt.text) : null;
    const excerptReference = detail && excerpt ? `${publicReference(detail)}\nAusgewählte Textstelle: Zeichen ${excerpt.start}–${excerpt.end} von ${excerpt.total_chars}; keine amtlichen Randnummern.${originalSearch ? `\nTextstelle im Original suchen: ${originalSearch}` : ""}\nPosition im Original nicht geprüft; Wortlaut und Kontext an der Originalquelle prüfen.` : "";
    return <SourceDialog title={decisionTitle(authoritative)} onClose={onClose}><div className="courtos-source-reading">
        <p className="text-sm text-muted-foreground">{[courtLabel(authoritative.court), authoritative.docket_number, authoritative.decision_date, authoritative.language?.toUpperCase()].filter(Boolean).join(" · ")}</p><OriginalLinks decision={authoritative} />
        {loading ? <p role="status" className="mt-6">Entscheidtext wird geladen…</p> : error ? <div role="alert" className="mt-6"><p>{error}</p><button className={`${secondary} mt-3`} onClick={() => setRetry((value) => value + 1)}>Erneut laden</button></div> : detail && <>
            {detail.date_is_estimated && <p className="mt-4 text-sm text-muted-foreground">Das Entscheidungsdatum ist im Quellenbestand nur geschätzt.</p>}
            {detail.source_note && <p className="mt-4 text-sm text-muted-foreground">Hinweis von OpenCaseLaw: {detail.source_note}</p>}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Erfasster Text · Zeichenposition {detail.passage.start}–{detail.passage.end} von {detail.passage.total_chars}. Diese Positionen beginnen bei 0 und sind keine amtlichen Randnummern.</p>
            <p className="mt-3 text-sm">Kurze Textstelle markieren (20–800 Zeichen).</p>
            <pre ref={sourceText} tabIndex={0} aria-label="Erfasster Entscheidtext" className="courtos-decision-text">{detail.passage.text}</pre>
            <button type="button" className={secondary} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                const selected = selectedSourcePassage(sourceText.current, window.getSelection(), detail.passage);
                if (!selected) { setExcerpt(null); setSelectionError("Bitte eine zusammenhängende Textstelle mit 20–800 Zeichen im Entscheidtext markieren."); return; }
                setExcerpt(selected); setSelectionError(""); setHandoffError("");
            }}>Markierte Stelle übernehmen</button>
            {selectionError && <p role="alert" className="mt-3 text-sm">{selectionError}</p>}
            {excerpt && <div className="mt-5 border-t border-border pt-4" aria-label="Ausgewählte Textstelle">
                <blockquote className="whitespace-pre-wrap text-sm leading-relaxed">{excerpt.text}</blockquote>
                <p className="mt-2 text-xs text-muted-foreground">Zeichen {excerpt.start}–{excerpt.end} · Position im Original nicht geprüft</p>
                {originalSearch && <><a className={`${link} mt-3`} href={originalSearch} target="_blank" rel="noopener noreferrer">Textstelle im Original suchen</a><p className="mt-2 text-xs text-muted-foreground">Der Textsprung hängt von Website und Browser ab.</p></>}
                {!originalSearch && <p className="mt-2 text-xs text-muted-foreground">Für diese Quelle steht kein Textsprung zur Verfügung. Die Stelle im ganzen Original prüfen.</p>}
                <div className="mt-3"><CopySource text={`${excerpt.text}\n\nQuelle: ${excerptReference}`} label="Textstelle und Quelle kopieren" wordHost={wordHost} wordCitation={publicWordCitation(detail, excerpt, originalSearch)} /></div>
            </div>}
            {!inWord && excerpt && <div className="courtos-source-ai">
                <button type="button" className={secondary} disabled={!user?.id} onClick={() => {
                    if (!user?.id) return;
                    if (model === "gemma") {
                        const text = `Prüfe den folgenden Entscheidauszug anhand seiner eigenen Aussagen. Unterscheide belegte Aussagen und offene Fragen. Erfinde keine Quellen und behaupte nicht, den vollständigen Entscheid gelesen zu haben.\n\n${excerptReference}\n\n${excerpt.text}`;
                        if (prepareResearchDraft(user.id, text)) router.push("/assistant");
                        else setHandoffError("Der Auszug konnte nicht übergeben werden. Bitte kopieren Sie ihn in den lokalen Assistenten.");
                    } else {
                        const text = [excerptReference, excerpt.text].join("\n\n");
                        if (prepareFrontierDraft(user.id, text)) window.location.assign("/hybrid/");
                        else setHandoffError("Der Auszug konnte nicht übergeben werden. Bitte die Frontier-Prüfung separat öffnen.");
                    }
                }}>{model === "gemma" ? "Mit Gemma prüfen" : "Mit Opus prüfen"}</button>
                <ProcessingLocation service={model === "gemma" ? "gemma" : "anthropic"} stage="draft" className="mt-3" />
                {handoffError && <p role="alert">{handoffError}</p>}
            </div>}
            <div className="mt-6 flex flex-wrap gap-3"><button className={secondary} disabled={!history.length} onClick={() => { setStart(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); }}>Vorheriger Abschnitt</button><button className={secondary} disabled={!detail.passage.has_more} onClick={() => { setHistory((items) => [...items, start]); setStart(detail.passage.end); }}>Nächster Abschnitt</button></div>
            <details className="mt-6 text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer">Quellennachweis</summary><p className="mt-2 break-all">OpenCaseLaw-ID: {detail.decision_id}<br />Erfasst: {detail.scraped_at || "nicht angegeben"}<br />Text-Hash: {detail.content_hash || "nicht angegeben"}</p></details>
        </>}
    </div></SourceDialog>;
}

function PublicKnowledge({ wordHost, wordHostError, inWord }: { wordHost?: WordResearchHost | null; wordHostError?: string; inWord?: boolean }) {
    const [selectionError, setSelectionError] = useState("");
    const [readingSelection, setReadingSelection] = useState(false);
    const [query, setQuery] = useState(""); const [language, setLanguage] = useState("");
    const [result, setResult] = useState<PublicSearch | null>(null); const [submitted, setSubmitted] = useState("");
    const [searching, setSearching] = useState(false); const [error, setError] = useState(""); const [source, setSource] = useState<PublicDecision | null>(null);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    async function search(event: FormEvent) {
        event.preventDefault(); if (!query.trim() || searching) return;
        controller.current?.abort(); const pending = new AbortController(); controller.current = pending; setSearching(true); setError(""); setResult(null); setSubmitted(query.trim());
        try { const data = await searchPublicKnowledge(query.trim(), language, pending.signal); if (!pending.signal.aborted) setResult(data); }
        catch (problem) { if (!pending.signal.aborted) setError(errorText(problem)); }
        finally { if (!pending.signal.aborted) setSearching(false); }
    }
    return <section aria-labelledby="public-knowledge-title" className="courtos-public-workspace">
        <div className="courtos-research-search-grid">
            <div className="courtos-research-source-note">
                <h2 id="public-knowledge-title" className="sr-only">OpenCaseLaw</h2>
            </div>
            <form onSubmit={search} className="courtos-public-search">
                <label htmlFor="public-query">Öffentliche Rechtsbegriffe</label>
                <div className="courtos-search-line">
                    <input id="public-query" placeholder="Rechtsbegriffe" className={field} value={query} maxLength={180} onChange={(event) => setQuery(event.target.value)} aria-describedby="public-search-help" />
                    <button className={button} disabled={searching || !query.trim()}><Search size={17} aria-hidden="true" />{searching ? "Suche läuft…" : "Suchen"}</button>
                </div>
                <div className="courtos-search-options">
                    <p id="public-search-help">KI-gestützte Suche · Bis zu acht Begriffe</p>
                    <label htmlFor="public-language"><span className="sr-only">Sprache</span><select id="public-language" value={language} onChange={(event) => { controller.current?.abort(); setLanguage(event.target.value); setSearching(false); setResult(null); setError(""); }} className={field}><option value="">Alle Sprachen</option><option value="de">Deutsch</option><option value="fr">Französisch</option><option value="it">Italienisch</option></select></label>
                </div>
                <ProcessingLocation service="opencaselaw">Mit «Suchen» werden Ihre Begriffe übermittelt. Keine vertraulichen Angaben eingeben.</ProcessingLocation>
                {inWord && <div className="courtos-word-selection"><button type="button" className={link} disabled={!wordHost || readingSelection} onClick={async () => {
                    if (!wordHost) return;
                    setReadingSelection(true); setSelectionError("");
                    try {
                        const selected = (await wordHost.readSelection()).trim();
                        if (!selected || selected.length > 180 || selected.split(/\s+/).length > 8) { setSelectionError("Bitte bis zu acht Rechtsbegriffe in Word markieren."); return; }
                        setQuery(selected);
                    } catch { setSelectionError("Die Auswahl konnte nicht gelesen werden. Bitte Rechtsbegriffe eingeben."); }
                    finally { setReadingSelection(false); }
                }}>{readingSelection ? "Auswahl wird gelesen…" : "Auswahl aus Word übernehmen"}</button>{(selectionError || wordHostError) && <p role="alert">{selectionError || wordHostError}</p>}</div>}
                {searching && <p role="status" className="courtos-search-state">Anfrage an OpenCaseLaw läuft…</p>}
                {error && <p role="alert" className="courtos-search-state courtos-search-state--error">{error}</p>}
            </form>
        </div>
        {result && <section className="courtos-public-results" aria-label="Öffentliche Suchergebnisse">
            <header className="courtos-results-heading">
                <h3>{result.results.length} Entscheide zu «{submitted}»</h3>
                <details className="courtos-result-scope"><summary>Zum Suchumfang</summary><p>Bis zu fünf Texttreffer{result.candidate_limit ? ` aus einer begrenzten Auswahl von höchstens ${result.candidate_limit} passenden Datensätzen` : ""}, keine vollständige Recherche. Datum und Aktenzeichen stammen aus dem Datenbestand; die Originalquelle bleibt massgeblich.</p></details>
            </header>
            {!result.results.length && <p className="courtos-empty-results">Die Suche hat keine Entscheide zurückgegeben. Versuchen Sie weniger oder andere Begriffe.</p>}
            {result.degraded && <p className="courtos-search-state">OpenCaseLaw hat eine eingeschränkte Rangfolge geliefert. Bitte die Suche später wiederholen oder präzisere Begriffe verwenden.</p>}
            <ol className="courtos-public-result-list">{result.results.map((decision) => <li key={decision.decision_id} className="courtos-public-result">
                <p className="courtos-result-meta"><span>{[courtLabel(decision.court), decision.canton].filter(Boolean).join(" · ")}</span>{" "}<span>{[decision.decision_date, decision.language?.toUpperCase()].filter(Boolean).join(" · ")}</span></p>
                <div className="courtos-result-content">
                    <h4>{decisionTitle(decision)}</h4>
                    <p className="courtos-result-excerpt">{decision.snippet}</p>
                    <div className="courtos-result-actions"><button className={link} onClick={() => setSource(decision)}>Entscheidtext öffnen <BookOpen size={15} aria-hidden="true" /></button><OriginalLinks decision={decision} /></div>
                </div>
            </li>)}</ol>
            <p className="courtos-results-generation">OpenCaseLaw · {result.query_mode === "opencaselaw_ai" ? "KI-gestützte Suche" : "öffentliche Suche"} · Datenstand-Kennung: {result.database_generation ?? "nicht angegeben"}</p>
        </section>}
        {source && <PublicSource decision={source} onClose={() => setSource(null)} wordHost={wordHost} inWord={inWord} />}
    </section>;
}

export function KnowledgeWorkspace({ wordHost, wordHostError }: { wordHost?: WordResearchHost | null; wordHostError?: string } = {}) {
    const inWord = wordHost !== undefined;
    const [mode, setMode] = useState<"private" | "public">("public");
    const [libraryVisited, setLibraryVisited] = useState(false);
    return <div className="courtos-research-page">
        <header className="courtos-research-intro">
            <h1>Recherche</h1>
        </header>
        <nav aria-label="Quellenart" className="courtos-source-tabs"><button aria-pressed={mode === "public"} className="courtos-source-tab" onClick={() => setMode("public")}>OpenCaseLaw</button><button aria-pressed={mode === "private"} className="courtos-source-tab" onClick={() => { setMode("private"); setLibraryVisited(true); }}>Eigene Quellen</button></nav>
        {libraryVisited && <div hidden={mode !== "private"}><LocalKnowledge wordHost={wordHost} inWord={inWord} /></div>}<div hidden={mode !== "public"}><PublicKnowledge wordHost={wordHost} wordHostError={wordHostError} inWord={inWord} /></div>
    </div>;
}
