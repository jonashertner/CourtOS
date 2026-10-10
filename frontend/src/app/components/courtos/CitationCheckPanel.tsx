"use client";

import { useEffect, useRef, useState } from "react";
import type { CaseReviewSource, CitationCheckFinding, CitationCheckInput, CitationCheckReport, CitationIndexDecision } from "@mike/contracts";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { CitationCheckError, checkCitations, citationIndexDecisionUrl } from "@/app/lib/citationCheckApi";
import { citationCheckMessages as C } from "@/app/lib/citationCheckMessages";
import { researchMessages as M } from "@/app/lib/researchMessages";
import type { CourtOSText } from "@/app/lib/courtosLocale";
import { CaseReviewSourceExcerpt } from "./CaseReviewSourceExcerpt";

const statuses = ["found", "differs", "missing", "unchecked"] as const;
const errors: Record<CitationCheckError["code"], CourtOSText> = {unavailable:C.error,source:C.errorSource,scope:C.errorScope,busy:C.errorBusy,index:C.errorIndex,session:C.errorSession,changed:C.errorChanged};
const showValue = (value: string | string[] | number[] | null) => Array.isArray(value) ? value.join(", ") : value;
const sourceFrom = (finding: CitationCheckFinding): CaseReviewSource => ({...finding.source,passage_id:finding.id,source_match:"exact"});

