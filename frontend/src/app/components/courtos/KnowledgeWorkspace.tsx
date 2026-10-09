"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { prepareKnowledgeDraft } from "@/app/lib/knowledgeDraft";
import { BookOpen, ExternalLink, Search, X } from "lucide-react";
import { searchLibraryDocuments } from "@/app/lib/mikeApi";
import { panelDocumentFromCitation, type Document, type DocumentCitation } from "@/app/components/shared/types";
import { getPublicDecision, publicSourceUrl, searchKnowledge, searchPublicKnowledge, type KnowledgeResult, type KnowledgeSearch, type PublicDecision, type PublicDecisionDetail, type PublicSearch } from "@/app/lib/knowledgeApi";

const DocumentContent = dynamic(() => import("@/app/components/shared/DocumentContent").then((module) => module.DocumentContent), { ssr: false, loading: () => <p role="status" className="p-6">Dokument wird geöffnet…</p> });
const button = "courtos-button";
const secondary = "courtos-button courtos-button--secondary";
const field = "courtos-field";
const link = "courtos-link";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Das Laden ist fehlgeschlagen. Bitte versuchen Sie es erneut.";

function SourceDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { ref.current?.showModal(); }, []);
    return <dialog ref={ref} onCancel={onClose} onClose={onClose} aria-label={title} className="courtos-source-dialog m-auto h-[92dvh] max-h-[920px] w-[96vw] max-w-5xl overflow-hidden border border-border bg-background p-0 text-foreground">
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3"><h2 className="min-w-0 truncate font-serif text-xl">{title}</h2><button className={secondary} onClick={onClose} aria-label="Quelle schliessen"><X size={18} aria-hidden="true" /></button></header>
            {children}
        </div>
    </dialog>;
}

function LocalSource({ result, onClose }: { result: KnowledgeResult; onClose: () => void }) {
    const citation: DocumentCitation = { type: "citation_data", kind: "document", ref: 1, doc_id: result.document_id, document_id: result.document_id, version_id: result.version_id, version_number: result.version_number, filename: result.filename, page: result.page, quote: result.quote };
    return <SourceDialog title={`${result.filename} · Seite ${result.page}`} onClose={onClose}>
        <div className="min-h-0 flex-1"><DocumentContent document={panelDocumentFromCitation(citation)} mode={{ kind: "citation", citation }} canEdit={false} /></div>
    </SourceDialog>;
}

