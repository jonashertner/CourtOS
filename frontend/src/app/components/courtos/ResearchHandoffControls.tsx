"use client";

import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { researchMessages as M } from "@/app/lib/researchMessages";

import { ExternalLink } from "lucide-react";
import { useResearchHandoff } from "./ResearchHandoffContext";

/** Office opens the external browser; only the generated account-bound handle URL is allowed. */
function openResearchInBrowser(destination: string): boolean {
    const url = new URL(destination);
    if (url.protocol !== "https:" || url.origin !== window.location.origin || url.pathname !== "/research" || !/^\?handoff=[a-f0-9-]{36}$/i.test(url.search) || url.hash) return false;
    const office = (window as unknown as { Office?: { context?: {
        requirements?: { isSetSupported(name: string, version: string): boolean };
        ui?: { openBrowserWindow(url: string): void };
    } } }).Office;
    try {
        if (office?.context?.requirements?.isSetSupported("OpenBrowserWindowApi", "1.1") && typeof office.context.ui?.openBrowserWindow === "function") {
            office.context.ui.openBrowserWindow(url.href); return true;
        }
    } catch { /* Offer one explicit new-tab link; never retry the host call automatically. */ }
    return false;
}

export function ResearchContinuation() {
    const { t } = useCourtOSLocale();
    const handoff = useResearchHandoff();
    if (!handoff || (!handoff.inWord && !handoff.linked)) return null;
    const inWord = handoff.inWord;
    return <button type="button" className="courtos-word-browser-link" disabled={handoff.busy || !handoff.available || handoff.conflict} onClick={async () => {
        const destination = await handoff.publish();
        if (destination && !openResearchInBrowser(destination)) handoff.setFallbackUrl(destination);
    }}>{inWord ? t(M.continueBrowser) : t(M.continueWord)}{inWord && <ExternalLink size={14} aria-hidden="true" />}</button>;
}

export function ResearchContinuationStatus() {
    const { t } = useCourtOSLocale();
    const handoff = useResearchHandoff();
    if (!handoff) return null;
    return <>
        {(handoff.status || handoff.error) && <p role={handoff.error ? "alert" : "status"} className="courtos-research-context">{handoff.error || handoff.status}</p>}
        {handoff.fallbackUrl && <p className="courtos-research-context"><a className="courtos-link" href={handoff.fallbackUrl} target="_blank" rel="noopener noreferrer">Recherche im Browser öffnen <ExternalLink size={14} aria-hidden="true" /></a></p>}
        {handoff.conflict && <div className="courtos-research-context flex flex-wrap gap-4"><button type="button" className="courtos-link" disabled={handoff.busy} onClick={() => { void handoff.acceptReturned(); }}>{t(M.acceptBrowser)}</button><button type="button" className="courtos-link" disabled={handoff.busy} onClick={() => { void handoff.keepLocal(); }}>{t(M.keepLocal)}</button></div>}
    </>;
}
