"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ResearchHandoffState } from "@mike/contracts";
import type { Citation, Message } from "@/app/components/shared/types";
import { ChatHistoryProvider, useChatHistoryContext } from "@/app/contexts/ChatHistoryContext";
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

type ConversationState = NonNullable<ResearchHandoffState["conversation"]>;
type Props = {
    owner: string;
    candidate: ResearchConversationSources;
    initialState?: ConversationState;
    onState(state: ConversationState): void;
    onTransferReady?(ready: boolean): void;
    onBinding?(locked: boolean): void;
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

function Conversation({ owner, candidate, initialState, onState, onTransferReady, onBinding, onEdit, onFindSources, onCitation }: Props) {
    const { t } = useCourtOSLocale();
    const { chats } = useChatHistoryContext();
    const [chatId, setChatId] = useState<string | undefined>(initialState?.chat_id ?? undefined);
    const [draft, setDraft] = useState(initialState?.draft ?? "");
    const [binding, setBinding] = useState<ResearchConversationSources | null>(null);
    const [loading, setLoading] = useState(!!initialState?.chat_id);
    const [failed, setFailed] = useState(false);
    const [reload, setReload] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [sendFailed, setSendFailed] = useState(false);
    const [sendIssue, setSendIssue] = useState<SourceGroundingIssue | null>(null);
    const draftRef = useRef(draft); draftRef.current = draft;
    const pendingQuestion = useRef("");
    const adopted = useRef<string | null>(null);
    const sending = useRef(false);
    const created = useCallback((id: string) => { adopted.current = id; onState({ chat_id: id, draft: draftRef.current }); setChatId(id); onTransferReady?.(true); }, [onState, onTransferReady]);
    const failedTurn = useCallback((issue?: SourceGroundingIssue) => { setSendIssue(issue ?? null); setSendFailed(true); setDraft(current => current || pendingQuestion.current); }, []);
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
        onEdit(); chat.resetChat(); pendingQuestion.current = ""; setBinding(null); setChatId(id); setFailed(false); setLoading(!!id);
        // The draft is deliberately retained when opening a saved conversation.
    }
    async function send(event: FormEvent) {
        event.preventDefault();
        if (sending.current || busy || loading || failed || issue || !draft.trim() || draft.length > 12000) return;
        const selected = snapshotConversationSources(sources);
        sending.current = true; setSubmitting(true); setSendFailed(false); setSendIssue(null); setBinding(selected); onEdit(); if (!chatId) onTransferReady?.(false);
        const content = draft.trim(); pendingQuestion.current = content; draftRef.current = ""; setDraft("");
        try {
            const result = await chat.handleChat({ role: "user", content, files: selected.files, public_sources: selected.public_sources, model: "courtos-local", reasoning: "none" });
            if (!result) setDraft(current => current || content);
        } catch { setSendFailed(true); setDraft(current => current || content); }
        finally { sending.current = false; setSubmitting(false); }
    }

    return <section className="courtos-conversation" aria-labelledby="research-conversation-title">
        <header className="courtos-conversation-header">
            <h2 id="research-conversation-title">{t(M.title)}</h2>
            {!!chat.messages.length && <button type="button" className="courtos-link" disabled={busy} onClick={() => selectChat()}>{t(M.newConversation)}</button>}
        </header>
        {!!chats?.some(item => item.project_id === null && item.user_id === owner) && <details className="courtos-conversation-history"><summary>{t(M.history)}</summary><select className="courtos-field" aria-label={t(M.history)} value={chatId ?? ""} disabled={busy} onChange={event => selectChat(event.target.value || undefined)}><option value="">{t(M.newOption)}</option>{chats.filter(item => item.project_id === null && item.user_id === owner).map(item => <option key={item.id} value={item.id}>{item.title || item.created_at.slice(0, 10)}</option>)}</select></details>}
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
            {binding && <p>{t(M.fixedSources)}</p>}
        </div>}
        {sendFailed && <p role="alert">{t(sendIssue ? sourceGroundingText("source_grounding_failed", sendIssue)! : M.requestFailed)}</p>}
        <form onSubmit={send} className="courtos-conversation-composer">
            <label htmlFor="research-question">{t(M.question)}</label>
            <textarea id="research-question" className="courtos-field" value={draft} rows={3} maxLength={12000} placeholder={t(M.placeholder)} onChange={event => { onEdit(); setDraft(event.target.value); }} disabled={loading} aria-describedby={issue ? "research-conversation-source-required" : undefined} />
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
