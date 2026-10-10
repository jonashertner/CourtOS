"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_CLOUDFLARE_AUTH, COURTOS_CITECHECK_URL, COURTOS_GUIDE_PATH, COURTOS_SOURCE_URL } from "@/app/lib/courtos";

/** A research window beside the user's usual tools, with no workspace catalogue. */
export function ResearchShell({ children }: { children: ReactNode }) {
    const { user, signOut } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [leaving, setLeaving] = useState(false);
    const [error, setError] = useState("");
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

    return <div className="flex h-dvh min-h-0 flex-col bg-app-background">
        <a href="#research-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-background focus:p-3">Zum Inhalt</a>
        <header className="shrink-0 border-b border-border px-5 py-3 sm:px-8">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-8 gap-y-2">
                <Link href="/research" aria-label="CourtOS Recherche" className="font-serif text-[1.75rem] leading-tight tracking-tight text-foreground">CourtOS <span className="text-muted-foreground">Recherche</span></Link>
                <nav aria-label="Recherchebereiche" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <Link href="/research" aria-current={!inLibrary ? "page" : undefined} className={`flex min-h-11 items-center underline-offset-8 ${!inLibrary ? "underline" : "hover:underline"}`}>Recherche</Link>
                    <Link href="/library" aria-current={inLibrary ? "page" : undefined} className={`flex min-h-11 items-center underline-offset-8 ${inLibrary ? "underline" : "hover:underline"}`}>Meine Bibliothek</Link>
                    <a href={COURTOS_CITECHECK_URL} target="_blank" rel="noopener noreferrer" title="Citecheck als separates Werkzeug öffnen; es werden keine Dokumente übergeben." className="flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:underline">Zitate prüfen <span aria-hidden="true" className="ml-1">↗</span></a>
                    <a href={COURTOS_GUIDE_PATH} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center text-muted-foreground underline-offset-8 hover:underline">Leitfaden</a>
                </nav>
            </div>
            <div className="mx-auto mt-1 flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs leading-relaxed text-muted-foreground">
                <p>Testbetrieb · Server in Deutschland · Keine vertraulichen Unterlagen</p>
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-4">
                    {user?.email && <p className="min-w-0 [overflow-wrap:anywhere]">{user.email}</p>}
                    <button type="button" disabled={leaving} onClick={() => void leave()} className="min-h-11 shrink-0 text-foreground underline underline-offset-4 disabled:opacity-60">{leaving ? "Wird abgemeldet…" : "Abmelden"}</button>
                </div>
            </div>
            {error && <p role="alert" className="mx-auto mt-2 max-w-[1440px] text-sm text-destructive">{error}</p>}
        </header>
        <main id="research-main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none">{children}</main>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-5 py-2 text-xs leading-relaxed text-muted-foreground sm:px-8">
            <p>OpenCaseLaw und Ihre Bibliothek · Fundstellen für Ihre eigenen Arbeitsmittel</p>
            <a href={COURTOS_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="min-h-6 py-1 underline underline-offset-4">Quellcode · AGPL-3.0 · auf MikeOSS aufgebaut</a>
        </footer>
    </div>;
}
