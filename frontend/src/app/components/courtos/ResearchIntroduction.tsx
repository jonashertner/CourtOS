"use client";


import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_GUIDE_PATH } from "@/app/lib/courtos";
import { useResearchIntroduction } from "@/app/lib/researchIntroduction";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { pillButtonUIClassName } from "@/shared/ui/PillButtonUI.styles";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { readerMessages as m } from "@/app/lib/courtosReaderMessages";

/** Used only by the browser research page, after its existing authentication gate. */
export function ResearchIntroduction({ children }: { children: ReactNode }) {
    const { t, locale } = useCourtOSLocale();
    const { user } = useAuth();
    const { showIntroduction, continueToResearch } = useResearchIntroduction(user?.id);
    const content = useRef<HTMLDivElement>(null);
    const focusAfterContinue = useRef(false);

    useEffect(() => {
        if (!showIntroduction && focusAfterContinue.current) {
            focusAfterContinue.current = false;
            content.current?.focus();
        }
    }, [showIntroduction]);

    if (!showIntroduction) return <div ref={content} tabIndex={-1} aria-label={t(m.research)} className="courtos-introduction-content">{children}</div>;

    return <section className="courtos-research-page courtos-introduction" aria-labelledby="research-introduction-title">
        <h1 id="research-introduction-title">{t(m.introduction)}</h1>
        <p className="courtos-introduction-lede">{t(m.introductionText)}</p>
        <div className="courtos-introduction-actions">
            <a href={`${COURTOS_GUIDE_PATH}${locale}.html`} className={pillButtonUIClassName({ tone: "black", size: "normal", className: "courtos-button" })}>{t(m.readWorkbook)} <ArrowRight size={16} aria-hidden="true" /></a>
            <PillButtonUI type="button" tone="white" size="normal" className="courtos-button courtos-button--secondary" disabled={!user?.id} onClick={() => {
                focusAfterContinue.current = true;
                continueToResearch();
            }}>{t(m.openResearch)}</PillButtonUI>
        </div>
        <dl className="courtos-introduction-models">
            <div data-processing-route="server"><dt>Gemma 4</dt><dd>{t(m.server)}</dd></div>
            <div data-processing-route="external"><dt>Claude Opus 5.5</dt><dd>{t(m.externalApproval)}</dd></div>
        </dl>
        <p className="courtos-introduction-note">{t(m.introductionNote)}</p>
    </section>;
}