function LocalKnowledge() {
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
    return <section aria-labelledby="private-knowledge-title" className="mt-7">
        <h2 id="private-knowledge-title" className="font-serif text-2xl">In eigenen Quellen eine Stelle finden</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">Wählen Sie bis zu 20 persönliche Bibliotheksdokumente. Benennen Sie Literatur mit Autor, Kurztitel, Auflage/Jahr und Seiten. Die Suche arbeitet mit deren extrahiertem Text auf dem CourtOS-Server in Deutschland. Sie erzeugt keine Antwort und ruft kein Sprachmodell auf.</p>
        <div className="mt-5 flex flex-wrap gap-5"><Link href="/library" className={link}>Dokumente in die Bibliothek aufnehmen <ExternalLink size={14} aria-hidden="true" /></Link><button className={link} onClick={() => setRefresh((value) => value + 1)}>Bestand aktualisieren</button></div>
        <div className="mt-7 grid items-start gap-8 xl:grid-cols-[minmax(250px,1fr)_minmax(0,1.7fr)]">
            <div className="courtos-source-list">
                <h3 className="font-medium">1. Quellen auswählen</h3>
                <form className="mt-3" onSubmit={(event) => { event.preventDefault(); setFilter(filename.trim()); setOffset(0); setRefresh((value) => value + 1); }}><label htmlFor="library-filter" className="text-sm">Dateiname</label><div className="flex items-end gap-2"><input id="library-filter" className={field} value={filename} maxLength={200} onChange={(event) => setFilename(event.target.value)} /><button className={secondary} aria-label="Dateinamen filtern"><Search size={17} aria-hidden="true" /></button></div></form>
                <p className="mt-4 text-xs text-muted-foreground" role="status">{selected.length} von höchstens 20 Dokumenten ausgewählt</p>
                {selected.length > 0 && <div className="mt-2 space-y-1" aria-label="Ausgewählte Dokumente">{selected.map((doc) => <button key={doc.id} className="flex w-full items-center justify-between gap-2 rounded-lg bg-app-surface-active px-2 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring" onClick={() => changeSelection(doc)} aria-label={`${doc.filename} aus Auswahl entfernen`}><span className="break-all">{doc.filename}</span><X size={14} className="shrink-0" aria-hidden="true" /></button>)}</div>}
                {loadingDocuments ? <p className="mt-5 text-sm" role="status">Bibliothek wird geladen…</p> : listError ? <p className="mt-5 text-sm" role="alert">{listError}</p> : <>
                    {!documents.length && <p className="mt-5 text-sm leading-relaxed">{filter ? "Kein Dokument mit diesem Dateinamen gefunden." : "Ihre persönliche Bibliothek ist noch leer. Nehmen Sie zuerst ein Dokument auf; Dateien in Projekten gehören nicht zu dieser Auswahl."}</p>}
                    <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">{documents.map((doc) => { const checked = selected.some((item) => item.id === doc.id); return <li key={doc.id}><label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-foreground" checked={checked} disabled={!checked && selected.length >= 20} onChange={() => changeSelection(doc)} /><span className="min-w-0 break-all">{doc.filename}<span className="mt-1 block text-xs text-muted-foreground">{doc.active_version_number ? `Version ${doc.active_version_number}` : "Aktuelle Version"}</span></span></label></li>; })}</ul>
                    <div className="mt-3 flex items-center justify-between gap-2"><button className={secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Zurück</button><span className="text-xs">Seite {offset / 20 + 1}</span><button className={secondary} disabled={!hasMore} onClick={() => setOffset(offset + 20)}>Weiter</button></div>
                </>}
            </div>
            <div>
                <form onSubmit={search} className="courtos-search-form">
                    <h3 className="font-medium">2. Passagen durchsuchen</h3>
                    <label htmlFor="private-query" className="mt-4 block text-sm">Begriffe oder Frage zu Ihrer Auswahl</label><textarea id="private-query" className={field} rows={3} maxLength={300} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zum Beispiel: rechtliches Gehör, Stellungnahme" aria-describedby="private-search-help" />
                    <p id="private-search-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">Textsuche, keine juristische Bewertung. Wenige prägnante Begriffe helfen. Nicht lesbare Scans und nicht erfasste Seiten können fehlen; kein Treffer belegt nicht das Fehlen einer Aussage.</p>
                    <button className={`${button} mt-4`} disabled={searching || selected.length === 0 || !query.trim()}><Search size={16} aria-hidden="true" />{searching ? "Passagen werden gesucht…" : "In ausgewählten Quellen suchen"}</button>
                </form>
                <div className="mt-4 border-t border-border pt-4"><button type="button" className={secondary} disabled={!user?.id || selected.length === 0 || !query.trim()} onClick={() => { if (user?.id && prepareKnowledgeDraft(user.id, query, selected)) router.push("/assistant"); }}>Mit dieser Auswahl fragen</button><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Bereitet Ihre Frage mit diesen Dokumentreferenzen im Assistenten vor. Sie prüfen den Entwurf und senden selbst. Die lokale Modellantwort zählt zum Tageslimit; Dateien werden nicht kopiert.</p></div>
                {searching && <p role="status" className="mt-4 text-sm">Die Dokumenttexte werden lokal geprüft. Dies kann beim ersten Aufruf etwas dauern.</p>}
                {searchError && <p role="alert" className="mt-5 text-sm">{searchError}</p>}
                {result && <section aria-label="Lokale Suchergebnisse" className="mt-7"><h3 className="font-serif text-xl">{result.results.length} Passagen zu «{submitted}»</h3>
                    {result.notices.map((notice, index) => <p key={index} className="mt-2 text-sm leading-relaxed">{notice}</p>)}
                    <details className="mt-4 rounded-xl border border-border p-3 text-sm"><summary className="cursor-pointer">Umfang der erfassten Quellen prüfen</summary><ul className="mt-3 space-y-2">{result.documents.map((doc) => <li key={doc.document_id} className="break-words"><strong className="font-medium">{selected.find((item) => item.id === doc.document_id)?.filename ?? "Dokument"}</strong>: {doc.index_status === "ready" ? "Text erfasst" : doc.index_status === "partial" ? "Nur teilweise erfasst" : "Kein durchsuchbarer Text"} · {doc.indexed_pages} von {doc.total_pages} Seiten</li>)}</ul></details>
                    {result.results.length === 0 && <p className="mt-4 text-sm leading-relaxed">Keine passende Passage in den erfassten Seiten. Versuchen Sie einen anderen Begriff und prüfen Sie oben den Erfassungsumfang.</p>}
                    <ol className="mt-4 space-y-4">{result.results.map((hit, index) => <li key={`${hit.document_id}-${hit.version_id}-${hit.page}-${index}`} className="courtos-source-hit"><p className="courtos-source-meta">{hit.filename} · Version {hit.version_number ?? "nicht nummeriert"} · Seite {hit.page}</p><blockquote className="mt-3 whitespace-pre-wrap break-words font-serif text-base leading-relaxed">{hit.quote}</blockquote><button className={`${link} mt-3`} onClick={() => setSource(hit)}>Beleg im Dokument öffnen <BookOpen size={15} aria-hidden="true" /></button></li>)}</ol>
                </section>}
            </div>
        </div>
        {source && <LocalSource result={source} onClose={() => setSource(null)} />}
    </section>;
}

