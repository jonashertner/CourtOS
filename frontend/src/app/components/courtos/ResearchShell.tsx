"use client";

import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { researchMessages as M } from "@/app/lib/researchMessages";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { ResearchSettings } from "./ResearchSettings";
import { ResearchHandoffProvider } from "./ResearchHandoffContext";
import { ResearchContinuation, ResearchContinuationStatus } from "./ResearchHandoffControls";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_CLOUDFLARE_AUTH, courtosCitecheckUrl, isWordResearchContext } from "@/app/lib/courtos";

/** A research window beside the user's usual tools, with no workspace catalogue. */
export function ResearchShell({ children }: { children: ReactNode }) {
    const { t } = useCourtOSLocale();
    return <Suspense fallback={<p className="p-6" role="status">{t(M.loadingResearch)}</p>}><ResearchShellContent>{children}</ResearchShellContent></Suspense>;
}

function ResearchShellContent({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname(); const searchParams = useSearchParams();
    const inWord = isWordResearchContext(pathname, searchParams.get("host"));
    if (!user?.id) return <ResearchShellFrame>{children}</ResearchShellFrame>;
    return <ResearchHandoffProvider key={`${user.id}:${inWord ? "word" : "browser"}`} ownerId={user.id} inWord={inWord}><ResearchShellFrame>{children}</ResearchShellFrame></ResearchHandoffProvider>;
}

function ResearchShellFrame({ children }: { children: ReactNode }) {
    const { t, locale } = useCourtOSLocale();
    const { user, signOut } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [leaving, setLeaving] = useState(false);
    const [error, setError] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const searchParams = useSearchParams();
    const inWord = isWordResearchContext(pathname, searchParams.get("host"));
    const researchPath = inWord ? "/word/research" : "/research";
    const inReview = pathname === "/review";
    const inLibrary = pathname === "/library" || pathname.startsWith("/library/");

    async function leave() {
        if (leaving) return;
        setLeaving(true); setError("");
        try {
            await signOut();
            if (COURTOS_CLOUDFLARE_AUTH) window.location.assign("/cdn-cgi/access/logout");
            else router.replace("/login");
        } catch {
            setError(t(M.signOutFailed));
            setLeaving(false);
        }
    }

    return <div className="courtos-research-shell">
        <a href="#research-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-background focus:p-3">{t(M.skip)}</a>
        <header className="courtos-research-header">
            <div className="courtos-research-bar">
                <Link href={researchPath} aria-label={`CourtOS · ${t(M.research)}`} className="courtos-wordmark">CourtOS</Link>
                <nav aria-label={t(M.areas)} className="courtos-research-nav">
                    <Link href={researchPath} aria-current={!inLibrary && !inReview ? "page" : undefined}>{t(M.research)}</Link>
                    <Link href={inWord ? "/review?host=word" : "/review"} aria-current={inReview ? "page" : undefined}>{t(M.review)}</Link>
                    <Link href={inWord ? "/library?host=word" : "/library"} aria-current={inLibrary ? "page" : undefined}>{t(M.library)}</Link>
                    <a href={courtosCitecheckUrl(locale)} target="_blank" rel="noopener noreferrer" aria-label={t(M.checkCitations)} title={t(M.openCitecheck)}>{t(M.citations)} <span aria-hidden="true">↗</span></a>
                </nav>
                <ResearchContinuation compact />
                <button type="button" className="courtos-settings-trigger" onClick={() => setSettingsOpen(true)} aria-label={t(M.settings)} title={t(M.settings)}><Settings2 size={19} aria-hidden="true" /></button>
            </div>
            <p className="courtos-research-context">{t(M.pilot)}</p>
            <ResearchContinuationStatus />
        </header>
        <ResearchSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user?.id} email={user?.email} onSignOut={leave} signingOut={leaving} signOutError={error} externalAvailable={!inWord} modelsAvailable={!inWord} />
        <div className={`courtos-research-body${inLibrary ? " courtos-research-body--library" : ""}`}>
            <main id="research-main" tabIndex={-1} className="courtos-research-main">{children}</main>

        </div>
    </div>;
}
