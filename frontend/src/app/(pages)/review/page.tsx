"use client";
import { COURTOS_KNOWLEDGE_ENABLED } from "@/app/lib/courtos";
import { Suspense } from "react";
import { CaseReviewWorkspace } from "@/app/components/courtos/CaseReviewWorkspace";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { researchMessages } from "@/app/lib/researchMessages";
export default function ReviewPage() {
    const {t}=useCourtOSLocale();
    if (!COURTOS_KNOWLEDGE_ENABLED) return <p role="status" className="p-6">{t(researchMessages.researchDisabled)}</p>;
    return <Suspense fallback={<p role="status" className="p-6">{t(researchMessages.loadingDocument)}</p>}><CaseReviewWorkspace/></Suspense>;
}
