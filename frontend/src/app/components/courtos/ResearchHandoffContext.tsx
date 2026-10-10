"use client";

import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import type { CourtOSText } from "@/app/lib/courtosLocale";
import { researchMessages as M } from "@/app/lib/researchMessages";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getWordResearchDocumentScope } from "@/app/lib/wordResearchHost";
import type { ResearchHandoffMetadata, ResearchHandoffRecord, ResearchHandoffState } from "@mike/contracts";
import { acknowledgeResearchHandoff, createResearchHandoff, getResearchHandoff, getResearchHandoffMetadata, getResearchHandoffReference, parseResearchHandoffLocation, clearPendingResearchHandoff, clearResearchHandoffLocation, getPendingResearchHandoff, researchHandoffUrl, storeResearchHandoffReference, updateResearchHandoff, ResearchHandoffError, emptyResearchHandoffState } from "@/app/lib/researchHandoff";

export const emptyResearchState = emptyResearchHandoffState;
type Workspace = { getState(): ResearchHandoffState; applyState(state: ResearchHandoffState): void };
type HandoffContext = {
    inWord: boolean;
    register(workspace: Workspace): () => void;
    changed(state: ResearchHandoffState): void;
    edited(): void;
    bindWordDocument(scope: string | null): void;
    publish(): Promise<string | null>;
    busy: boolean;
    available: boolean;
    linked: boolean;
    status: string;
    error: string;
    fallbackUrl: string | null;
    setFallbackUrl(url: string | null): void;
    conflict: boolean;
    acceptReturned(): Promise<void>;
    keepLocal(): Promise<void>;
};
const Context = createContext<HandoffContext | null>(null);
export const useResearchHandoff = () => useContext(Context);

const handoffErrors: Record<ResearchHandoffError["code"], CourtOSText> = {
    invalid: M.handoffInvalid, unavailable: M.handoffFailed, account: M.handoffAccount,
    conflict: M.handoffStale, limit: M.handoffLimit, expired: M.handoffExpired,
};
function handoffErrorMessage(error: unknown, fallback: CourtOSText) {
    return error instanceof ResearchHandoffError ? handoffErrors[error.code] : fallback;
}

