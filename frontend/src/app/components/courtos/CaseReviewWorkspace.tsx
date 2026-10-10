"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { CaseReviewInput, CaseReviewKind, CaseReviewRecord, CaseReviewRole, CaseReviewSource } from "@mike/contracts";
import { useAuth } from "@/app/contexts/AuthContext";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import type { CourtOSText } from "@/app/lib/courtosLocale";
import { researchMessages as M } from "@/app/lib/researchMessages";
import { reviewMessages as R } from "@/app/lib/reviewMessages";
import { CaseReviewError, clearCaseReview, getCaseReview, isReviewActive, rememberCaseReview, savedCaseReview, startCaseReview, stopCaseReview } from "@/app/lib/caseReviewApi";
import { getLibrary, getLibraryFolderChildren, searchLibraryDocuments } from "@/app/lib/mikeApi";
import { useLibrarySourcePaths } from "@/app/hooks/useLibrarySourcePaths";
import { sourcePickerMessages as P } from "@/app/lib/sourcePickerMessages";
import { SourceFolderBreadcrumbs, SourcePath, MixedSourceFolders } from "./SourceFolderNavigation";
import { TABLE_CHECKBOX_CLASS } from "@/app/components/shared/TablePrimitive";
import type { Document, LibraryFolder } from "@/app/components/shared/types";
import { LocalSource } from "./KnowledgeWorkspace";
import { ProcessingLocation } from "./ProcessingLocation";
import { ExampleMatters } from "./ExampleMatters";
import { CaseReviewComparison } from "./CaseReviewComparison";
import { CitationCheckPanel } from "./CitationCheckPanel";
import { CaseReviewSourceExcerpt as ReviewSource } from "./CaseReviewSourceExcerpt";

const roles: CaseReviewRole[] = ["claim", "response", "exhibit", "authority", "other"];
const kinds: CaseReviewKind[] = ["facts", "legal", "chronology"];
const guideLabel: CourtOSText = {de:"Anleitung",fr:"Guide",it:"Guida",en:"Guide"};
const errorMessages: Record<CaseReviewError["code"], CourtOSText> = { unavailable: R.errorGeneric, source: R.errorSource, input: R.errorInput, quota: R.errorQuota, conflict: R.errorConflict, session: R.errorSession, grounding: R.errorGrounding, output: R.errorInvalidOutput, context: R.errorContext, missing: R.errorSource };
const errorMessage = (error: unknown) => error instanceof CaseReviewError ? errorMessages[error.code] : R.errorGeneric;
const originalPdf = (doc: Document) => doc.status === "ready" && !!doc.current_version_id && (/\.pdf$/i.test(doc.filename) || ["pdf", "application/pdf"].includes(doc.file_type?.toLowerCase() ?? ""));
type Chosen = { document: Document; role: CaseReviewRole; party: string };

