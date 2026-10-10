"use client";

import { useId, useState } from "react";
import { useChatHistoryContext } from "@/app/contexts/ChatHistoryContext";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { researchConversationMessages as M } from "@/app/lib/researchConversationMessages";

/** Personal title/date discovery only: never index, summarise or expose answer text. */
export function PersonalConversationHistory({owner,selected,disabled,onSelect}:{owner:string;selected?:string;disabled:boolean;onSelect:(id?:string)=>void}) {
    const {t,locale}=useCourtOSLocale();
    const {chats,hasMoreChats,loadingMoreChats,historyLoading,historyError,loadChats,loadMoreChats}=useChatHistoryContext();
    const [filter,setFilter]=useState("");
    const inputId=useId();
    const date=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString(locale):"";
    const own=(chats??[]).filter(chat=>chat.user_id===owner&&chat.project_id===null);
    const query=filter.trim().toLocaleLowerCase(locale);
    const visible=own.filter(chat=>!query||[chat.title??"",chat.created_at.slice(0,10),chat.updated_at?.slice(0,10)??"",date(chat.created_at),date(chat.updated_at??chat.created_at)].join(" ").toLocaleLowerCase(locale).includes(query));
    return <details className="courtos-conversation-history">
        <summary>{t(M.history)}</summary>
        <div className="mt-3 space-y-3">
            <label htmlFor={inputId} className="block text-sm">{t(M.historySearch)}</label>
            <input id={inputId} type="search" className="courtos-field w-full" value={filter} maxLength={200} onChange={event=>setFilter(event.target.value)} aria-describedby={`${inputId}-scope`}/>
            <p id={`${inputId}-scope`} className="text-xs text-muted-foreground">{t(M.historyScope)}</p>
            <button type="button" className="courtos-link min-h-11" disabled={disabled} onClick={()=>onSelect()} aria-pressed={!selected}>{t(M.newConversation)}</button>
            {historyLoading||chats===null?<p role="status">{t(M.historyLoading)}</p>:<>
                {historyError&&<div role="alert"><p>{t(historyError==="more"?M.historyMoreFailed:M.historyFailed)}</p><button type="button" className="courtos-link min-h-11" disabled={disabled||loadingMoreChats} onClick={()=>void(historyError==="more"?loadMoreChats():loadChats())}>{t(M.reload)}</button></div>}
                {!visible.length&&!historyError&&<p role="status">{t(query?M.historyNoMatch:M.historyEmpty)}</p>}
                <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label={t(M.history)}>{visible.map(chat=><li key={chat.id}>
                    <button type="button" className="min-h-11 w-full min-w-0 rounded-sm p-2 text-left hover:bg-accent aria-pressed:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" disabled={disabled} aria-pressed={selected===chat.id} onClick={()=>onSelect(chat.id)}>
                        <span className="block break-words text-sm">{chat.title||t(M.untitledConversation)}</span><time className="text-xs text-muted-foreground" dateTime={chat.updated_at??chat.created_at}>{date(chat.updated_at??chat.created_at)}</time>
                    </button>
                </li>)}</ul>
                {hasMoreChats&&historyError!=="more"&&<button type="button" className="courtos-link min-h-11" disabled={disabled||loadingMoreChats} onClick={()=>void loadMoreChats()}>{t(loadingMoreChats?M.historyLoading:M.historyMore)}</button>}
            </>}
        </div>
    </details>;
}
