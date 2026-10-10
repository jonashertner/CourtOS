"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ResearchHandoffState } from "@mike/contracts";
import type { Citation, Message } from "@/app/components/shared/types";
import { ChatHistoryProvider } from "@/app/contexts/ChatHistoryContext";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { useAssistantChat } from "@/app/hooks/useAssistantChat";
import { loadAssistantChat } from "@/app/lib/assistantTurns";
import { canDisplaySourceAnswer, conversationSourceIssue, conversationSourcesFromHistory, snapshotConversationSources, type ResearchConversationSources } from "@/app/lib/researchConversation";
import { sourceGroundingText } from "@/app/lib/sourceGroundingMessages";
import type { SourceGroundingIssue } from "@mike/contracts";
import { courtOSMessages } from "@/app/lib/courtosMessages";
import { researchConversationMessages as M } from "@/app/lib/researchConversationMessages";
import { AssistantMessage } from "@/app/components/assistant/AssistantMessage";
import { ProcessingLocation } from "./ProcessingLocation";
import { PersonalConversationHistory } from "./PersonalConversationHistory";

type ConversationState = NonNullable<ResearchHandoffState["conversation"]>;
type Props = {
    owner: string;
    candidate: ResearchConversationSources;
    initialState?: ConversationState;
    onState(state: ConversationState): void;
    onTransferReady?(ready: boolean): void;
    onBinding?(locked: boolean): void;
    onRemovePublicSource?(): void;
    onEdit(): void;
    onFindSources(mode: "public" | "private"): void;
    onCitation(citation: Citation): void;
};

function SourceAnswer({ message, busy, chatId, onCitation }: { message: Message; busy: boolean; chatId?: string; onCitation(citation: Citation): void }) {
    const { t } = useCourtOSLocale();
    if (canDisplaySourceAnswer(message)) return <AssistantMessage chatId={chatId} events={message.events} citations={message.citations} citationStatus={message.citationStatus} isStreaming={busy} allowFrontier={false} onCitationClick={onCitation} onOpenCitationSource={onCitation} />;
    if (busy) {
        const progress = [...(message.events ?? [])].reverse().find(event => event.type === "thinking");
        return <p role="status">{t(progress?.type === "thinking" && progress.providerPhase === "queued" ? courtOSMessages.localModelQueued : M.reviewing)}</p>;
    }
    const error = message.events?.find(event => event.type === "error");
    const description = error?.type === "error" ? sourceGroundingText(error.code, error.source_issue) : null;
    return <p role="alert" className="courtos-conversation-hint">{t(description ?? M.withheldHistory)}</p>;
}

