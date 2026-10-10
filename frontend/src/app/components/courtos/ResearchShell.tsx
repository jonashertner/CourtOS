"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { ResearchSettings } from "./ResearchSettings";
import { ResearchHandoffProvider } from "./ResearchHandoffContext";
import { ResearchContinuation, ResearchContinuationStatus } from "./ResearchHandoffControls";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_CLOUDFLARE_AUTH, COURTOS_CITECHECK_URL, COURTOS_SOURCE_URL, isWordResearchContext } from "@/app/lib/courtos";

/** A research window beside the user's usual tools, with no workspace catalogue. */
export function ResearchShell({ children }: { children: ReactNode }) {
    return <Suspense fallback={<p className="p-6" role="status">Recherche wird geladen…</p>}><ResearchShellContent>{children}</ResearchShellContent></Suspense>;
}

function ResearchShellContent({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname(); const searchParams = useSearchParams();
    const inWord = isWordResearchContext(pathname, searchParams.get("host"));
    if (!user?.id) return <ResearchShellFrame>{children}</ResearchShellFrame>;
    return <ResearchHandoffProvider key={`${user.id}:${inWord ? "word" : "browser"}`} ownerId={user.id} inWord={inWord}><ResearchShellFrame>{children}</ResearchShellFrame></ResearchHandoffProvider>;
}

function ResearchShellFrame({ children }: { children: ReactNode }) {
    const { user, signOut } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [leaving, setLeaving] = useState(false);
    const [error, setError] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const searchParams = useSearchParams();
    const inWord = isWordResearchContext(pathname, searchParams.get("host"));
    const researchPath = inWord ? "/word/research" : "/research";
    const inLibrary = pathname === "/library" || pathname.startsWith("/library/");

    async function leave() {
        if (leaving) return;
        setLeaving(true); setError("");
        try {
            await signOut();
            if (COURTOS_CLOUDFLARE_AUTH) window.location.assign("/cdn-cgi/access/logout");
            else router.replace("/login");
        } catch {
            setError("Die Abmeldung ist gerade nicht möglich. Bitte versuchen Sie es erneut.");
            setLeaving(false);
        }
    }

    return <div className="courtos-research-shell">
        <a href="#research-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-background focus:p-3">Zum Inhalt</a>
        <header className="courtos-research-header">
            <div className="courtos-research-bar">
                <Link href={researchPath} aria-label="CourtOS Recherche" className="courtos-wordmark">CourtOS</Link>
                <nav aria-label="Recherchebereiche" className="courtos-research-nav">
                    <Link href={researchPath} aria-current={!inLibrary ? "page" : undefined}>Recherche</Link>
                    <Link href={inWord ? "/library?host=word" : "/library"} aria-current={inLibrary ? "page" : undefined}>Bibliothek</Link>
                    <a href={COURTOS_CITECHECK_URL} target="_blank" rel="noopener noreferrer" aria-label="Zitate prüfen" title="Citecheck öffnen">Zitate <span aria-hidden="true">↗</span></a>
                </nav>
                <ResearchContinuation />
                <button type="button" className="courtos-settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen" title="Einstellungen"><Settings2 size={19} aria-hidden="true" /></button>
            </div>
            <p className="courtos-research-context">Testbetrieb · Keine vertraulichen Unterlagen</p>
            <ResearchContinuationStatus />
        </header>
        <ResearchSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user?.id} email={user?.email} onSignOut={leave} signingOut={leaving} signOutError={error} externalAvailable={!inWord} modelsAvailable={!inWord} />
        <div className={`courtos-research-body${inLibrary ? " courtos-research-body--library" : ""}`}>
            <main id="research-main" tabIndex={-1} className="courtos-research-main">{children}</main>
            <footer className="courtos-research-footer">
                <p>OpenCaseLaw · Recherche mit Quellen</p>
                <a href={COURTOS_SOURCE_URL} target="_blank" rel="noopener noreferrer">Quellcode · AGPL-3.0</a>
            </footer>
        </div>
    </div>;
}
