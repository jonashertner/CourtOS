import type { Document } from "@/app/components/shared/types";

type KnowledgeDraft = { owner: string; created: number; prompt: string; documents: Document[] };
let pending: KnowledgeDraft | null = null;
const LIFETIME_MS = 5 * 60 * 1000;

/** A same-tab hand-off, never persisted in browser storage or a URL. */
export function prepareKnowledgeDraft(owner: string, question: string, documents: Document[]) {
    if (!owner || !question.trim() || documents.length < 1 || documents.length > 20) return false;
    pending = {
        owner, created: Date.now(), documents: documents.map((document) => ({ ...document })),
        prompt: `Frage: ${question.trim()}\n\nSuche gezielt in den beigefügten Quellen. Begründe die Antwort mit wörtlichen Belegen, Dokument, Fassung und Seite. Unterscheide belegte Aussagen, abweichende Aussagen und offene Fragen. Weise auf nicht erfasste oder nicht lesbare Stellen hin. Erfinde keine Quellen und keinen Entscheid.`,
    };
    return true;
}

export function getKnowledgeDraft(owner: string) {
    if (!pending) return null;
    if (pending.owner !== owner || Date.now() - pending.created > LIFETIME_MS) { pending = null; return null; }
    return pending;
}

export function consumeKnowledgeDraft(draft: NonNullable<ReturnType<typeof getKnowledgeDraft>>) {
    if (pending === draft) pending = null;
}