function Conversation({ owner, candidate, initialState, onState, onTransferReady, onBinding, onRemovePublicSource, onEdit, onFindSources, onCitation }: Props) {
    const { t } = useCourtOSLocale();
    const [chatId, setChatId] = useState<string | undefined>(initialState?.chat_id ?? undefined);
    const [draft, setDraft] = useState(initialState?.draft ?? "");
    const [binding, setBinding] = useState<ResearchConversationSources | null>(null);
    const [loading, setLoading] = useState(!!initialState?.chat_id);
    const [failed, setFailed] = useState(false);
    const [reload, setReload] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [sendFailed, setSendFailed] = useState(false);
    const [sendIssue, setSendIssue] = useState<SourceGroundingIssue | null>(null);
    // These drafts belong to this owner-keyed view, not to another conversation.
    // Only the active draft participates in the existing Word/browser handoff.
    const draftKey = useRef(chatId ?? "new");
    const drafts = useRef(new Map([[draftKey.current, draft]]));
    const draftRef = useRef(draft);
    const changeDraft = useCallback((value: string) => {
        draftRef.current = value;
        drafts.current.set(draftKey.current, value);
        setDraft(value);
    }, []);
    const pendingQuestion = useRef("");
    const adopted = useRef<string | null>(null);
    const sending = useRef(false);
    const created = useCallback((id: string) => {
        drafts.current.set(id, draftRef.current);
        if (draftKey.current === "new") drafts.current.set("new", "");
        draftKey.current = id;
        adopted.current = id;
        onState({ chat_id: id, draft: draftRef.current });
        setChatId(id); onTransferReady?.(true);
    }, [onState, onTransferReady]);
    const failedTurn = useCallback((issue?: SourceGroundingIssue) => {
        setSendIssue(issue ?? null); setSendFailed(true);
        if (!draftRef.current) changeDraft(pendingQuestion.current);
    }, [changeDraft]);
    const chat = useAssistantChat({ chatId, onChatCreated: created, onTurnFailed: failedTurn });
    const setMessages = chat.setMessages;
    const busy = submitting || chat.isResponseLoading;
    const sources = binding ?? candidate;
    const issue = conversationSourceIssue(sources);
    const issueMessage = issue === "empty" ? M.chooseFirst : issue === "many" ? M.sourceLimit : M.sourceNotReady;

    useEffect(() => { onBinding?.(binding !== null || !!chatId); }, [binding, chatId, onBinding]);
    useEffect(() => { onTransferReady?.(!(busy && !chatId) && !loading && !failed); }, [busy, chatId, loading, failed, onTransferReady]);
    useEffect(() => { onState({ chat_id: chatId ?? null, draft }); }, [chatId, draft, onState]);
    useEffect(() => {
        if (!chatId) { setLoading(false); setFailed(false); return; }
        if (adopted.current === chatId) { adopted.current = null; return; }
        let cancelled = false;
        setLoading(true); setFailed(false); setBinding(null); setMessages([]);
        void loadAssistantChat(chatId).then(result => {
            if (cancelled) return;
            // Personal conversation ownership is checked again by every backend request.
            if (result.chat.id !== chatId || result.chat.user_id !== owner || result.chat.project_id !== null || result.chat.access_role !== "owner") throw new Error("unavailable");
            setBinding(conversationSourcesFromHistory(result.messages));
            setMessages(result.messages);
        }).catch(() => { if (!cancelled) setFailed(true); }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [chatId, owner, reload, setMessages]);

    function selectChat(id?: string) {
        if (busy) return;
        if (id && id === chatId) return;
        drafts.current.set(draftKey.current, draftRef.current);
        draftKey.current = id ?? "new";
        changeDraft(drafts.current.get(draftKey.current) ?? "");
        onEdit(); chat.resetChat(); pendingQuestion.current = ""; adopted.current = null;
        setSendFailed(false); setSendIssue(null); setBinding(null); setChatId(id); setFailed(false); setLoading(!!id);
    }
    async function send(event: FormEvent) {
        event.preventDefault();
        if (sending.current || busy || loading || failed || issue || !draft.trim() || draft.length > 12000) return;
        const selected = snapshotConversationSources(sources);
        sending.current = true; setSubmitting(true); setSendFailed(false); setSendIssue(null); setBinding(selected); onEdit(); if (!chatId) onTransferReady?.(false);
        const content = draft.trim(); pendingQuestion.current = content; changeDraft("");
        try {
            const result = await chat.handleChat({ role: "user", content, files: selected.files, public_sources: selected.public_sources, model: "courtos-local", reasoning: "none" });
            if (!result && !draftRef.current) changeDraft(content);
        } catch { setSendFailed(true); if (!draftRef.current) changeDraft(content); }
        finally { sending.current = false; setSubmitting(false); }
    }

    return <section className="courtos-conversation" aria-labelledby="research-conversation-title">
        <header className="courtos-conversation-header">
            <h2 id="research-conversation-title">{t(M.title)}</h2>
            {!!chat.messages.length && <button type="button" className="courtos-link" disabled={busy} onClick={() => selectChat()}>{t(M.newConversation)}</button>}
        </header>
        <PersonalConversationHistory owner={owner} selected={chatId} disabled={busy} onSelect={selectChat} />
        {loading && <p role="status">{t(M.loading)}</p>}
        {failed && <div role="alert"><p>{t(M.loadFailed)}</p><button type="button" className="courtos-link" onClick={() => setReload(value => value + 1)}>{t(M.reload)}</button></div>}
        {!!chat.messages.length && <div className="courtos-conversation-transcript" aria-label={t(M.transcript)}>
            {chat.messages.map((message, index) => message.role === "user"
                ? <p className="courtos-conversation-question" key={message.id ?? `user-${index}`}>{message.content}</p>
                : <SourceAnswer key={message.id ?? `assistant-${index}`} message={message} busy={chat.isResponseLoading && index === chat.messages.length - 1} chatId={chatId} onCitation={onCitation} />)}
        </div>}
        {!loading && !failed && <div className="courtos-conversation-sources" aria-label={t(M.sources)}>
            {sources.files.map(file => <span key={`${file.document_id}:${file.version_id}`}>{file.filename}{file.version_number ? ` · V${file.version_number}` : ""}</span>)}
            {sources.public_sources.map(source => <span key={`${source.decision_id}:${source.start}`}><span className="break-words">{source.decision_id}</span> · {t(M.publicExcerpt, { start: source.start, end: source.end })}</span>)}
            {!!sources.public_sources.length && !binding && onRemovePublicSource && <button type="button" className="courtos-link" onClick={onRemovePublicSource}>{t(M.removePublicSource)}</button>}
            {binding && <p>{t(M.fixedSources)}</p>}
        </div>}
        {sendFailed && <p role="alert">{t(sendIssue ? sourceGroundingText("source_grounding_failed", sendIssue)! : M.requestFailed)}</p>}
        <form onSubmit={send} className="courtos-conversation-composer">
            <label htmlFor="research-question">{t(M.question)}</label>
            <textarea id="research-question" className="courtos-field" value={draft} rows={3} maxLength={12000} placeholder={t(M.placeholder)} onChange={event => { onEdit(); changeDraft(event.target.value); }} disabled={loading} aria-describedby={issue ? "research-conversation-source-required" : undefined} />
            {issue && !loading && !failed && <p id="research-conversation-source-required" className="courtos-conversation-hint">{t(issueMessage)}</p>}
            <div className="courtos-conversation-actions">
                <ProcessingLocation service="gemma" stage={busy ? "pending" : "draft"} />
                {busy ? <button type="button" className="courtos-button courtos-button--secondary" onClick={chat.cancel}>{t(M.stop)}</button> : <button className="courtos-button" disabled={!!issue || loading || failed || !draft.trim()}>{t(M.send)}</button>}
            </div>
        </form>
        <div className="courtos-conversation-source-actions"><button type="button" className="courtos-link" disabled={!!binding || loading} title={binding ? t(M.sourceChange) : undefined} onClick={() => onFindSources("private")}>{t(M.ownSources)}</button><button type="button" className="courtos-link" disabled={!!binding || loading} title={binding ? t(M.sourceChange) : undefined} onClick={() => onFindSources("public")}>{t(M.findCases)}</button></div>
    </section>;
}

export function ResearchConversation(props: Props) {
    return <ChatHistoryProvider key={props.owner}><Conversation {...props} /></ChatHistoryProvider>;
}
