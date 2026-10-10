"use client";

import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import type { CourtOSText } from "@/app/lib/courtosLocale";
import { ResearchConversation } from "./ResearchConversation";
import { researchConversationMessages as CM } from "@/app/lib/researchConversationMessages";
import { emptyConversationSources, type ResearchConversationSources } from "@/app/lib/researchConversation";
import type { Citation } from "@/app/components/shared/types";
import { useLibrarySourcePaths } from "@/app/hooks/useLibrarySourcePaths";
import { sourcePickerMessages as P } from "@/app/lib/sourcePickerMessages";
import { SourceFolderBreadcrumbs, SourcePath, MixedSourceFolders } from "./SourceFolderNavigation";
import { researchMessages as M } from "@/app/lib/researchMessages";

import type { CaseReviewSource, ResearchHandoffState, ResearchHandoffPublicSource } from "@mike/contracts";
import { emptyResearchState, useResearchHandoff } from "./ResearchHandoffContext";
import { ResearchContinuation, ResearchContinuationStatus } from "./ResearchHandoffControls";
import { revalidateHandoffExcerpt } from "@/app/lib/researchHandoff";

import { ProcessingLocation } from "@/app/components/courtos/ProcessingLocation";

import { librarySourceUrl, selectedSourcePassage, originalTextSearchUrl, type SelectedSourcePassage } from "@/app/lib/sourceLinks";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/app/contexts/AuthContext";
import { prepareFrontierDraft } from "@/app/lib/frontierDraft";
import { useResearchModelPreference } from "@/app/lib/researchModelPreference";
import { getWordResearchDocumentScope, type WordResearchHost, type WordSourceCitation } from "@/app/lib/wordResearchHost";
import { BookOpen, Copy, ExternalLink, Search, X } from "lucide-react";
import { getLibrary, getLibraryFolderChildren, searchLibraryDocuments } from "@/app/lib/mikeApi";
import { panelDocumentFromCitation, type Document, type LibraryFolder, type DocumentCitation } from "@/app/components/shared/types";
import { KnowledgeApiError, getPublicDecision, publicSourceUrl, searchKnowledge, searchPublicKnowledge, type KnowledgeResult, type KnowledgeSearch, type PublicDecision, type PublicDecisionDetail, type PublicSearch } from "@/app/lib/knowledgeApi";

function DocumentLoading() { const { t } = useCourtOSLocale(); return <p role="status" className="p-6">{t(M.loadingDocument)}</p>; }
const DocumentContent = dynamic(() => import("@/app/components/shared/DocumentContent").then((module) => module.DocumentContent), { ssr: false, loading: DocumentLoading });
const button = "courtos-button";
const secondary = "courtos-button courtos-button--secondary";
const field = "courtos-field";
const link = "courtos-link";
const apiErrors: Record<string, CourtOSText> = { timeout: M.errorTimeout, busy: M.errorBusy, query: M.errorQuery, session: M.errorSession, changed: M.errorChanged, source: M.errorSource, capacity: M.errorCapacity, input: M.errorInput, unavailable: M.errorUnavailable };
const errorText = (error: unknown) => error instanceof KnowledgeApiError ? apiErrors[error.code] ?? M.errorUnavailable : M.errorUnavailable;

function CopySource({ text, label, wordHost, wordCitation }: { text: string; label: string; wordHost?: WordResearchHost | null; wordCitation: WordSourceCitation }) {
    const { t } = useCourtOSLocale();
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
        }}>{t(M.insertWord)}</button>{insertStatus === "inserted" && <p role="status" className="mt-2 text-xs">{t(M.insertedWord)}</p>}{insertStatus === "error" && <p role="alert" className="mt-2 text-xs">{t(M.insertUncertain)}</p>}</>}
        {status === "copied" && <p role="status" className="mt-2 text-xs text-muted-foreground">{t(M.copied)}</p>}
        {status === "manual" && <div className="mt-3"><p role="status" className="text-xs text-muted-foreground">{t(M.manualCopy)}</p><textarea aria-label={t(M.copyText)} readOnly rows={6} className={field} value={text} onFocus={(event) => event.currentTarget.select()} /></div>}
    </div>;
}

type Translate = ReturnType<typeof useCourtOSLocale>["t"];
function libraryExcerpt(hit: KnowledgeResult, t: Translate) {
    const url = typeof window !== "undefined" ? librarySourceUrl(window.location.origin, hit.document_id, hit.version_id, hit.page) : null;
    return `${hit.quote}\n\n${t(M.sourceLabel)}: ${hit.filename}, ${t(M.privatePinpoint,{version:hit.version_number??t(M.unnumbered),page:hit.page})}.${url ? `\n${t(M.privateSourceLink,{url})}` : ""}\n${t(M.privateSourceNote)}`;
}

function libraryWordCitation(hit: KnowledgeResult, t: Translate): WordSourceCitation {
    return {
        quote: hit.quote, source: hit.filename,
        pinpoint: t(M.privatePinpoint,{version:hit.version_number??t(M.unnumbered),page:hit.page}),
        sourceLabel: t(M.sourceLabel),
        sourceUrl: typeof window !== "undefined" ? librarySourceUrl(window.location.origin, hit.document_id, hit.version_id, hit.page) : null,
        notes: [t(M.privateSourceNote)],
    };
}

