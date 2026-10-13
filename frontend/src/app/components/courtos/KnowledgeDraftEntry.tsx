"use client";

import { useEffect, useState, type RefObject } from "react";
import type { ChatInputHandle } from "@/app/components/assistant/ChatInput";
import { consumeKnowledgeDraft, getKnowledgeDraft } from "@/app/lib/knowledgeDraft";

export function KnowledgeDraftEntry({ owner, inputRef }: { owner: string; inputRef: RefObject<ChatInputHandle | null> }) {
    const [status, setStatus] = useState<"none" | "pending" | "prepared">("none");
    function applyDraft() {
        const draft = getKnowledgeDraft(owner);
        if (!draft) { setStatus("none"); return; }
        if (inputRef.current?.prepareKnowledgeDraft?.(draft.prompt, draft.documents)) {
            consumeKnowledgeDraft(draft); setStatus("prepared");
        } else setStatus("pending");
    }
    useEffect(() => {
        const draft = getKnowledgeDraft(owner);
        if (!draft) return;
        if (inputRef.current?.prepareKnowledgeDraft?.(draft.prompt, draft.documents)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- a stored knowledge draft is read once per owner
            consumeKnowledgeDraft(draft); setStatus("prepared");
        } else setStatus("pending");
    }, [owner, inputRef]);
    if (status === "none") return null;
    return <aside className="mb-4 rounded-xl border border-border px-4 py-3 text-sm leading-relaxed" aria-label="Entwurf aus der Wissensbasis">
        {status === "prepared" ? <p role="status">Ihre Frage und die ausgewählten Quellen sind im Eingabefeld vorbereitet. Prüfen und ändern Sie den Auftrag; erst mit Senden beginnt eine Modellanfrage und zählt zum Tageslimit.</p> : <><p>Eine Frage mit Quellen aus der Wissensbasis wartet. Ihr vorhandener Entwurf bleibt erhalten. Leeren Sie bei Bedarf zuerst das Eingabefeld und entfernen Sie dessen Anhänge.</p><button type="button" className="mt-2 min-h-10 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" onClick={applyDraft}>Vorbereiteten Entwurf übernehmen</button></>}
    </aside>;
}
