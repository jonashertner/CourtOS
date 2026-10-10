"use client";

import { useEffect, useState, type RefObject } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ChatInputHandle } from "@/app/components/assistant/ChatInput";
import { consumeResearchDraft, getResearchDraft } from "@/app/lib/researchDraft";

export function ResearchDraftEntry({ inputRef }: { inputRef: RefObject<ChatInputHandle | null> }) {
    const { user } = useAuth();
    const [status, setStatus] = useState<{ owner: string; prepared: boolean } | null>(null);
    function applyDraft() {
        if (!user?.id) return;
        const draft = getResearchDraft(user.id);
        if (!draft) { setStatus(null); return; }
        const prepared = inputRef.current?.prepareFrontierDraft?.(draft.text, () => consumeResearchDraft(draft)) ?? false;
        setStatus({ owner: user.id, prepared });
    }
    useEffect(() => {
        setStatus(null);
        if (!user?.id) return;
        const draft = getResearchDraft(user.id);
        if (!draft) return;
        const prepared = inputRef.current?.prepareFrontierDraft?.(draft.text, () => consumeResearchDraft(draft)) ?? false;
        setStatus({ owner: user.id, prepared });
    }, [user?.id, inputRef]);
    if (!status || status.owner !== user?.id) return null;
    return <aside className="mb-3 border-l-2 border-border pl-3 text-sm leading-relaxed" aria-label="Auftrag aus der Recherche">
        {status.prepared ? <p role="status">Ihre Frage und die ausgewählte Fundstelle liegen im Eingabefeld. Erst mit Senden beginnt die Anfrage an Gemma auf dem CourtOS-Server.</p> : <><p>Ein Auftrag aus der Recherche ist verfügbar. Ihr vorhandener Entwurf und seine Anhänge bleiben erhalten.</p><button type="button" className="mt-1 min-h-11 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" onClick={applyDraft}>In leeres Eingabefeld übernehmen</button></>}
    </aside>;
}