function publicWordCitation(decision: PublicDecision, excerpt: SelectedSourcePassage, originalSearch: string | null, t: Translate): WordSourceCitation {
    const date = decision.decision_date ? `${decision.decision_date}${decision.date_is_estimated ? ` (${t(M.copyEstimatedDate)})` : ""}` : null;
    const title = decisionTitle(decision);
    const titleParts = title.split(" · ");
    const metadata = [courtLabel(decision.court), decision.docket_number, date].filter(part => part && !titleParts.includes(part));
    return {
        quote: excerpt.text,
        source: [title, ...metadata].join(" · "),
        pinpoint: t(M.publicPinpoint,{start:excerpt.start,end:excerpt.end,total:excerpt.total_chars}),
        sourceLabel: t(M.sourceLabel), pinpointLinkLabel: t(M.searchPassage),
        sourceUrl: publicSourceUrl(decision.source_url) || publicSourceUrl(decision.pdf_url),
        pinpointUrl: originalSearch,
        notes: [`OpenCaseLaw-ID: ${decision.decision_id}. ${t(M.publicSourceNote)}`, ...(decision.source_note ? [t(M.publicSourceNotePrefix,{note:decision.source_note})] : [])],
    };
}

function publicReference(decision: PublicDecision, t: Translate) {
    const date = decision.decision_date ? `${decision.decision_date}${decision.date_is_estimated ? ` (${t(M.copyEstimatedDate)})` : ""}` : null;
    return [decisionTitle(decision), [courtLabel(decision.court), decision.docket_number, date].filter(Boolean).join(" · "), publicSourceUrl(decision.source_url) || publicSourceUrl(decision.pdf_url), `OpenCaseLaw-ID: ${decision.decision_id}`, decision.source_note ? t(M.publicSourceNotePrefix,{note:decision.source_note}) : null].filter(Boolean).join("\n");
}

function SourceDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
    const { t } = useCourtOSLocale();
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); }, []);
    return <dialog ref={ref} onCancel={onClose} onClose={onClose} aria-label={title} className="courtos-source-dialog">
        <div className="flex h-full min-h-0 flex-col">
            <header className="courtos-source-dialog-header"><h2>{title}</h2><ResearchContinuation /><button className={secondary} onClick={onClose} aria-label={t(M.closeSource)}><X size={18} aria-hidden="true" /></button></header>
            <ResearchContinuationStatus />
            {children}
        </div>
    </dialog>;
}

export function LocalSource({ result, onClose }: { result: KnowledgeResult & Partial<Pick<CaseReviewSource, "source_match" | "pdf_sha256" | "page_sha256" | "start" | "end">>; onClose: () => void }) {
    const { t } = useCourtOSLocale();
    // This passage is a literal, page-local substring returned by the
    // version-bound server index, not a quotation generated by a model.
    // Review/Citecheck results carry actual immutable PDF/page evidence. Ordinary
    // literal search lacks these hashes and must not acquire invented proof.
    const checked = result.source_match === "exact" && /^[a-f0-9]{64}$/i.test(result.pdf_sha256 ?? "") && /^[a-f0-9]{64}$/i.test(result.page_sha256 ?? "") &&
        Number.isSafeInteger(result.page) && result.page > 0 && Number.isSafeInteger(result.start) && Number.isSafeInteger(result.end) && result.start! >= 0 && result.end! - result.start! === Array.from(result.quote).length;
    const verification = checked ? { verified: true, version_id: result.version_id, pdf_sha256: result.pdf_sha256!, page_hashes: [{ page: result.page, sha256: result.page_sha256! }] } : { verified: true };
    const citation: DocumentCitation = { type: "citation_data", kind: "document", ref: 1, doc_id: result.document_id, document_id: result.document_id, version_id: result.version_id, version_number: result.version_number, filename: result.filename, page: result.page, quote: result.quote, verified: true, quotes: [{ page: result.page, quote: result.quote, verification }] };
    return <SourceDialog title={`${result.filename} · ${t(M.page, {page: result.page})}`} onClose={onClose}>
        <div className="min-h-0 flex-1"><DocumentContent document={panelDocumentFromCitation(citation)} mode={{ kind: "citation", citation }} canEdit={false} /></div>
    </SourceDialog>;
}

