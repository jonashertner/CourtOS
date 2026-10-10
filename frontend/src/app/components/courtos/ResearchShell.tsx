"use client";

import { Suspense, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Settings2 } from "lucide-react";
import { ResearchSettings } from "./ResearchSettings";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_CLOUDFLARE_AUTH, COURTOS_CITECHECK_URL, COURTOS_SOURCE_URL, isWordResearchContext } from "@/app/lib/courtos";

/** Fixed destination only: no document access, auth exchange or pane-state transfer. */
function openResearchInBrowser(event: MouseEvent<HTMLAnchorElement>) {
    const destination = new URL("/research", window.location.origin);
    if (destination.protocol !== "https:") { event.preventDefault(); return; }
    event.currentTarget.href = destination.href;
    const office = (window as unknown as { Office?: { context?: {
        requirements?: { isSetSupported(name: string, version: string): boolean };
        ui?: { openBrowserWindow(url: string): void };
    } } }).Office;
    try {
        // Microsoft OpenBrowserWindowApi 1.1 opens the external browser, not an Office dialog.
        // https://learn.microsoft.com/office/dev/add-ins/reference/requirement-sets/open-browser-window-api-requirement-sets
        if (office?.context?.requirements?.isSetSupported("OpenBrowserWindowApi", "1.1") &&
            typeof office.context.ui?.openBrowserWindow === "function") {
            office.context.ui.openBrowserWindow(destination.href);
            event.preventDefault();
        }
    } catch { /* Keep the normal new-tab link when the host cannot open a browser. */ }
}

/** A research window beside the user's usual tools, with no workspace catalogue. */
export function ResearchShell({ children }: { children: ReactNode }) {
    return <Suspense fallback={<p className="p-6" role="status">Recherche wird geladen…</p>}><ResearchShellContent>{children}</ResearchShellContent></Suspense>;
}

function ResearchShellContent({ children }: { children: ReactNode }) {
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
                {inWord && <a href="/research" target="_blank" rel="noopener noreferrer" className="courtos-word-browser-link" onClick={openResearchInBrowser}>Im Browser öffnen <ExternalLink size={14} aria-hidden="true" /></a>}
                <button type="button" className="courtos-settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="Einstellungen" title="Einstellungen"><Settings2 size={19} aria-hidden="true" /></button>
            </div>
            <p className="courtos-research-context">Testbetrieb · Keine vertraulichen Unterlagen</p>
        </header>
        <ResearchSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} userId={user?.id} email={user?.email} onSignOut={leave} signingOut={leaving} signOutError={error} externalAvailable={!inWord} modelsAvailable={!inWord} />
        <div className={`courtos-research-body${inLibrary ? " courtos-research-body--library" : ""}`}>
            <main id="research-main" tabIndex={-1} className="courtos-research-main">{children}</main>
            <footer className="courtos-research-footer">
                <p>OpenCaseLaw · Recherche mit Quellen</p>
                <a href={COURTOS_SOURCE_URL} target="_blank" rel="noopener noreferrer">Quellcode · AGPL-3.0 · auf MikeOSS aufgebaut</a>
            </footer>
        </div>
    </div>;
}
