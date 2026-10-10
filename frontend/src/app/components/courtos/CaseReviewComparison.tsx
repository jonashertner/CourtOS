"use client";

import type { CaseReviewReport, CaseReviewSource } from "@mike/contracts";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { reviewMessages as R } from "@/app/lib/reviewMessages";
import { reviewComparisonMessages as C } from "@/app/lib/reviewComparisonMessages";
import { CaseReviewSourceExcerpt } from "./CaseReviewSourceExcerpt";

/** Display the model's existing pairing; never merge rows or infer an opposing party. */
export function CaseReviewComparison({report,onOpen}:{report:CaseReviewReport;onOpen(source:CaseReviewSource):void}) {
    const {t}=useCourtOSLocale();
    if (report.kind === "chronology") return null;
    function counterpart(source:CaseReviewSource) {
        const selected=report.coverage.selection.find(item=>item.document_id===source.document_id&&item.version_id===source.version_id);
        return <div key={`${source.passage_id}:${source.start}`} className="courtos-review-counterpart">
            <strong>{selected?.party_label||t(C.unassignedParty)}</strong>{selected&&<small>{t(R[selected.role])}</small>}
            <CaseReviewSourceExcerpt source={source} onOpen={onOpen}/>
        </div>;
    }
    return <section className="courtos-review-comparison" aria-labelledby="review-comparison-title">
        <h3 id="review-comparison-title">{t(C.title)}</h3><p className="courtos-review-help">{t(C.help)}</p>
        <div className="courtos-review-table-wrap"><table className="courtos-review-table courtos-review-comparison-table">
            <caption className="sr-only">{t(C.title)}</caption>
            <thead><tr><th scope="col">{t(R.proposition)}</th><th scope="col">{t(R.opposing)}</th><th scope="col">{t(R.evidence)}</th><th scope="col">{t(R.assessment)}</th></tr></thead>
            <tbody>{report.rows.map((row,index)=><tr key={row.id}>
                <td data-label={t(R.proposition)}><small>{t(C.statement,{number:index+1})}</small><strong>{row.party_label||t(C.unassignedParty)}</strong><small>{t(R[row.source_role])} · {t(R[row.posture])}</small><CaseReviewSourceExcerpt source={row.proposition} onOpen={onOpen}/>
                    {!!row.amounts.length&&<details><summary>{t(R.amounts)}</summary>{row.amounts.map((source,i)=><CaseReviewSourceExcerpt key={i} source={source} onOpen={onOpen}/>)}</details>}
                    {!!row.cited_references.length&&<details><summary>{t(R.references)}</summary>{row.cited_references.map((source,i)=><CaseReviewSourceExcerpt key={i} source={source} onOpen={onOpen}/>)}</details>}
                </td>
                <td data-label={t(R.opposing)}>{row.opposing_position.length?row.opposing_position.map(counterpart):<p>{t(C.noOpposition)}</p>}</td>
                <td data-label={t(R.evidence)}>{row.evidence.length?row.evidence.map((source,i)=><CaseReviewSourceExcerpt key={i} source={source} onOpen={onOpen}/>):<p>{t(R.noneSelected)}</p>}</td>
                <td data-label={t(R.assessment)}><strong>{t(R[row.assessment])}</strong><p>{row.reasoning}</p></td>
            </tr>)}</tbody>
        </table></div>
    </section>;
}
