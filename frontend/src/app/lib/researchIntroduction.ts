"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const CHANGE_EVENT = "courtos:research-introduction-change";

function ownerKey(ownerId: string | null | undefined): string | null {
    return ownerId && ownerId.length <= 128
        ? `courtos:research:introduction:v1:${encodeURIComponent(ownerId)}`
        : null;
}

/** A browser presentation preference, never proof that the book was read. */
export function hasContinuedToResearch(ownerId: string | null | undefined): boolean {
    const key = ownerKey(ownerId);
    if (!key || typeof window === "undefined") return false;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const record = value as { version?: unknown; ownerId?: unknown; continued?: unknown };
        return record.version === 1 && record.ownerId === ownerId && record.continued === true;
    } catch { return false; }
}

/** Only an explicit continue action calls this; opening the guide does not. */
function rememberContinuation(ownerId: string): void {
    const key = ownerKey(ownerId);
    if (!key) return;
    try {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, ownerId, continued: true }));
    } catch { /* The current view still continues when browser storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
}

export function useResearchIntroduction(ownerId: string | null | undefined) {
    const [continuedOwner, setContinuedOwner] = useState<string | null>(null);
    const subscribe = useCallback((changed: () => void) => {
        const key = ownerKey(ownerId);
        const onStorage = (event: StorageEvent) => {
            if (event.key === key || event.key === null) changed();
        };
        const onChange = (event: Event) => {
            if ((event as CustomEvent<string>).detail === key) changed();
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener(CHANGE_EVENT, onChange);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(CHANGE_EVENT, onChange);
        };
    }, [ownerId]);
    const snapshot = useCallback(() => hasContinuedToResearch(ownerId), [ownerId]);
    const persisted = useSyncExternalStore(subscribe, snapshot, () => false);
    const continueToResearch = useCallback(() => {
        if (!ownerId || !ownerKey(ownerId)) return;
        setContinuedOwner(ownerId);
        rememberContinuation(ownerId);
    }, [ownerId]);
    return { showIntroduction: !persisted && (!ownerId || continuedOwner !== ownerId), continueToResearch };
}
