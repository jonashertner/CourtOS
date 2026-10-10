"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ResearchModel = "gemma" | "claude-opus-5-5";
const DEFAULT_MODEL: ResearchModel = "gemma";
const CHANGE_EVENT = "courtos:research-model-change";
const failedWrites = new Set<string>();

function preferenceKey(ownerId: string | null | undefined): string | null {
    return ownerId && ownerId.length <= 128
        ? `courtos:research:model:v1:${encodeURIComponent(ownerId)}`
        : null;
}

function isModel(value: unknown): value is ResearchModel {
    return value === "gemma" || value === "claude-opus-5-5";
}

/** Presentation preference only. It never sends an order or authorises external processing. */
export function getResearchModelPreference(ownerId: string | null | undefined): ResearchModel {
    const key = preferenceKey(ownerId);
    if (!key || typeof window === "undefined" || failedWrites.has(key)) return DEFAULT_MODEL;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return DEFAULT_MODEL;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_MODEL;
        const preference = value as { version?: unknown; ownerId?: unknown; model?: unknown };
        return preference.version === 1 && preference.ownerId === ownerId && isModel(preference.model)
            ? preference.model
            : DEFAULT_MODEL;
    } catch { return DEFAULT_MODEL; }
}

/** A failed write is immediately local, including when an older external choice still exists. */
export function setResearchModelPreference(ownerId: string | null | undefined, model: ResearchModel): ResearchModel {
    const key = preferenceKey(ownerId);
    if (!key || typeof window === "undefined") return DEFAULT_MODEL;
    try {
        if (!isModel(model)) throw new Error("Invalid model preference");
        window.localStorage.setItem(key, JSON.stringify({ version: 1, ownerId, model }));
        failedWrites.delete(key);
    } catch {
        failedWrites.add(key);
        try { window.localStorage.removeItem(key); } catch { /* Disabled storage stays local in this tab. */ }
    }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
    return getResearchModelPreference(ownerId);
}

/** Re-reads by owner on every snapshot, avoiding a previous account's transient selection. */
export function useResearchModelPreference(ownerId: string | null | undefined, externalAvailable = true) {
    const subscribe = useCallback((changed: () => void) => {
        const key = preferenceKey(ownerId);
        const onStorage = (event: StorageEvent) => {
            if (event.key === key || event.key === null) changed();
        };
        const onLocalChange = (event: Event) => {
            if ((event as CustomEvent<string>).detail === key) changed();
        };
        window.addEventListener("storage", onStorage);
        window.addEventListener(CHANGE_EVENT, onLocalChange);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(CHANGE_EVENT, onLocalChange);
        };
    }, [ownerId]);
    const snapshot = useCallback(() => externalAvailable ? getResearchModelPreference(ownerId) : DEFAULT_MODEL, [ownerId, externalAvailable]);
    const model = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_MODEL);
    const setModel = useCallback((next: ResearchModel) => setResearchModelPreference(ownerId, externalAvailable ? next : DEFAULT_MODEL), [ownerId, externalAvailable]);
    return { model, setModel };
}
