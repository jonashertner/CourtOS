export type FrontierDraft = {
    version: 1;
    ownerId: string;
    createdAt: number;
    text: string;
    chatId?: string;
};

export const FRONTIER_OUTBOUND_KEY = "courtos:frontier:outbound";
export const FRONTIER_RETURN_KEY = "courtos:frontier:return";
export const FRONTIER_DRAFT_MAX_LENGTH = 12_000;
export const FRONTIER_DRAFT_LIFETIME_MS = 30 * 60 * 1000;

/** Browser-only hand-off. The receiving app must compare ownerId with its
 * independently verified native /api/auth/session identity before displaying it. */
export function prepareFrontierDraft(ownerId: string, text: string, chatId?: string): boolean {
    if (typeof window === "undefined" || !ownerId || ownerId.length > 128 ||
        !text.trim() || text.length > FRONTIER_DRAFT_MAX_LENGTH ||
        (chatId !== undefined && (!chatId || chatId.length > 128))) return false;
    const draft: FrontierDraft = { version: 1, ownerId, createdAt: Date.now(), text, ...(chatId ? { chatId } : {}) };
    try {
        window.sessionStorage.setItem(FRONTIER_OUTBOUND_KEY, JSON.stringify(draft));
        return true;
    } catch {
        return false;
    }
}

/** Reject old, malformed, future-dated or foreign drafts. Never infer identity
 * from this untrusted storage; ownerId must come from the current auth session. */
export function getFrontierReturnDraft(ownerId: string): FrontierDraft | null {
    if (typeof window === "undefined" || !ownerId) return null;
    try {
        const raw = window.sessionStorage.getItem(FRONTIER_RETURN_KEY);
        if (!raw) return null;
        const draft: unknown = JSON.parse(raw);
        if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error("Invalid draft");
        const value = draft as Partial<FrontierDraft>;
        if (value.version !== 1 || value.ownerId !== ownerId ||
            typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) ||
            value.createdAt > Date.now() || Date.now() - value.createdAt > FRONTIER_DRAFT_LIFETIME_MS ||
            typeof value.text !== "string" || !value.text.trim() || value.text.length > FRONTIER_DRAFT_MAX_LENGTH ||
            (value.chatId !== undefined && (typeof value.chatId !== "string" || !value.chatId || value.chatId.length > 128))) {
            throw new Error("Invalid draft");
        }
        return { version: 1, ownerId, createdAt: value.createdAt, text: value.text, ...(value.chatId ? { chatId: value.chatId } : {}) };
    } catch {
        try { window.sessionStorage.removeItem(FRONTIER_RETURN_KEY); } catch { /* Storage may be disabled. */ }
        return null;
    }
}

/** Consume only the draft actually placed in the composer, preserving a newer one. */
export function consumeFrontierReturnDraft(draft: FrontierDraft): void {
    const current = getFrontierReturnDraft(draft.ownerId);
    if (!current || current.createdAt !== draft.createdAt || current.text !== draft.text || current.chatId !== draft.chatId) return;
    try { window.sessionStorage.removeItem(FRONTIER_RETURN_KEY); } catch { /* Best effort. */ }
}
