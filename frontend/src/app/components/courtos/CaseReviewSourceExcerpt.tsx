"use client";

import type { CaseReviewSource } from "@mike/contracts";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { reviewMessages as R } from "@/app/lib/reviewMessages";
import { researchMessages as M } from "@/app/lib/researchMessages";

export function CaseReviewSourceExcerpt({source,onOpen}:{source:CaseReviewSource;onOpen:(source:CaseReviewSource)=>void}) {
    const {t}=useCourtOSLocale();
    return <figure className="courtos-review-source"><blockquote>{source.quote}</blockquote><figcaption><button type="button" className="courtos-link" onClick={()=>onOpen(source)} aria-label={`${t(R.source)}: ${source.filename}, ${t(M.page,{page:source.page})}`}>{source.filename} · {t(M.versionPage,{version:source.version_number??t(M.unnumbered),page:source.page})}</button></figcaption></figure>;
}
