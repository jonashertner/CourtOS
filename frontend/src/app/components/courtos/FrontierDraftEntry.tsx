"use client";

import { ProcessingLocation } from "@/app/components/courtos/ProcessingLocation";

import { useEffect, useState, type RefObject } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ChatInputHandle } from "@/app/components/assistant/ChatInput";
import { consumeFrontierReturnDraft, getFrontierReturnDraft } from "@/app/lib/frontierDraft";

export function FrontierDraftEntry({ inputRef, chatId }: { inputRef: RefObject<ChatInputHandle | null>; chatId?: string | null }) {
    const { user } = useAuth();
    const [status, setStatus] = useState<{ owner: string; value: "pending" | "prepared" } | null>(null);
    function applyDraft() {
        if (!user?.id) return;
        const draft = getFrontierReturnDraft(user.id);
        if (!draft || (chatId && draft.chatId !== chatId)) { setStatus(null); return; }
        if (inputRef.current?.prepareFrontierDraft?.(draft.text, () => consumeFrontierReturnDraft(draft))) {
            setStatus({ owner: user.id, value: "prepared" });
        } else setStatus({ owner: user.id, value: "pending" });
    }
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- a stored return draft is read once per user and chat
        setStatus(null);
        if (!user?.id) return;
        const draft = getFrontierReturnDraft(user.id);
        if (!draft || (chatId && draft.chatId !== chatId)) return;
        if (inputRef.current?.prepareFrontierDraft?.(draft.text, () => consumeFrontierReturnDraft(draft))) {
            setStatus({ owner: user.id, value: "prepared" });
        } else setStatus({ owner: user.id, value: "pending" });
    }, [user?.id, chatId, inputRef]);
    if (!status || status.owner !== user?.id) return null;
    return <aside className="courtos-route-note mb-3 text-sm leading-relaxed" data-processing-route="server" aria-label="Rückkehr aus der Frontier-Prüfung">
        {status.value === "prepared" ? <p role="status"><ProcessingLocation service="gemma" stage="draft">Die externe Antwort liegt im Eingabefeld. Erst mit Senden beginnt die Weiterarbeit auf dem CourtOS-Server.</ProcessingLocation></p> : <><p>Ein Text aus der Frontier-Prüfung ist verfügbar. Ihr vorhandener Entwurf bleibt erhalten.</p><button type="button" className="mt-1 min-h-11 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" onClick={applyDraft}>In leeres Eingabefeld übernehmen</button></>}
    </aside>;
}
