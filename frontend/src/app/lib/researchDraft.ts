export type ResearchDraft = { version: 1; ownerId: string; createdAt: number; text: string };
export const RESEARCH_DRAFT_KEY = "courtos:research:local";
export const RESEARCH_DRAFT_LIFETIME_MS = 30 * 60 * 1000;
const MAX_LENGTH = 12_000;

/** Text-only, same-tab preparation. No model call, file attachment or URL fetch. */
export function prepareResearchDraft(ownerId: string, text: string): boolean {
    if (typeof window === "undefined" || !ownerId || ownerId.length > 128 || !text.trim() || text.length > MAX_LENGTH) return false;
    try {
        window.sessionStorage.setItem(RESEARCH_DRAFT_KEY, JSON.stringify({ version: 1, ownerId, createdAt: Date.now(), text } satisfies ResearchDraft));
        return true;
    } catch { return false; }
}

export function getResearchDraft(ownerId: string): ResearchDraft | null {
    if (typeof window === "undefined" || !ownerId) return null;
    try {
        const raw = window.sessionStorage.getItem(RESEARCH_DRAFT_KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid draft");
        const draft = value as Partial<ResearchDraft>;
        if (draft.version !== 1 || draft.ownerId !== ownerId || typeof draft.createdAt !== "number" || !Number.isFinite(draft.createdAt) ||
            draft.createdAt > Date.now() || Date.now() - draft.createdAt > RESEARCH_DRAFT_LIFETIME_MS ||
            typeof draft.text !== "string" || !draft.text.trim() || draft.text.length > MAX_LENGTH) throw new Error("Invalid draft");
        return { version: 1, ownerId, createdAt: draft.createdAt, text: draft.text };
    } catch {
        try { window.sessionStorage.removeItem(RESEARCH_DRAFT_KEY); } catch { /* Disabled storage. */ }
        return null;
    }
}

/** Claim only on an explicit edit/send, keeping recovery possible across remounts. */
export function consumeResearchDraft(draft: ResearchDraft): void {
    const current = getResearchDraft(draft.ownerId);
    if (!current || current.createdAt !== draft.createdAt || current.text !== draft.text) return;
    try { window.sessionStorage.removeItem(RESEARCH_DRAFT_KEY); } catch { /* Best effort. */ }
}