export function CaseReviewWorkspace() {
    const { user } = useAuth();
    return user?.id ? <CaseReviewContent key={user.id} owner={user.id} /> : null;
}
function CaseReviewContent({ owner }: { owner: string }) {
    const { t, locale } = useCourtOSLocale();
    const inWord = useSearchParams().get("host") === "word";
    const [documents, setDocuments] = useState<Document[]>([]);
    const [chosen, setChosen] = useState<Chosen[]>([]);
    const [folders, setFolders] = useState<LibraryFolder[]>([]);
    const [folderPath, setFolderPath] = useState<LibraryFolder[]>([]);
    const folderId = folderPath.at(-1)?.id;
    const [filename, setFilename] = useState("");
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const {paths, remember} = useLibrarySourcePaths([...chosen.map(item => item.document), ...documents], refresh);
    const [kind, setKind] = useState<CaseReviewKind>("facts");
    const [language, setLanguage] = useState<CaseReviewInput["language"]>(locale);
    const [record, setRecord] = useState<CaseReviewRecord | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [importingExample, setImportingExample] = useState(false);
    const [checkingCitations, setCheckingCitations] = useState(false);
    const [error, setError] = useState<CourtOSText | null>(null);
    const [pollError, setPollError] = useState<CourtOSText | null>(null);
    const [pollRetry, setPollRetry] = useState(0);
    const [missingJob, setMissingJob] = useState(false);
    const [source, setSource] = useState<CaseReviewSource | null>(null);
    const pendingInput = useRef<CaseReviewInput | null>(null);
    const submitting = useRef(false);
    const active = isReviewActive(record);
    const locked = busy || importingExample || checkingCitations || active || !!pendingInput.current || !!jobId;

    useEffect(() => { setJobId(savedCaseReview(owner)); }, [owner]);
    useEffect(() => {
        const controller = new AbortController(); setLoading(true); setListError(false);
        const request = filter ? searchLibraryDocuments("files", { search: filter, limit: 20, offset, sortKey: "name", sortDirection: "asc", signal: controller.signal }) : folderId ? getLibraryFolderChildren("files", folderId, {limit: 20, offset}) : getLibrary("files", {limit: 20, offset});
        request.then(data => { if (!controller.signal.aborted) { if (!filter) remember(data.documents, folderPath); setDocuments(data.documents); setFolders("folders" in data ? data.folders as LibraryFolder[] : []); setHasMore(data.documentsHasMore); } })
            .catch(() => { if (!controller.signal.aborted) setListError(true); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [offset, refresh, filter, folderId, remember]);
    useEffect(() => {
        if (!jobId || pollError || (record && !active)) return;
        const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const result = await getCaseReview(jobId, controller.signal);
                if (controller.signal.aborted) return;
                setRecord(result); pendingInput.current = null; setMissingJob(false);
                if (isReviewActive(result)) timer = setTimeout(poll, 5000);
            } catch (problem) { if (!controller.signal.aborted) { setPollError(errorMessage(problem)); setMissingJob(problem instanceof CaseReviewError && problem.code === "missing"); } }
        };
        void poll();
        return () => { controller.abort(); if (timer) clearTimeout(timer); };
    }, [jobId, active, pollError, pollRetry]);

    async function start() {
        if (submitting.current || active || checkingCitations || !chosen.length) return;
        const retryingUnconfirmed = !!pendingInput.current;
        submitting.current = true; setBusy(true); setError(null);
        const input = pendingInput.current ?? { request_id: crypto.randomUUID(), kind, language, sources: chosen.map(({ document, role, party }) => ({ document_id: document.id, version_id: document.current_version_id!, role, party_label: party.trim() || null })) };
        pendingInput.current = input; rememberCaseReview(owner, input.request_id);
        try { const result = await startCaseReview(input); setRecord(result); setJobId(result.id); pendingInput.current = null; }
        catch (problem) {
            setError(errorMessage(problem));
            if (problem instanceof CaseReviewError && problem.rejected && !retryingUnconfirmed) { pendingInput.current = null; clearCaseReview(owner); }
            else if (retryingUnconfirmed) { setJobId(input.request_id); setPollError(null); setPollRetry(value => value + 1); }
        }
        finally { submitting.current = false; setBusy(false); }
    }
    async function stop() {
        if (!record || busy) return; setBusy(true); setError(null);
        try { setRecord(await stopCaseReview(record.id)); }
        catch (problem) { setError(errorMessage(problem)); }
        finally { setBusy(false); }
    }
    function reset() {
        if (active || busy) return;
        clearCaseReview(owner); pendingInput.current = null; setRecord(null); setJobId(null); setError(null); setPollError(null); setMissingJob(false); setSource(null);
    }
    function select(doc: Document) {
        setChosen(previous => previous.some(item => item.document.id === doc.id) ? previous.filter(item => item.document.id !== doc.id) : [...previous, {document: doc, role: "other", party: ""}]);
    }
    const citationSources = record?.input.sources.map(({document_id,version_id})=>({document_id,version_id})) ?? chosen.map(item=>({document_id:item.document.id,version_id:item.document.current_version_id!}));
    const report = record?.status === "completed" ? record.report : null;
    return <div className="courtos-research-page courtos-review-page">
        <header className="courtos-review-heading"><div className="courtos-review-section-heading"><h1>{t(R.title)}</h1><a className="courtos-link" href={`/guide/${locale}.html#work`} target="_blank" rel="noopener noreferrer">{t(guideLabel)}</a></div><p>{t(R.intro)}</p></header>
        {!record && <>
            <section className="courtos-review-selection" aria-labelledby="review-source-title">
                <div className="courtos-review-section-heading"><h2 id="review-source-title">{t(R.select)}</h2><Link className="courtos-link" href={inWord ? "/library?host=word" : "/library"}>{t(M.addDocuments)}</Link></div>
                <p className="courtos-review-help">{t(R.limits)}</p>
                <ExampleMatters disabled={locked || chosen.length > 0} inWord={inWord} onImportingChange={setImportingExample} onImported={(sources, sourceLanguage) => {setChosen(sources);setLanguage(sourceLanguage);setRefresh(value=>value+1);}} />
                {chosen.length > 0 && <ol className="courtos-review-assignments">{chosen.map((item, index) => <li key={item.document.id}>
                    <div><strong>{item.document.filename}</strong><SourcePath path={paths[item.document.id]} /><p>{t(M.version, {number: item.document.active_version_number ?? t(M.unnumbered)})}</p><button type="button" className="courtos-link text-xs" disabled={locked} onClick={() => select(item.document)} aria-label={t(M.removeSelected,{name:item.document.filename})}>{t(M.removeSelected,{name:item.document.filename})}</button></div>
                    <label>{t(R.role)}<select className="courtos-field" value={item.role} disabled={locked} onChange={event => setChosen(previous => previous.map((value, i) => i === index ? {...value, role: event.target.value as CaseReviewRole} : value))}>{roles.map(role => <option key={role} value={role}>{t(R[role])}</option>)}</select></label>
                    <label>{t(R.party)}<input className="courtos-field" value={item.party} maxLength={80} placeholder={t(R.partyHint)} disabled={locked} onChange={event => setChosen(previous => previous.map((value, i) => i === index ? {...value, party: event.target.value} : value))} /></label>
                </li>)}</ol>}
                <MixedSourceFolders ids={chosen.map(item => item.document.id)} paths={paths} />
                <details open className="courtos-review-inventory"><summary>{t(M.selectSources)} · {chosen.length}/5</summary>
                    <form className="my-3" onSubmit={event => {event.preventDefault();setFilter(filename.trim());setOffset(0);setRefresh(value => value+1);}}><label htmlFor="review-library-filter">{t(M.filename)}</label><div className="flex flex-wrap items-end gap-2"><input id="review-library-filter" className="courtos-field min-w-0 flex-1" value={filename} maxLength={200} onChange={event => setFilename(event.target.value)}/><button type="submit" className="courtos-button courtos-button--secondary">{t(M.filterFilenames)}</button></div></form>
                    {filter ? <div className="my-3 text-xs"><p>{t(P.searchScope)}</p><button type="button" className="courtos-link min-h-11" onClick={() => {setFilter("");setFilename("");setOffset(0);}}>{t(P.clearSearch)}</button></div> : <SourceFolderBreadcrumbs path={folderPath} onChange={path => {setFolderPath(path);setOffset(0);}} />}
                    {loading ? <p role="status">{t(M.loadingLibrary)}</p> : listError ? <p role="alert">{t(M.libraryFailed)}</p> : <>
                        {!!folders.length && <ul aria-label={t(P.folders)}>{folders.map(folder => <li key={folder.id}><button type="button" className="courtos-link min-h-11 w-full py-3 text-left break-words" onClick={() => {setFolderPath(path => [...path,folder]);setOffset(0);}}>{folder.name}</button></li>)}</ul>}
                        {!documents.length && !folders.length && <p>{t(filter ? M.noFilename : M.noDocuments)}</p>}
                        <ul>{documents.map(doc => { const selected = chosen.some(item => item.document.id === doc.id); const eligible = originalPdf(doc); return <li key={doc.id}><label><input type="checkbox" className={TABLE_CHECKBOX_CLASS} checked={selected} disabled={locked || !eligible || (!selected && chosen.length >= 5)} onChange={() => select(doc)} /><span>{doc.filename}<SourcePath path={paths[doc.id]}/>{!eligible && <small>{t(R.notPdf)}</small>}</span></label></li>; })}</ul>
                        <div className="courtos-review-actions"><button className="courtos-link" disabled={!offset} onClick={() => setOffset(Math.max(0,offset-20))}>{t(M.back)}</button><span>{t(M.page,{page:offset/20+1})}</span><button className="courtos-link" disabled={!hasMore} onClick={() => setOffset(offset+20)}>{t(M.next)}</button><button className="courtos-link" onClick={() => setRefresh(value => value+1)}>{t(M.refreshLibrary)}</button></div>
                    </>}
                </details>
            </section>
            <fieldset disabled={locked} className="courtos-review-kind"><legend>{t(R.kind)}</legend><div>{kinds.map(value => <label key={value}><input type="radio" name="review-kind" checked={kind===value} onChange={() => setKind(value)} /><span><strong>{t(R[value])}</strong><small>{t(R[`${value}Help`])}</small></span></label>)}</div></fieldset>
            <label className="courtos-review-language">{t(R.reportLanguage)}<select className="courtos-field" value={language} disabled={locked} onChange={event => setLanguage(event.target.value as CaseReviewInput["language"])}><option value="de">Deutsch</option><option value="fr">Français</option><option value="it">Italiano</option><option value="en">English</option></select></label>
            <div className="courtos-review-actions"><button className="courtos-button" disabled={busy || checkingCitations || active || !chosen.length || (!!jobId && !pendingInput.current)} onClick={() => void start()}>{t(busy ? R.starting : pendingInput.current ? R.retryStart : R.start)}</button>{missingJob && !pendingInput.current && <button className="courtos-link" disabled={busy} onClick={reset}>{t(R.new)}</button>}</div>
            <p className="courtos-review-help">{t(R.quota)}</p>
            {pendingInput.current && error && <p className="courtos-review-help">{t(R.retryNotice)}</p>}
        </>}
        <CitationCheckPanel key={citationSources.map(item=>`${item.document_id}:${item.version_id}`).join("|")} sources={citationSources} disabled={busy||importingExample||active||!!pendingInput.current} onBusyChange={setCheckingCitations} onOpen={setSource}/>
        {error && <p role="alert" className="courtos-review-error">{t(error)}</p>}
        {pollError && <div role="alert" className="courtos-review-error"><p>{t(pollError)}</p><button className="courtos-link" onClick={() => {setPollError(null);setPollRetry(value=>value+1);}}>{t(R.retryPoll)}</button>{missingJob && !active && <button className="courtos-link" onClick={reset}>{t(R.new)}</button>}</div>}
        {record && <section className="courtos-review-job" aria-live="polite"><h2>{t(R[record.status])}</h2>{active ? <><p>{t(R.wait)}</p><button className="courtos-link" disabled={busy} onClick={() => void stop()}>{t(busy ? R.stopping : R.stop)}</button></> : <button className="courtos-link" onClick={reset}>{t(R.new)}</button>}
            {record.error && <p role="alert">{t(record.error.code === "review_context_unavailable" ? R.errorContext : record.error.code === "review_grounding_failed" ? R.errorGrounding : record.error.code === "review_invalid_output" ? R.errorInvalidOutput : record.status === "interrupted" ? R.interrupted : R.errorGeneric)}</p>}
        </section>}
        {report && <section className="courtos-review-report">
            <header><h2>{t(R.partial)}</h2><p>{t(R.partialHelp)}</p>{report.coverage.more_claims_reported && <p>{t(R.moreClaims)}</p>}</header>
            {report.kind === "legal" && <div className="courtos-review-caveat"><p>{t(R.legalManual)}</p><Link className="courtos-link" href={inWord ? "/word/research" : "/research"}>{t(R.openResearch)}</Link><small>{t(R.noTransfer)}</small></div>}
            {report.kind === "chronology" && <div className="courtos-review-caveat"><h3>{t(R.chronologyOrder)}</h3><p>{t(R.chronologyOrderHelp)}</p></div>}
            {!report.rows.length && <p>{t(R.noRows)}</p>}
            {report.kind === "chronology" ? <div className="courtos-review-table-wrap"><table className="courtos-review-table"><caption className="sr-only">{t(R[report.kind])}</caption><thead><tr><th>{t(R.actor)}</th>{report.kind === "chronology" && <th>{t(R.date)}</th>}<th>{t(R.proposition)}</th><th>{t(R.evidence)}</th><th>{t(R.opposing)}</th><th>{t(R.assessment)}</th></tr></thead><tbody>{report.rows.map((row,index) => <Fragment key={row.id}>{report.kind === "chronology" && (index === 0 || (row.date_status !== "exact_day" && report.rows[index-1]?.date_status === "exact_day")) && <tr className="courtos-review-group"><th colSpan={6}>{t(row.date_status === "exact_day" ? R.exactDates : R.unclearDates)}</th></tr>}<tr>
                <td data-label={t(R.actor)}><strong>{row.party_label || t(R.none)}</strong><small>{t(R[row.source_role])}</small><small>{t(R[row.posture])}</small></td>
                {report.kind === "chronology" && <td data-label={t(R.date)}>{row.date ? <ReviewSource source={row.date} onOpen={setSource}/> : t(R.none)}</td>}
                <td data-label={t(R.proposition)}><ReviewSource source={row.proposition} onOpen={setSource}/>{row.amounts.length>0 && <details><summary>{t(R.amounts)}</summary>{row.amounts.map((value,i)=><ReviewSource key={i} source={value} onOpen={setSource}/>)}</details>}{row.cited_references.length>0 && <details><summary>{t(R.references)}</summary>{row.cited_references.map((value,i)=><ReviewSource key={i} source={value} onOpen={setSource}/>)}</details>}</td>
                <td data-label={t(R.evidence)}>{row.evidence.length ? row.evidence.map((value,i)=><ReviewSource key={i} source={value} onOpen={setSource}/>) : t(R.noneSelected)}</td>
                <td data-label={t(R.opposing)}>{row.opposing_position.length ? row.opposing_position.map((value,i)=><ReviewSource key={i} source={value} onOpen={setSource}/>) : t(R.noneSelected)}</td>
                <td data-label={t(R.assessment)}><strong>{t(R[row.assessment])}</strong><p>{row.reasoning}</p></td>
            </tr></Fragment>)}</tbody></table></div> : <CaseReviewComparison report={report} onOpen={setSource}/>}
            <details className="courtos-review-coverage"><summary>{t(R.readScope)}</summary><ul>{report.coverage.selection.map(item=><li key={`${item.document_id}-${item.version_id}`}><strong>{item.filename}</strong> · {t(M.version,{number:item.version_number??t(M.unnumbered)})} · {item.pages.map(page=>t(M.page,{page})).join(", ")}</li>)}</ul><ProcessingLocation service="gemma">{report.model} · {report.coverage.extracted_text_bytes} UTF-8 bytes</ProcessingLocation></details>
        </section>}
        {source && <LocalSource result={{...source,score:0}} onClose={()=>setSource(null)}/>}
    </div>;
}
