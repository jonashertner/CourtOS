"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { KnowledgeWorkspace } from "@/app/components/courtos/KnowledgeWorkspace";
import { COURTOS_KNOWLEDGE_ENABLED } from "@/app/lib/courtos";
import { connectWordResearchHost, type WordResearchHost } from "@/app/lib/wordResearchHost";

import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { researchMessages as M } from "@/app/lib/researchMessages";

export default function WordResearchPage() {
    const {t} = useCourtOSLocale();
    const [loadOffice, setLoadOffice] = useState(false);
    const [host, setHost] = useState<WordResearchHost | null>(null);
    const [error, setError] = useState(false);
    const active = useRef(false);
    const generation = useRef(0);
    const historyMethods = useRef<Pick<History, "pushState" | "replaceState"> | null>(null);
    const scriptTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const restoreHistory = useCallback(() => {
        // Office.js nulls these methods. Preserve Next's own wrappers, not fresh native ones.
        const saved = historyMethods.current;
        if (!saved) return;
        if (typeof window.history.pushState !== "function") window.history.pushState = saved.pushState;
        if (typeof window.history.replaceState !== "function") window.history.replaceState = saved.replaceState;
    }, []);

    useEffect(() => {
        if (!COURTOS_KNOWLEDGE_ENABLED) return;
        active.current = true;
        historyMethods.current = { pushState: window.history.pushState, replaceState: window.history.replaceState };
        // Load only after the existing history methods have been captured.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time host bootstrap, no document read
        setLoadOffice(true);
        scriptTimeout.current = setTimeout(() => {
            if (active.current) setError(true);
        }, 20_000);
        return () => {
            active.current = false;
            generation.current += 1;
            clearTimeout(scriptTimeout.current);
            restoreHistory();
        };
    }, [restoreHistory]);

    const connect = useCallback(() => {
        restoreHistory();
        clearTimeout(scriptTimeout.current);
        const attempt = ++generation.current;
        void connectWordResearchHost().then((nextHost) => {
            if (active.current && generation.current === attempt) { setHost(nextHost); setError(false); }
        }).catch(() => {
            if (active.current && generation.current === attempt) setError(true);
        });
    }, [restoreHistory]);

    if (!COURTOS_KNOWLEDGE_ENABLED) return <div className="p-8"><h1 className="font-serif text-3xl">{t(M.research)}</h1><p className="mt-4">{t(M.researchDisabled)}</p><Link className="courtos-link mt-5" href="/pilot">CourtOS</Link></div>;

    return <>
        {loadOffice && <Script
            id="courtos-word-office"
            src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
            strategy="afterInteractive"
            onLoad={restoreHistory}
            onReady={connect}
            onError={() => {
                restoreHistory(); clearTimeout(scriptTimeout.current);
                if (active.current) setError(true);
            }}
        />}
        <KnowledgeWorkspace wordHost={host} wordHostError={error ? t(M.wordUnavailable) : undefined} />
    </>;
}