/** The parent key binds this ephemeral report to one account and exact source selection. */
export function CitationCheckPanel({sources,disabled,onBusyChange,onOpen}:{sources:CitationCheckInput["sources"];disabled:boolean;onBusyChange:(busy:boolean)=>void;onOpen:(source:CaseReviewSource)=>void}) {
    const {t,locale}=useCourtOSLocale();
    const [report,setReport]=useState<CitationCheckReport|null>(null);
    const [error,setError]=useState<CourtOSText|null>(null);
    const [busy,setBusy]=useState(false);
    const [page,setPage]=useState(0);
    const controller=useRef<AbortController|null>(null);
    const pending=useRef(false);
    useEffect(()=>()=>{controller.current?.abort();onBusyChange(false);},[onBusyChange]);
    async function check() {
        if(disabled||pending.current||!sources.length)return;
        pending.current=true;const current=new AbortController();controller.current=current;
        setBusy(true);onBusyChange(true);setError(null);setReport(null);setPage(0);
        try {const result=await checkCitations({sources},current.signal);if(!current.signal.aborted)setReport(result);}
        catch(problem){if(!current.signal.aborted)setError(problem instanceof CitationCheckError?errors[problem.code]:C.error);}
        finally {if(!current.signal.aborted){pending.current=false;setBusy(false);onBusyChange(false);}}
    }
    const visible=report?.findings.slice(page*25,(page+1)*25)??[];
    return <section id="citation-check" className="courtos-review-selection scroll-mt-4" aria-labelledby="citation-check-title">
        <div className="courtos-review-section-heading"><h2 id="citation-check-title">{t(C.title)}</h2><button type="button" className="courtos-button courtos-button--secondary" disabled={disabled||busy||!sources.length} onClick={()=>void check()}>{t(busy?C.running:C.start)}</button></div>
        <p className="courtos-review-help">{t(C.intro)}</p>
        {!sources.length&&<a className="courtos-link text-sm" href="#review-source-title">{t(C.select)}</a>}
        {busy&&<p role="status">{t(C.running)}</p>}
        {error&&<p role="alert" className="courtos-review-error">{t(error)}</p>}
        {report&&<div className="mt-4 space-y-4">
            <p className="courtos-review-help">{t(C.caveat)}</p>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2" aria-label={t(C.title)}>{statuses.map(status=><div key={status} className="flex justify-between gap-4"><dt>{t(C[status])}</dt><dd className="font-medium tabular-nums">{report.counts[status]}</dd></div>)}</dl>
            {!report.findings.length?<p role="status">{t(C.empty)}</p>:<ol className="space-y-6" start={page*25+1}>{visible.map((finding,index)=><li key={finding.id} className="min-w-0 break-words border-t border-border pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><h3>{page*25+index+1}. {t(C[finding.status])}</h3><small>{t(C[finding.pinpoint])}</small></div>
                <CaseReviewSourceExcerpt source={sourceFrom(finding)} onOpen={onOpen}/>
                {finding.status==="missing"&&<p className="courtos-review-help">{t(C.missingHelp)}</p>}
                {finding.notes.some(note=>note.kind==="several")&&<p className="courtos-review-help">{t(C.several)}</p>}
                <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer">{t(C.details)}</summary>
                    {finding.decisions.length>0&&<><h4 className="font-medium">{t(C.matches)}</h4><ul className="space-y-2">{finding.decisions.map((decision,index)=><Decision key={`${decision.decision_id}-${index}`} value={decision}/>)}</ul></>}
                    {finding.decisions_omitted>0&&<p>{t(C.moreMatches,{count:finding.decisions_omitted})}</p>}
                    {finding.issues.map((issue,index)=><div key={index} className="mt-3 space-y-1"><strong>{t(C[issue.kind])}</strong>{issue.written!==null&&<p>{t(C.written)}: {showValue(issue.written)}</p>}{!!issue.listed.length&&<p>{t(C.listed)}: {issue.listed.join(", ")}</p>}{!!issue.nearby.length&&<p>{t(C.nearby)}: {issue.nearby.join(", ")}</p>}</div>)}
                    {finding.notes.filter(note=>!["several","pinpoint_parent_only","pinpoint_no_structure"].includes(note.kind)).map((note,index)=><p key={index} className="mt-2">{t(note.kind==="page_inside"?C.pageInside:C.noteUnknown)}{note.written!==null?` ${showValue(note.written)}`:""}</p>)}
                    {finding.suggestions.length>0&&<div className="mt-3"><h4 className="font-medium">{t(C.suggestions)}</h4><ul className="space-y-2">{finding.suggestions.map((item,index)=><Decision key={`${item.decision.decision_id}-${index}`} value={item.decision}/>)}</ul></div>}
                </details>
            </li>)}</ol>}
            {report.findings.length>25&&<div className="courtos-review-actions"><button type="button" className="courtos-link" disabled={!page} onClick={()=>setPage(value=>value-1)}>{t(M.back)}</button><span>{t(M.page,{page:page+1})}</span><button type="button" className="courtos-link" disabled={(page+1)*25>=report.findings.length} onClick={()=>setPage(value=>value+1)}>{t(M.next)}</button></div>}
            <details className="courtos-review-coverage"><summary>{t(C.scope)}</summary><p>{t(C.coverage,{documents:report.coverage.documents,pages:report.coverage.pages})}</p><p>{t(C.excluded)}</p><dl className="mt-3 space-y-2 text-xs"><div><dt>{t(C.checkedAt)}</dt><dd>{new Date(report.checked_at).toLocaleString(locale)}</dd></div><div><dt>{t(C.indexDate)}</dt><dd>{report.index.generated}</dd></div><div><dt>SHA-256</dt><dd className="break-all font-mono">{report.index.sha256}</dd></div></dl></details>
        </div>}
    </section>;
}
function Decision({value}:{value:CitationIndexDecision}) {
    const {t}=useCourtOSLocale();
    const href=citationIndexDecisionUrl(value.decision_id);
    // The report has no checked target-section field: open the whole judgment,
    // without inventing an anchor or transmitting any private source passage.
    return <li className="break-words"><strong>{value.label}</strong><span> · {[value.court,value.canton,value.date].filter(Boolean).join(" · ")}</span><small className="block break-all text-xs">{value.decision_id}</small>{href?<a href={href} target="_blank" rel="noopener noreferrer" className="courtos-link inline-block min-h-11 py-2" aria-label={`${t(C.openDecision)}: ${value.label}`}>{t(C.openDecision)} <span aria-hidden="true">↗</span></a>:<small>{t(C.linkUnavailable)}</small>}</li>;
}
