"use client";


import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_GUIDE_PATH } from "@/app/lib/courtos";
import { useResearchIntroduction } from "@/app/lib/researchIntroduction";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { pillButtonUIClassName } from "@/shared/ui/PillButtonUI.styles";

/** Used only by the browser research page, after its existing authentication gate. */
export function ResearchIntroduction({ children }: { children: ReactNode }) {
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

    if (!showIntroduction) return <div ref={content} tabIndex={-1} aria-label="Recherche" className="courtos-introduction-content">{children}</div>;

    return <section className="courtos-research-page courtos-introduction" aria-labelledby="research-introduction-title">
        <h1 id="research-introduction-title">CourtOS kennenlernen</h1>
        <p className="courtos-introduction-lede">Das Arbeitsbuch führt vom gerichtlichen Auftrag zur praktischen Arbeit mit Quellen. Lesen Sie nach Bedarf oder beginnen Sie direkt mit der Recherche.</p>
        <div className="courtos-introduction-actions">
            <a href={COURTOS_GUIDE_PATH} className={pillButtonUIClassName({ tone: "black", size: "normal", className: "courtos-button" })}>Arbeitsbuch lesen <ArrowRight size={16} aria-hidden="true" /></a>
            <PillButtonUI type="button" tone="white" size="normal" className="courtos-button courtos-button--secondary" disabled={!user?.id} onClick={() => {
                focusAfterContinue.current = true;
                continueToResearch();
            }}>Recherche öffnen</PillButtonUI>
        </div>
        <dl className="courtos-introduction-models">
            <div data-processing-route="server"><dt>Gemma 4</dt><dd>CourtOS-Server in Deutschland</dd></div>
            <div data-processing-route="external"><dt>Claude Opus 5.5</dt><dd>Anthropic · externe API, erst nach Ihrer Freigabe</dd></div>
        </dl>
        <p className="courtos-introduction-note">Eigene Quellen und öffentliche Rechtsprechung bleiben getrennt. Das Arbeitsbuch erläutert die Datenwege und Grenzen des Piloten.</p>
    </section>;
}