/** Account-owned temporary research state; no document writes or automatic searches. */
export function ResearchHandoffProvider({ ownerId, inWord, children }: { ownerId: string; inWord: boolean; children: ReactNode }) {
    const { t } = useCourtOSLocale();
    const workspace = useRef<Workspace | null>(null);
    const latest = useRef<ResearchHandoffState>(emptyResearchState());
    const reference = useRef<ResearchHandoffMetadata | null>(null);
    const generation = useRef(0);
    const baseline = useRef<number | null>(null);
    const [documentScope, setDocumentScope] = useState<string | null | undefined>(undefined);
    const scopeValue = useRef<string | null | undefined>(undefined);
    const pending = useRef<ResearchHandoffRecord | null>(null);
    const checking = useRef(false);
    const dispatching = useRef(false);
    const alive = useRef(true);
    const operationEpoch = useRef(0);
    const isCurrent = useCallback((epoch: number) => alive.current && operationEpoch.current === epoch, []);
    const [busy, setBusy] = useState(false);
    const [available, setAvailable] = useState(false);
    const [linked, setLinked] = useState(false);
    const [status, setStatus] = useState<CourtOSText | null>(null);
    const [error, setError] = useState<CourtOSText | null>(null);
    const [conflict, setConflict] = useState(false);
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
    const host = inWord ? "word" : "browser";

    const remember = useCallback((meta: ResearchHandoffMetadata) => {
        reference.current = meta;
        storeResearchHandoffReference(ownerId, { id: meta.id, revision: meta.revision, expires_at: meta.expires_at, host }, documentScope ?? undefined);
        setLinked(true);
    }, [ownerId, host, documentScope]);

    const applyRecord = useCallback(async (record: ResearchHandoffRecord, force = false) => {
        const epoch = operationEpoch.current;
        if (!isCurrent(epoch)) return;
        if (!force && baseline.current !== null && generation.current !== baseline.current) {
            pending.current = record; setConflict(true); setStatus(M.handoffConflict); return;
        }
        pending.current = record;
        if (!workspace.current) { setStatus(M.handoffReady); return; }
        workspace.current.applyState(record.state);
        latest.current = record.state; baseline.current = generation.current;
        pending.current = null; remember(record); setConflict(false); setError(null);
        setStatus(inWord ? M.acceptedBrowser : M.acceptedWord);
        if (inWord && record.direction === "to_word") {
            try { const acknowledged = await acknowledgeResearchHandoff(record.id, record.revision); if (isCurrent(epoch)) remember(acknowledged); }
            catch { if (isCurrent(epoch)) setError(M.ackFailed); }
        }
    }, [inWord, remember, isCurrent]);

    const register = useCallback((next: Workspace) => {
        workspace.current = next; setAvailable(true);
        if (pending.current && !conflict) void applyRecord(pending.current);
        else latest.current = next.getState();
        return () => { if (workspace.current === next) workspace.current = null; };
    }, [applyRecord, conflict]);
    const changed = useCallback((state: ResearchHandoffState) => { latest.current = state; }, []);
    const edited = useCallback(() => { generation.current += 1; }, []);
    const bindWordDocument = useCallback((scope: string | null) => {
        if (scopeValue.current !== scope) {
            operationEpoch.current += 1;
            dispatching.current = false; checking.current = false; setBusy(false);
        }
        if (scopeValue.current !== undefined && scopeValue.current !== scope) {
            reference.current = null; pending.current = null; baseline.current = null;
            setLinked(false); setConflict(false); setFallbackUrl(null);
            setStatus(M.documentChanged);
        }
        scopeValue.current = scope; setDocumentScope(scope);
    }, []);

    useEffect(() => {
        alive.current = true;
        const epoch = operationEpoch.current;
        const controller = new AbortController();
        const current = () => isCurrent(epoch) && !controller.signal.aborted;
        const dispose = () => { controller.abort(); alive.current = false; operationEpoch.current += 1; checking.current = false; dispatching.current = false; };
        if (inWord && documentScope === undefined) return dispose;
        const fragmentId = !inWord ? parseResearchHandoffLocation(window.location.search, window.location.hash) : null;
        const saved = getResearchHandoffReference(ownerId, host, documentScope ?? undefined);
        const id = fragmentId || (!inWord ? getPendingResearchHandoff() : null) || saved?.id;
        if (id) {
            setBusy(true); baseline.current = generation.current;
            void getResearchHandoff(id, controller.signal).then(record => { if (current()) { remember(record); if (!inWord) { clearPendingResearchHandoff(); clearResearchHandoffLocation(); } return applyRecord(record); } })
                .catch(problem => { if (current()) setError(handoffErrorMessage(problem, M.handoffUnavailable)); })
                .finally(() => { if (current()) setBusy(false); });
        }
        else setBusy(false);
        return dispose;
    }, [ownerId, host, inWord, documentScope, remember, applyRecord, isCurrent]);

    const checkReturn = useCallback(async () => {
        const current = reference.current;
        if (!inWord || !current || checking.current || pending.current || document.visibilityState === "hidden" || Date.parse(current.expires_at) <= Date.now()) return;
        checking.current = true;
        const epoch = operationEpoch.current;
        try {
            if (documentScope) {
                const actualScope = await getWordResearchDocumentScope();
                if (!isCurrent(epoch)) return;
                if (actualScope !== documentScope) { bindWordDocument(actualScope); return; }
            }
            const meta = await getResearchHandoffMetadata(current.id);
            if (!isCurrent(epoch) || reference.current?.id !== current.id) return;
            if (meta.direction === "to_word" && meta.revision > current.acknowledged_revision && meta.revision > current.revision) {
                const record = await getResearchHandoff(current.id);
                if (isCurrent(epoch) && reference.current?.id === current.id) await applyRecord(record);
            }
        } catch { /* A transient poll failure never alters or republishes local research. */ }
        finally { if (isCurrent(epoch)) checking.current = false; }
    }, [inWord, applyRecord, documentScope, bindWordDocument, isCurrent]);
    useEffect(() => {
        if (!inWord || !linked) return;
        const timer = setInterval(() => { void checkReturn(); }, 5000);
        const check = () => { void checkReturn(); };
        window.addEventListener("focus", check); document.addEventListener("visibilitychange", check);
        return () => { clearInterval(timer); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
    }, [inWord, linked, checkReturn]);

    async function publish(): Promise<string | null> {
        if (dispatching.current || busy || !available || conflict) return null;
        dispatching.current = true; setBusy(true); setError(null); setFallbackUrl(null);
        const state = workspace.current?.getState() ?? latest.current;
        const atSend = generation.current;
        const epoch = operationEpoch.current;
        try {
            if (inWord && documentScope) {
                const actualScope = await getWordResearchDocumentScope();
                if (!isCurrent(epoch)) return null;
                if (actualScope !== documentScope) { bindWordDocument(actualScope); return null; }
            }
            const current = reference.current && Date.parse(reference.current.expires_at) > Date.now() ? reference.current : null;
            const meta = current
                ? await updateResearchHandoff(current.id, current.revision, state, inWord ? "to_browser" : "to_word")
                : inWord ? await createResearchHandoff(state) : null;
            if (!isCurrent(epoch) || !meta) return null;
            remember(meta); baseline.current = atSend;
            setStatus(inWord ? M.readyBrowser : M.readyWord);
            return inWord ? researchHandoffUrl(window.location.origin, meta.id) : null;
        } catch (problem) { if (isCurrent(epoch)) setError(handoffErrorMessage(problem, M.handoffFailed)); return null; }
        finally { if (isCurrent(epoch)) { dispatching.current = false; setBusy(false); } }
    }
    async function acceptReturned() { if (pending.current) await applyRecord(pending.current, true); }
    async function keepLocal() {
        const record = pending.current; if (!record) return;
        const epoch = operationEpoch.current;
        setBusy(true);
        try {
            const meta = await acknowledgeResearchHandoff(record.id, record.revision);
            if (!isCurrent(epoch)) return;
            remember(meta); pending.current = null; baseline.current = generation.current;
            setConflict(false); setStatus(M.keptLocal); setError(null);
        } catch { if (isCurrent(epoch)) setError(M.keepFailed); }
        finally { if (isCurrent(epoch)) setBusy(false); }
    }
    return <Context.Provider value={{ inWord, register, changed, edited, bindWordDocument, publish, busy, available, linked, status: status ? t(status) : "", error: error ? t(error) : "", fallbackUrl, setFallbackUrl, conflict, acceptReturned, keepLocal }}>{children}</Context.Provider>;
}