function LocalKnowledge({ wordHost, inWord, initialState, onState, conversationLocked }: { wordHost?: WordResearchHost | null; inWord?: boolean; initialState: ResearchHandoffState["private"]; onState(state: ResearchHandoffState["private"], ready: boolean): void; conversationLocked?: boolean }) {
    const { t } = useCourtOSLocale();
    const edited = useResearchHandoff()?.edited;
    const [documents, setDocuments] = useState<Document[]>([]);
    const [selected, setSelected] = useState<Document[]>(() => initialState.selected.map(doc => ({ ...doc, current_version_id: doc.active_version_id, status: "ready", project_id: null, storage_path: null, pdf_storage_path: null, page_count: null, structure_tree: null, created_at: null })));
    const [folders, setFolders] = useState<LibraryFolder[]>([]);
    const [folderPath, setFolderPath] = useState<LibraryFolder[]>([]);
    const folderId = folderPath.at(-1)?.id;
    const [filename, setFilename] = useState("");
    const [filter, setFilter] = useState("");
    const [refresh, setRefresh] = useState(0);
    const {paths, remember} = useLibrarySourcePaths([...selected, ...documents], refresh);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingDocuments, setLoadingDocuments] = useState(true);
    const [listError, setListError] = useState<CourtOSText | null>(null);
    const [query, setQuery] = useState(initialState.query);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState<CourtOSText | null>(null);
    const [result, setResult] = useState<KnowledgeSearch | null>(initialState.result);
    const [submitted, setSubmitted] = useState(initialState.submitted);
    const [source, setSource] = useState<KnowledgeResult | null>(initialState.source);
    useEffect(() => {
        onState({ query, submitted, selected: selected.map(doc => ({ id: doc.id, filename: doc.filename, file_type: doc.file_type ?? null, active_version_id: doc.current_version_id ?? null, active_version_number: doc.active_version_number ?? null, size_bytes: doc.size_bytes ?? null })), result, source }, selected.every(doc => doc.status === "ready"));
    }, [query, submitted, selected, result, source, onState]);
    const searchController = useRef<AbortController | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        setLoadingDocuments(true); setListError(null);
        const request = filter ? searchLibraryDocuments("files", { search: filter, limit: 20, offset, sortKey: "name", sortDirection: "asc", signal: controller.signal }) : folderId ? getLibraryFolderChildren("files", folderId, { limit: 20, offset }) : getLibrary("files", { limit: 20, offset });
        request.then((data) => { if (!controller.signal.aborted) { if (!filter) remember(data.documents, folderPath); setDocuments(data.documents); setFolders("folders" in data ? data.folders as LibraryFolder[] : []); setHasMore(data.documentsHasMore); } })
            .catch(() => { if (!controller.signal.aborted) setListError(M.libraryFailed); })
            .finally(() => { if (!controller.signal.aborted) setLoadingDocuments(false); });
        return () => controller.abort();
    }, [filter, offset, refresh, folderId, remember]);
    useEffect(() => () => searchController.current?.abort(), []);
    function changeSelection(doc: Document) {
        edited?.();
        searchController.current?.abort(); setSearching(false); setResult(null); setSearchError(null);
        setSelected((previous) => previous.some((item) => item.id === doc.id) ? previous.filter((item) => item.id !== doc.id) : [...previous, doc]);
    }
    async function search(event: FormEvent) {
        event.preventDefault();
        if (!selected.length || !query.trim() || searching) return;
        edited?.();
        const controller = new AbortController(); searchController.current?.abort(); searchController.current = controller;
        setSearching(true); setSearchError(null); setResult(null); setSubmitted(query.trim());
        try { const data = await searchKnowledge(query.trim(), selected.map((doc) => doc.id), controller.signal); if (!controller.signal.aborted) setResult(data); }
        catch (error) { if (!controller.signal.aborted) setSearchError(errorText(error)); }
        finally { if (!controller.signal.aborted) setSearching(false); }
    }
    return <section aria-labelledby="private-knowledge-title" className="courtos-private-workspace">
        <h2 id="private-knowledge-title" className="sr-only">{t(M.ownSources)}</h2>
        <ProcessingLocation service="library" className="mt-3">{t(M.localSearchLocation)}</ProcessingLocation>
        <div className="mt-5 flex flex-wrap gap-5"><Link href={inWord ? "/library?host=word" : "/library"} target={inWord ? undefined : "_blank"} rel="noopener noreferrer" className={link}>{t(M.addDocuments)} <ExternalLink size={14} aria-hidden="true" /></Link><button className={link} onClick={() => setRefresh((value) => value + 1)}>{t(M.refreshLibrary)}</button></div>
        <div className="courtos-library-grid">
            <div className="courtos-source-list">
                <h3 className="font-medium">{t(M.selectSources)}</h3>
                {conversationLocked && <p className="mt-2 text-xs">{t(CM.sourceChange)}</p>}
                <form className="mt-3" onSubmit={(event) => { event.preventDefault(); setFilter(filename.trim()); setOffset(0); setRefresh((value) => value + 1); }}><label htmlFor="library-filter" className="text-sm">{t(M.filename)}</label><div className="flex items-end gap-2"><input id="library-filter" className={field} value={filename} maxLength={200} onChange={(event) => setFilename(event.target.value)} /><button className={secondary} aria-label={t(M.filterFilenames)}><Search size={17} aria-hidden="true" /></button></div></form>
                {filter ? <div className="my-3 text-xs"><p>{t(P.searchScope)}</p><button type="button" className="courtos-link min-h-11" onClick={() => {setFilter("");setFilename("");setOffset(0);}}>{t(P.clearSearch)}</button></div> : <SourceFolderBreadcrumbs path={folderPath} onChange={path => {setFolderPath(path);setOffset(0);}} />}
                <p className="mt-4 text-xs text-muted-foreground" role="status">{t(M.selectedCount, {count: selected.length})}</p>
                {selected.length > 0 && <div className="mt-2 space-y-1" aria-label={t(M.selectedDocuments)}>{selected.map((doc) => <button key={doc.id} className="flex w-full items-center justify-between gap-2 rounded-lg bg-app-surface-active px-2 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring" disabled={conversationLocked} onClick={() => changeSelection(doc)} aria-label={t(M.removeSelected, {name: doc.filename})}><span className="min-w-0 break-words">{doc.filename}<SourcePath path={paths[doc.id]} /></span><X size={14} className="shrink-0" aria-hidden="true" /></button>)}</div>}
                <MixedSourceFolders ids={selected.map(doc => doc.id)} paths={paths} />
                {loadingDocuments ? <p className="mt-5 text-sm" role="status">{t(M.loadingLibrary)}</p> : listError ? <p className="mt-5 text-sm" role="alert">{listError && t(listError)}</p> : <>
                    {!!folders.length && <ul aria-label={t(CM.folders)} className="mt-3 divide-y divide-border">{folders.map(folder => <li key={folder.id}><button type="button" className="courtos-link min-h-11 w-full py-3 text-left" onClick={() => { setFolderPath(path => [...path, folder]); setOffset(0); }}>{folder.name}</button></li>)}</ul>}
                    {!documents.length && !folders.length && <p className="mt-5 text-sm leading-relaxed">{filter ? t(M.noFilename) : t(M.noDocuments)}</p>}
                    <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">{documents.map((doc) => { const checked = selected.some((item) => item.id === doc.id); return <li key={doc.id}><label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-foreground" checked={checked} disabled={conversationLocked || !checked && selected.length >= 20} onChange={() => changeSelection(doc)} /><span className="min-w-0 break-all">{doc.filename}<SourcePath path={paths[doc.id]} /><span className="mt-1 block text-xs text-muted-foreground">{doc.active_version_number ? t(M.version, {number: doc.active_version_number}) : t(M.currentVersion)}</span></span></label></li>; })}</ul>
                    <div className="mt-3 flex items-center justify-between gap-2"><button className={secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>{t(M.back)}</button><span className="text-xs">{t(M.page, {page: offset / 20 + 1})}</span><button className={secondary} disabled={!hasMore} onClick={() => setOffset(offset + 20)}>{t(M.next)}</button></div>
                </>}
            </div>
            <div>
                <form onSubmit={search} className="courtos-search-form">
                    <h3 className="font-medium">{t(M.textSearch)}</h3>
                    <label htmlFor="private-query" className="mt-4 block text-sm">{t(M.terms)}</label><textarea id="private-query" className={field} rows={3} maxLength={300} value={query} onChange={(event) => { edited?.(); setQuery(event.target.value); }} aria-describedby="private-search-help" />
                    <p id="private-search-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">{t(M.scanHelp)}</p>
                    <button className={`${button} mt-4`} disabled={searching || selected.length === 0 || !query.trim()}><Search size={16} aria-hidden="true" />{searching ? t(M.searchingPassages) : t(M.searchSelection)}</button>
                </form>
                {searching && <p role="status" className="mt-4 text-sm">{t(M.localSearchRunning)}</p>}
                {searchError && <p role="alert" className="mt-5 text-sm">{searchError && t(searchError)}</p>}
                {result && <section aria-label={t(M.localResults)} className="mt-7"><h3 className="font-serif text-xl">{t(M.passageCount, {count: result.results.length, query: submitted})}</h3>
                    {result.notices.map((notice, index) => <p key={index} className="mt-2 text-sm leading-relaxed">{notice}</p>)}
                    <details className="mt-4 rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer">{t(M.coverage)}</summary><ul className="mt-3 space-y-2">{result.documents.map((doc) => <li key={doc.document_id} className="break-words"><strong className="font-medium">{selected.find((item) => item.id === doc.document_id)?.filename ?? t(M.document)}</strong>: {doc.index_status === "ready" ? t(M.textReady) : doc.index_status === "partial" ? t(M.textPartial) : t(M.textUnreadable)} · {t(M.pagesCoverage, {indexed: doc.indexed_pages, total: doc.total_pages})}</li>)}</ul></details>
                    {result.results.length === 0 && <p className="mt-4 text-sm leading-relaxed">{t(M.noPassage)}</p>}
                    <ol className="mt-4 space-y-4">{result.results.map((hit, index) => <li key={`${hit.document_id}-${hit.version_id}-${hit.page}-${index}`} className="courtos-source-hit"><div className="courtos-source-meta">{hit.filename} · {t(M.versionPage, {version: hit.version_number ?? t(M.unnumbered), page: hit.page})}<SourcePath path={paths[hit.document_id]} /></div><blockquote className="mt-3 whitespace-pre-wrap break-words font-serif text-base leading-relaxed">{hit.quote}</blockquote><div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3"><button className={link} onClick={() => { edited?.(); setSource(hit); }}>{t(M.openEvidence)} <BookOpen size={15} aria-hidden="true" /></button><CopySource text={libraryExcerpt(hit,t)} label={t(M.copyPassage)} wordHost={wordHost} wordCitation={libraryWordCitation(hit,t)} /></div></li>)}</ol>
                </section>}
            </div>
        </div>
        {source && <LocalSource result={source} onClose={() => { edited?.(); setSource(null); }} />}
    </section>;
}

function OriginalLinks({ decision }: { decision: PublicDecision }) {
    const { t } = useCourtOSLocale();
    const source = publicSourceUrl(decision.source_url); const pdf = publicSourceUrl(decision.pdf_url);
    return <div className="flex flex-wrap gap-x-5">{source && <a href={source} target="_blank" rel="noopener noreferrer" className={link}>{t(M.wholeOriginal)} <ExternalLink size={14} aria-hidden="true" /></a>}{pdf && pdf !== source && <a href={pdf} target="_blank" rel="noopener noreferrer" className={link}>{t(M.wholePdf)} <ExternalLink size={14} aria-hidden="true" /></a>}</div>;
}
// Only known source identifiers are expanded. Unknown metadata is displayed as supplied.
function courtLabel(court: string | null | undefined) {
    const known: Record<string, string> = { bger: "Bundesgericht", bge: "Bundesgericht", zh_verwaltungsgericht: "Verwaltungsgericht Zürich", ow_gerichte: "Gerichte Obwalden", lu_gerichte: "Gerichte Luzern", ag_gerichte: "Gerichte Aargau" };
    return court ? known[court] ?? court.replaceAll("_", " ") : "";
}
function handoffDecision(decision: PublicDecision): PublicDecision {
    return { decision_id: decision.decision_id, court: decision.court ?? null, canton: decision.canton ?? null, docket_number: decision.docket_number ?? null, decision_date: decision.decision_date ?? null, language: decision.language ?? null, title: decision.title ?? null, source_url: decision.source_url ?? null, pdf_url: decision.pdf_url ?? null, content_hash: decision.content_hash ?? null, scraped_at: decision.scraped_at ?? null, date_is_estimated: decision.date_is_estimated ?? null, source_note: decision.source_note ?? null, snippet: decision.snippet ?? "" };
}
function decisionTitle(decision: PublicDecision) { return decision.title || [courtLabel(decision.court), decision.docket_number].filter(Boolean).join(" · ") || decision.decision_id; }

function PublicSource({ decision, onClose, wordHost, inWord, initialState, onState, onConversation, initialCitation, conversationLocked }: { decision: PublicDecision; onClose: () => void; wordHost?: WordResearchHost | null; inWord?: boolean; initialState?: ResearchHandoffPublicSource; onState(state: ResearchHandoffPublicSource): void; onConversation?(source: ResearchHandoffPublicSource): void; initialCitation?: Extract<Citation, { kind: "public_decision" }>; conversationLocked?: boolean }) {
    const { t } = useCourtOSLocale();
    const { user } = useAuth();
    const edited = useResearchHandoff()?.edited;
    const [handoffError, setHandoffError] = useState<CourtOSText | null>(null);
    const sourceText = useRef<HTMLPreElement>(null);
    const [excerpt, setExcerpt] = useState<SelectedSourcePassage | null>(null);
    const [selectionError, setSelectionError] = useState<CourtOSText | null>(null);
    const { model } = useResearchModelPreference(user?.id, !inWord);
    const [detail, setDetail] = useState<PublicDecisionDetail | null>(null);
    const [start, setStart] = useState(initialState?.start ?? 0); const [history, setHistory] = useState<number[]>(initialState?.history ?? []);
    const restoreSource = useRef(initialState);
    const [loading, setLoading] = useState(true); const [error, setError] = useState<CourtOSText | null>(null); const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController(); setLoading(true); setError(null); setExcerpt(null); setSelectionError(null); setHandoffError(null);
        getPublicDecision(decision.decision_id, start, controller.signal).then((data) => {
            if (controller.signal.aborted) return;
            if (initialCitation) {
                const offset = initialCitation.start - data.passage.start;
                const quote = Array.from(data.passage.text).slice(offset, offset + initialCitation.end - initialCitation.start).join("");
                if (data.decision_id !== initialCitation.decision_id || (start === initialCitation.start && (offset < 0 || quote !== initialCitation.quote)) ||
                    (initialCitation.content_hash !== null && data.content_hash !== initialCitation.content_hash)) {
                    setError(M.errorChanged); return;
                }
                if (start === initialCitation.start) setExcerpt({ text: quote, start: initialCitation.start, end: initialCitation.end, total_chars: data.passage.total_chars });
            }
            setDetail(data);
            const restored = restoreSource.current; restoreSource.current = undefined;
            if (restored?.excerpt) {
                const valid = revalidateHandoffExcerpt(restored, data);
                if (valid) setExcerpt(valid);
                else setSelectionError(M.restoreExcerptFailed);
            }
        }).catch((problem) => { if (!controller.signal.aborted) setError(errorText(problem)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [decision.decision_id, start, retry, initialCitation]);
    const authoritative = detail ?? decision;
    useEffect(() => {
        // Transferred excerpts remain inert until the exact source window is freshly fetched.
        if (!loading) onState({ decision: handoffDecision(authoritative), start, history, excerpt });
    }, [authoritative, start, history, excerpt, loading, onState]);
    const originalSearch = detail && excerpt ? originalTextSearchUrl(publicSourceUrl(detail.source_url), publicSourceUrl(detail.pdf_url), excerpt.text) : null;
    const excerptReference = detail && excerpt ? `${publicReference(detail,t)}\n${t(M.selectedPinpoint,{start:excerpt.start,end:excerpt.end,total:excerpt.total_chars})}${originalSearch ? `\n${t(M.originalPassageLink,{url:originalSearch})}` : ""}\n${t(M.publicSourceNote)}` : "";
    return <SourceDialog title={decisionTitle(authoritative)} onClose={onClose}><div className="courtos-source-reading">
        <p className="text-sm text-muted-foreground">{[courtLabel(authoritative.court), authoritative.docket_number, authoritative.decision_date, authoritative.language?.toUpperCase()].filter(Boolean).join(" · ")}</p><OriginalLinks decision={authoritative} />
        {loading ? <p role="status" className="mt-6">{t(M.loadingDecision)}</p> : error ? <div role="alert" className="mt-6"><p>{error && t(error)}</p><button className={`${secondary} mt-3`} onClick={() => setRetry((value) => value + 1)}>{t(M.retry)}</button></div> : detail && <>
            {detail.date_is_estimated && <p className="mt-4 text-sm text-muted-foreground">{t(M.estimatedDate)}</p>}
            {detail.source_note && <p className="mt-4 text-sm text-muted-foreground">{t(M.sourceNote, {note: detail.source_note})}</p>}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{t(M.positions, {start: detail.passage.start, end: detail.passage.end, total: detail.passage.total_chars})}</p>
            <p className="mt-3 text-sm">{t(M.selectPassage)}</p>
            <pre ref={sourceText} tabIndex={0} aria-label={t(M.decisionText)} className="courtos-decision-text">{detail.passage.text}</pre>
            <button type="button" className={secondary} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                const selected = selectedSourcePassage(sourceText.current, window.getSelection(), detail.passage);
                if (!selected) { setExcerpt(null); setSelectionError(M.selectPassageError); return; }
                edited?.(); setExcerpt(selected); setSelectionError(null); setHandoffError(null);
            }}>{t(M.useSelection)}</button>
            {selectionError && <p role="alert" className="mt-3 text-sm">{selectionError && t(selectionError)}</p>}
            {excerpt && <div className="mt-5 border-t border-border pt-4" aria-label={t(M.selectedPassage)}>
                <blockquote className="whitespace-pre-wrap text-sm leading-relaxed">{excerpt.text}</blockquote>
                <p className="mt-2 text-xs text-muted-foreground">{t(M.positionUnverified, {start: excerpt.start, end: excerpt.end})}</p>
                {originalSearch && <><a className={`${link} mt-3`} href={originalSearch} target="_blank" rel="noopener noreferrer">{t(M.findOriginal)}</a><p className="mt-2 text-xs text-muted-foreground">{t(M.jumpDepends)}</p></>}
                {!originalSearch && <p className="mt-2 text-xs text-muted-foreground">{t(M.noJump)}</p>}
                <div className="mt-3"><CopySource text={`${excerpt.text}\n\nQuelle: ${excerptReference}`} label={t(M.copySelected)} wordHost={wordHost} wordCitation={publicWordCitation(detail, excerpt, originalSearch,t)} /></div>
            </div>}
            {excerpt && <div className="courtos-source-ai">
                {onConversation && <button type="button" className={button} disabled={!user?.id || conversationLocked} title={conversationLocked ? t(CM.sourceChange) : undefined} onClick={() => onConversation({ decision: handoffDecision(detail), start, history, excerpt })}>{t(CM.useSource)}</button>}
                {onConversation && conversationLocked && <p className="mt-2 text-xs">{t(CM.sourceChange)}</p>}
                <ProcessingLocation service="gemma" stage="draft" className="mt-3" />
                {!inWord && model !== "gemma" && <button type="button" className={`${secondary} mt-3`} disabled={!user?.id} onClick={() => {
                    if (!user?.id) return;
                    if (prepareFrontierDraft(user.id, [excerptReference, excerpt.text].join("\n\n"))) window.location.assign("/hybrid/");
                    else setHandoffError(M.frontierDraftFailed);
                }}>{t(M.checkOpus)}</button>}
                {!inWord && model !== "gemma" && <ProcessingLocation service="anthropic" stage="draft" className="mt-3" />}
                {handoffError && <p role="alert">{t(handoffError)}</p>}
            </div>}
            <div className="mt-6 flex flex-wrap gap-3"><button className={secondary} disabled={!history.length} onClick={() => { edited?.(); setStart(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); }}>{t(M.previousSection)}</button><button className={secondary} disabled={!detail.passage.has_more} onClick={() => { edited?.(); setHistory((items) => [...items, start]); setStart(detail.passage.end); }}>{t(M.nextSection)}</button></div>
            <details className="mt-6 text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer">{t(M.provenance)}</summary><p className="mt-2 break-all">OpenCaseLaw-ID: {detail.decision_id}<br />{t(M.captured, {date: detail.scraped_at || t(M.notGiven)})}<br />{t(M.textHash, {hash: detail.content_hash || t(M.notGiven)})}</p></details>
        </>}
    </div></SourceDialog>;
}

function PublicKnowledge({ wordHost, wordHostError, inWord, initialState, onState, onConversation, conversationLocked }: { wordHost?: WordResearchHost | null; wordHostError?: string; inWord?: boolean; initialState: ResearchHandoffState["public"]; onState(state: ResearchHandoffState["public"]): void; onConversation(source: ResearchHandoffPublicSource): void; conversationLocked?: boolean }) {
    const { t } = useCourtOSLocale();
    const edited = useResearchHandoff()?.edited;
    const [selectionError, setSelectionError] = useState<CourtOSText | null>(null);
    const [readingSelection, setReadingSelection] = useState(false);
    const [query, setQuery] = useState(initialState.query); const [language, setLanguage] = useState<ResearchHandoffState["public"]["language"]>(initialState.language);
    const [result, setResult] = useState<PublicSearch | null>(initialState.result); const [submitted, setSubmitted] = useState(initialState.submitted);
    const [searching, setSearching] = useState(false); const [error, setError] = useState<CourtOSText | null>(null); const [source, setSource] = useState<PublicDecision | null>(initialState.source?.decision ?? null);
    const sourceState = useRef<ResearchHandoffPublicSource | null>(initialState.source);
    const publishSource = useCallback((value: ResearchHandoffPublicSource) => { sourceState.current = value; onState({ query, submitted, language, result, source: value }); }, [query, submitted, language, result, onState]);
    useEffect(() => { onState({ query, submitted, language, result, source: source ? sourceState.current : null }); }, [query, submitted, language, result, source, onState]);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    async function search(event: FormEvent) {
        event.preventDefault(); if (!query.trim() || searching) return;
        edited?.();
        controller.current?.abort(); const pending = new AbortController(); controller.current = pending; setSearching(true); setError(null); setResult(null); setSubmitted(query.trim());
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
                <label htmlFor="public-query">{t(CM.publicTerms)}</label>
                <div className="courtos-search-line">
                    <input id="public-query" placeholder={t(M.legalTerms)} className={field} value={query} maxLength={180} onChange={(event) => { edited?.(); setQuery(event.target.value); }} aria-describedby="public-search-help" />
                    <button className={button} disabled={searching || !query.trim()}><Search size={17} aria-hidden="true" />{searching ? t(M.searching) : t(M.search)}</button>
                </div>
                <div className="courtos-search-options">
                    <p id="public-search-help">{t(M.aiSearchHelp)}</p>
                    <label htmlFor="public-language"><span className="sr-only">{t(M.language)}</span><select id="public-language" value={language} onChange={(event) => { edited?.(); controller.current?.abort(); setLanguage(event.target.value as ResearchHandoffState["public"]["language"]); setSearching(false); setResult(null); setError(null); }} className={field}><option value="">{t(M.allLanguages)}</option><option value="de">{t(M.german)}</option><option value="fr">{t(M.french)}</option><option value="it">{t(M.italian)}</option></select></label>
                </div>
                <ProcessingLocation service="opencaselaw">{t(M.publicConsent)}</ProcessingLocation>
                {inWord && <div className="courtos-word-selection"><button type="button" className={link} disabled={!wordHost || readingSelection} onClick={async () => {
                    if (!wordHost) return;
                    setReadingSelection(true); setSelectionError(null);
                    try {
                        const selected = (await wordHost.readSelection()).trim();
                        if (!selected || selected.length > 180 || selected.split(/\s+/).length > 8) { setSelectionError(M.wordSelectionLimit); return; }
                        edited?.(); setQuery(selected);
                    } catch { setSelectionError(M.wordSelectionFailed); }
                    finally { setReadingSelection(false); }
                }}>{readingSelection ? t(M.readingSelection) : t(M.readWord)}</button>{(selectionError || wordHostError) && <p role="alert">{selectionError ? t(selectionError) : wordHostError}</p>}</div>}
                {searching && <p role="status" className="courtos-search-state">{t(M.publicRunning)}</p>}
                {error && <p role="alert" className="courtos-search-state courtos-search-state--error">{error && t(error)}</p>}
            </form>
        </div>
        {result && <section className="courtos-public-results" aria-label={t(M.publicResults)}>
            <header className="courtos-results-heading">
                <h3>{t(M.decisionCount, {count: result.results.length, query: submitted})}</h3>
                <details className="courtos-result-scope"><summary>{t(M.searchScope)}</summary><p>{t(M.publicScope, {candidate: result.candidate_limit ? t(M.candidateScope, {count: result.candidate_limit}) : ""})}</p></details>
            </header>
            {!result.results.length && <p className="courtos-empty-results">{t(M.noDecisions)}</p>}
            {result.degraded && <p className="courtos-search-state">{t(M.degraded)}</p>}
            <ol className="courtos-public-result-list">{result.results.map((decision) => <li key={decision.decision_id} className="courtos-public-result">
                <p className="courtos-result-meta"><span>{[courtLabel(decision.court), decision.canton].filter(Boolean).join(" · ")}</span>{" "}<span>{[decision.decision_date, decision.language?.toUpperCase()].filter(Boolean).join(" · ")}</span></p>
                <div className="courtos-result-content">
                    <h4>{decisionTitle(decision)}</h4>
                    <p className="courtos-result-excerpt">{decision.snippet}</p>
                    <div className="courtos-result-actions"><button className={link} onClick={() => { edited?.(); sourceState.current = { decision, start: 0, history: [], excerpt: null }; setSource(decision); }}>{t(M.openDecision)} <BookOpen size={15} aria-hidden="true" /></button><OriginalLinks decision={decision} /></div>
                </div>
            </li>)}</ol>
            <p className="courtos-results-generation">OpenCaseLaw · {t(result.query_mode === "opencaselaw_ai" ? M.aiSearch : M.publicSearch)} · {t(M.dataset, {id: result.database_generation ?? t(M.notGiven)})}</p>
        </section>}
        {source && <PublicSource key={source.decision_id} decision={source} onClose={() => { edited?.(); sourceState.current = null; setSource(null); }} wordHost={wordHost} inWord={inWord} initialState={sourceState.current ?? undefined} onState={publishSource} conversationLocked={conversationLocked} onConversation={value => { onConversation(value); setSource(null); }} />}
    </section>;
}

export function KnowledgeWorkspace({ wordHost, wordHostError }: { wordHost?: WordResearchHost | null; wordHostError?: string } = {}) {
    const { t } = useCourtOSLocale();
    const { user } = useAuth();
    const inWord = wordHost !== undefined;
    const handoff = useResearchHandoff();
    const register = handoff?.register, changed = handoff?.changed, bindWordDocument = handoff?.bindWordDocument;
    useEffect(() => {
        if (!wordHost || !bindWordDocument) return;
        let cancelled = false;
        void getWordResearchDocumentScope().then(scope => { if (!cancelled) bindWordDocument(scope); });
        return () => { cancelled = true; };
    }, [wordHost, bindWordDocument]);
    const state = useRef<ResearchHandoffState>(emptyResearchState());
    const [restored, setRestored] = useState({ state: emptyResearchState(), generation: 0 });
    const [mode, setMode] = useState<"private" | "public">("public");
    const [libraryVisited, setLibraryVisited] = useState(false);
    const [candidate, setCandidate] = useState<ResearchConversationSources>(emptyConversationSources);
    const [conversationLocked, setConversationLocked] = useState(false);
    const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
    const pinnedPublic = useRef<ResearchHandoffPublicSource | null>(null);
    const privateCandidate = useRef<ResearchConversationSources>(emptyConversationSources());
    const sourceTools = useRef<HTMLDivElement>(null);
    const publishConversation = useCallback((conversation: NonNullable<ResearchHandoffState["conversation"]>) => { state.current = { ...state.current, conversation }; changed?.(state.current); }, [changed]);
    const conversationEdited = useCallback(() => { handoff?.edited(); }, [handoff?.edited]);
    function sourcesFromPrivate(value: ResearchHandoffState["private"]): ResearchConversationSources {
        return { files: value.selected.map(doc => ({ filename: doc.filename, document_id: doc.id, version_id: doc.active_version_id, version_number: doc.active_version_number })), public_sources: [] };
    }
    function sourcesFromPublic(source: ResearchHandoffPublicSource | null): ResearchConversationSources {
        return source?.excerpt ? { files: [], public_sources: [{ decision_id: source.decision.decision_id, start: source.excerpt.start, end: source.excerpt.end, content_hash: source.decision.content_hash }] } : emptyConversationSources();
    }
    function combinedSources(privateSources = privateCandidate.current, publicSource = pinnedPublic.current): ResearchConversationSources {
        return { files: privateSources.files, public_sources: sourcesFromPublic(publicSource).public_sources };
    }
    function usePublicForConversation(source: ResearchHandoffPublicSource) {
        if (conversationLocked) return;
        pinnedPublic.current = source;
        state.current = { ...state.current, public: { ...state.current.public, source } }; changed?.(state.current);
        setCandidate(combinedSources());
        window.setTimeout(() => document.getElementById("research-question")?.focus(), 0);
    }
    function removePublicSource() {
        if (conversationLocked) return;
        handoff?.edited(); pinnedPublic.current = null;
        state.current = { ...state.current, public: { ...state.current.public, source: null } };
        setCandidate(combinedSources()); changed?.(state.current);
    }
    const publishPublic = useCallback((value: ResearchHandoffState["public"]) => { state.current = { ...state.current, public: { ...value, source: value.source ?? pinnedPublic.current } }; changed?.(state.current); }, [changed]);
    const publishPrivate = useCallback((value: ResearchHandoffState["private"], ready: boolean) => { state.current = { ...state.current, private: value }; const next = sourcesFromPrivate(value); if (!ready) next.files = next.files.map(file => ({ ...file, version_id: null })); privateCandidate.current = next; setCandidate(combinedSources(next)); changed?.(state.current); }, [changed]);
    useEffect(() => register?.({
        getState: () => !state.current.conversation?.chat_id && pinnedPublic.current ? { ...state.current, public: { ...state.current.public, source: pinnedPublic.current } } : state.current,
        applyState: next => {
            state.current = next; setMode(next.mode); privateCandidate.current = sourcesFromPrivate(next.private); pinnedPublic.current = next.public.source; setCandidate(combinedSources());
            setLibraryVisited(next.mode === "private" || !!next.private.selected.length || !!next.private.result);
            setRestored(current => ({ state: next, generation: current.generation + 1 }));
        },
    }), [register]);
    function changeMode(next: "private" | "public") {
        if (next !== mode) handoff?.edited();
        setMode(next); if (next === "private") setLibraryVisited(true);
        state.current = { ...state.current, mode: next }; changed?.(state.current);
    }
    return <div className="courtos-research-page">
        <h1 className="sr-only">{t(M.research)}</h1>
        {user?.id && <ResearchConversation key={`${user.id}:${restored.generation}`} owner={user.id} candidate={candidate} initialState={restored.state.conversation} onState={publishConversation} onTransferReady={handoff?.setTransferReady} onBinding={setConversationLocked} onRemovePublicSource={removePublicSource} onEdit={conversationEdited} onCitation={setActiveCitation} onFindSources={next => { changeMode(next); sourceTools.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
        <div ref={sourceTools} className="courtos-conversation-source-tools"><h2>{t(CM.sourceTools)}</h2>
        <nav aria-label={t(M.sourceType)} className="courtos-source-tabs"><button aria-pressed={mode === "public"} className="courtos-source-tab" onClick={() => changeMode("public")}>OpenCaseLaw</button><button aria-pressed={mode === "private"} className="courtos-source-tab" onClick={() => changeMode("private")}>{t(M.ownSources)}</button></nav>
        <div key={restored.generation}>
            {libraryVisited && <div hidden={mode !== "private"}><LocalKnowledge wordHost={wordHost} inWord={inWord} initialState={restored.state.private} onState={publishPrivate} conversationLocked={conversationLocked} /></div>}
            <div hidden={mode !== "public"}><PublicKnowledge wordHost={wordHost} wordHostError={wordHostError} inWord={inWord} initialState={restored.state.public} onState={publishPublic} onConversation={usePublicForConversation} conversationLocked={conversationLocked} /></div>
        </div>
        </div>
        {activeCitation && activeCitation.kind !== "public_decision" && <SourceDialog title={activeCitation.kind === "case" ? activeCitation.case_name ?? "Original" : activeCitation.filename} onClose={() => setActiveCitation(null)}><div className="min-h-0 flex-1"><DocumentContent document={panelDocumentFromCitation(activeCitation)} mode={{ kind: "citation", citation: activeCitation }} canEdit={false} /></div></SourceDialog>}
        {activeCitation?.kind === "public_decision" && <PublicSource key={`${activeCitation.decision_id}:${activeCitation.start}`} decision={handoffDecision({ ...activeCitation, snippet: "", court: null, canton: null, docket_number: null, decision_date: null, language: null, scraped_at: null })} initialState={{ decision: handoffDecision({ ...activeCitation, snippet: "", court: null, canton: null, docket_number: null, decision_date: null, language: null, scraped_at: null }), start: activeCitation.start, history: [], excerpt: null }} initialCitation={activeCitation} onState={() => undefined} onClose={() => setActiveCitation(null)} wordHost={wordHost} inWord={inWord} />}
    </div>;
}
