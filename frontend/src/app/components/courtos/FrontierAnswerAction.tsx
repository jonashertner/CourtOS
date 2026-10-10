"use client";

import { ProcessingLocation } from "@/app/components/courtos/ProcessingLocation";

import { useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { COURTOS_HYBRID_PATH } from "@/app/lib/courtos";
import { FRONTIER_DRAFT_MAX_LENGTH, prepareFrontierDraft } from "@/app/lib/frontierDraft";

export function FrontierAnswerAction({ text, chatId }: { text: string; chatId?: string | null }) {
    const { user } = useAuth();
    const [error, setError] = useState<string | null>(null);
    if (!user?.id || !text.trim()) return null;
    function prepare() {
        if (!user?.id) return;
        if (text.length > FRONTIER_DRAFT_MAX_LENGTH) {
            setError("Die Antwort umfasst mehr als 12’000 Zeichen. Öffnen Sie die Frontier-Prüfung und übernehmen Sie dort den gewünschten Ausschnitt.");
            return;
        }
        if (!prepareFrontierDraft(user.id, text, chatId ?? undefined)) {
            setError("Der Browser konnte den Text nicht für den Wechsel bereithalten. Öffnen Sie die Frontier-Prüfung und übernehmen Sie den Text manuell.");
            return;
        }
        window.location.assign(COURTOS_HYBRID_PATH);
    }
    return <div className="min-w-0 text-sm">
        <button type="button" onClick={prepare} className="min-h-11 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Mit Frontier prüfen</button>
        <ProcessingLocation service="anthropic" stage="draft">Öffnet die Vorschau. Erst dort ausdrücklich senden.</ProcessingLocation>
        {error && <p role="alert" className="mt-2 max-w-prose text-sm text-destructive">{error} <a className="underline focus-visible:outline-2 focus-visible:outline-ring" href={COURTOS_HYBRID_PATH}>Frontier-Prüfung öffnen</a></p>}
    </div>;
}