function OriginalLinks({ decision }: { decision: PublicDecision }) {
    const source = publicSourceUrl(decision.source_url); const pdf = publicSourceUrl(decision.pdf_url);
    return <div className="flex flex-wrap gap-x-5">{source && <a href={source} target="_blank" rel="noopener noreferrer" className={link}>Originalquelle <ExternalLink size={14} aria-hidden="true" /></a>}{pdf && pdf !== source && <a href={pdf} target="_blank" rel="noopener noreferrer" className={link}>Original-PDF <ExternalLink size={14} aria-hidden="true" /></a>}</div>;
}
// Only known source identifiers are expanded. Unknown metadata is displayed as supplied.
function courtLabel(court: string | null | undefined) {
    const known: Record<string, string> = { bger: "Bundesgericht", bge: "Bundesgericht", zh_verwaltungsgericht: "Verwaltungsgericht Zürich", ow_gerichte: "Gerichte Obwalden" };
    return court ? known[court] ?? court.replaceAll("_", " ") : "";
}
function decisionTitle(decision: PublicDecision) { return decision.title || [courtLabel(decision.court), decision.docket_number].filter(Boolean).join(" · ") || decision.decision_id; }

function PublicSource({ decision, onClose }: { decision: PublicDecision; onClose: () => void }) {
    const [detail, setDetail] = useState<PublicDecisionDetail | null>(null);
    const [start, setStart] = useState(0); const [history, setHistory] = useState<number[]>([]);
    const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController(); setLoading(true); setError("");
        getPublicDecision(decision.decision_id, start, controller.signal).then((data) => { if (!controller.signal.aborted) setDetail(data); }).catch((problem) => { if (!controller.signal.aborted) setError(errorText(problem)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [decision.decision_id, start, retry]);
    return <SourceDialog title={decisionTitle(decision)} onClose={onClose}><div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
        <p className="text-sm text-muted-foreground">{[courtLabel(decision.court), decision.docket_number, decision.decision_date, decision.language?.toUpperCase()].filter(Boolean).join(" · ")}</p><OriginalLinks decision={decision} />
        {loading ? <p role="status" className="mt-6">Entscheidtext wird geladen…</p> : error ? <div role="alert" className="mt-6"><p>{error}</p><button className={`${secondary} mt-3`} onClick={() => setRetry((value) => value + 1)}>Erneut laden</button></div> : detail && <>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Erfasster Text · Zeichenposition {detail.passage.start}–{detail.passage.end} von {detail.passage.total_chars}. Diese Positionen beginnen bei 0 und sind keine amtlichen Randnummern. Prüfen Sie Zitate an der Originalquelle.</p>
            <pre className="mt-5 whitespace-pre-wrap break-words font-serif text-base leading-relaxed">{detail.passage.text}</pre>
            <div className="mt-6 flex flex-wrap gap-3"><button className={secondary} disabled={!history.length} onClick={() => { setStart(history[history.length - 1]); setHistory((items) => items.slice(0, -1)); }}>Vorheriger Abschnitt</button><button className={secondary} disabled={!detail.passage.has_more} onClick={() => { setHistory((items) => [...items, start]); setStart(detail.passage.end); }}>Nächster Abschnitt</button></div>
            <details className="mt-6 text-xs leading-relaxed text-muted-foreground"><summary className="cursor-pointer">Quellennachweis</summary><p className="mt-2 break-all">OpenCaseLaw-ID: {decision.decision_id}<br />Erfasst: {detail.scraped_at || decision.scraped_at || "nicht angegeben"}<br />Text-Hash: {detail.content_hash || decision.content_hash || "nicht angegeben"}</p></details>
        </>}
    </div></SourceDialog>;
}

function PublicKnowledge() {
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
    return <section aria-labelledby="public-knowledge-title" className="mt-7 max-w-3xl">
        <h2 id="public-knowledge-title" className="font-serif text-2xl">Öffentliche Rechtsprechung nachschlagen</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Durchsuchen Sie den öffentlichen OpenCaseLaw-Bestand. Hier geben Sie einen eigenen öffentlichen Suchtext ein. Ihre ausgewählten Bibliotheksdateien und deren Passagen werden nicht mitgesendet.</p>
        <form onSubmit={search} className="mt-5"><label htmlFor="public-query" className="block text-sm font-medium">Öffentliche Rechtsbegriffe</label><input id="public-query" className={field} value={query} maxLength={180} onChange={(event) => setQuery(event.target.value)} placeholder="Zum Beispiel: rechtliches Gehör" aria-describedby="public-search-help" /><p id="public-search-help" className="mt-2 text-xs leading-relaxed text-muted-foreground">Bis zu acht Begriffe, die alle im Text vorkommen sollen. Keine Fallnamen, Personendaten oder vertraulichen Angaben. Es wird nach Text gesucht; ein Sprachmodell bewertet die Entscheide nicht.</p><div className="mt-4 flex flex-wrap items-end gap-4"><label className="text-sm" htmlFor="public-language">Sprache<select id="public-language" value={language} onChange={(event) => setLanguage(event.target.value)} className={field}><option value="">Alle Sprachen</option><option value="de">Deutsch</option><option value="fr">Französisch</option><option value="it">Italienisch</option></select></label><button className={button} disabled={searching || !query.trim()}><Search size={16} aria-hidden="true" />{searching ? "Entscheide werden gesucht…" : "OpenCaseLaw durchsuchen"}</button></div></form>
        {searching && <p role="status" className="mt-5 text-sm">Öffentliche Quellen werden durchsucht…</p>}{error && <p role="alert" className="mt-5 text-sm">{error}</p>}
        {result && <section className="mt-7" aria-label="Öffentliche Suchergebnisse"><h3 className="font-serif text-xl">{result.results.length} Entscheide zu «{submitted}»</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Höchstens fünf Treffer. Grenzen Sie die Begriffe oder Sprache ein. Dies ist keine Vollständigkeits- oder Geltungsprüfung. Datum und Aktenzeichen stammen aus dem Datenbestand. Prüfen Sie beides in der Originalquelle.</p>{!result.results.length && <p className="mt-4 text-sm">Keine passenden Entscheide im erfassten Bestand. Versuchen Sie weniger oder andere Begriffe.</p>}<ol className="mt-5 space-y-4">{result.results.map((decision) => <li key={decision.decision_id} className="courtos-source-hit"><p className="text-xs text-muted-foreground">{[courtLabel(decision.court), decision.canton, decision.decision_date, decision.language?.toUpperCase()].filter(Boolean).join(" · ")}</p><h4 className="mt-2 break-words font-serif text-xl">{decisionTitle(decision)}</h4><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{decision.snippet}</p><div className="mt-3 flex flex-wrap items-center gap-x-5"><button className={link} onClick={() => setSource(decision)}>Entscheidtext öffnen <BookOpen size={15} aria-hidden="true" /></button><OriginalLinks decision={decision} /></div></li>)}</ol><p className="mt-5 break-all text-xs text-muted-foreground">Datenstand-Kennung: {result.database_generation}</p></section>}
        {source && <PublicSource decision={source} onClose={() => setSource(null)} />}
    </section>;
}

export function KnowledgeWorkspace() {
    const [mode, setMode] = useState<"private" | "public">("private");
    return <div className="h-full overflow-y-auto"><div className="courtos-page w-full">
        <header><p className="courtos-kicker">COURTOS · WISSENSBASIS</p><h1 className="courtos-display mt-5">Quellen finden. Aussagen prüfen.</h1><p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">Suchen Sie eine belegbare Textstelle in Ihrer Literatur oder einen öffentlichen Entscheid. Für diesen Pilot eignen sich synthetische Akten und öffentliche oder rechtmässig nutzbare, nicht vertrauliche Literaturauszüge. Keine echten Akten oder Personendaten. Upload: höchstens 5 MiB pro Datei, insgesamt 20 MiB Testbudget.</p></header>
        <nav aria-label="Quellenart" className="courtos-source-tabs"><button aria-pressed={mode === "private"} className="courtos-source-tab" onClick={() => setMode("private")}>Meine Bibliothek</button><button aria-pressed={mode === "public"} className="courtos-source-tab" onClick={() => setMode("public")}>Öffentliche Rechtsprechung</button></nav>
        <div hidden={mode !== "private"}><LocalKnowledge /></div><div hidden={mode !== "public"}><PublicKnowledge /></div>
    </div></div>;
}
