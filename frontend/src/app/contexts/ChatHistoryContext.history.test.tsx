import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHistoryProvider, useChatHistoryContext } from "./ChatHistoryContext";

const api=vi.hoisted(()=>({user:{id:"a"} as {id:string}|null,list:vi.fn()}));
vi.mock("@/app/contexts/AuthContext",()=>({useAuth:()=>({user:api.user})}));
vi.mock("@/app/lib/mikeApi",()=>({listChats:api.list,createChat:vi.fn(),deleteChat:vi.fn(),renameChat:vi.fn()}));
vi.mock("@/app/lib/assistantTurns",()=>({subscribeAssistantTurns:()=>()=>undefined}));
const row=(id:string,owner="a")=>({id,user_id:owner,project_id:null,title:id,created_at:"2026-10-09T00:00:00Z",updated_at:"2026-10-10T00:00:00Z"});
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};}
function Probe(){const c=useChatHistoryContext();return <><output data-testid="history">{JSON.stringify({ids:c.chats?.map(row=>row.id)??null,error:c.historyError,loading:c.historyLoading,more:c.loadingMoreChats,hasMore:c.hasMoreChats,current:c.currentChatId,draft:c.newChatMessages})}</output><button onClick={()=>void c.loadChats()}>reload</button><button onClick={()=>void c.loadMoreChats()}>more</button><button onClick={()=>{c.setCurrentChatId("chosen");c.setNewChatMessages([{role:"user",content:"account draft"}]);}}>choose</button></>;}
const value=()=>JSON.parse(screen.getByTestId("history").textContent!) as {ids:string[]|null;error:string|null;loading:boolean;more:boolean;hasMore:boolean;current:string|null;draft:unknown};
const View=()=> <ChatHistoryProvider><Probe/></ChatHistoryProvider>;
beforeEach(()=>{vi.clearAllMocks();api.user={id:"a"};api.list.mockResolvedValue([]);});
describe("history request scope and failure state",()=>{
    it("distinguishes first-page failure and clears it after explicit reload",async()=>{
        api.list.mockRejectedValueOnce(new Error("private failure details"));render(<View/>);
        await waitFor(()=>expect(value()).toMatchObject({ids:[],error:"initial",loading:false}));
        api.list.mockResolvedValueOnce([row("recovered")]);fireEvent.click(screen.getByText("reload"));
        await waitFor(()=>expect(value()).toMatchObject({ids:["recovered"],error:null,loading:false}));expect(api.list).toHaveBeenCalledTimes(2);
    });
    it("keeps loaded pages and the same cursor on later-page failure, then retries only explicitly",async()=>{
        api.list.mockResolvedValueOnce(Array.from({length:21},(_,i)=>row(`c${i}`))).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([row("older")]);render(<View/>);
        await waitFor(()=>expect(value().ids).toHaveLength(20));fireEvent.click(screen.getByText("more"));
        await waitFor(()=>expect(value()).toMatchObject({error:"more",more:false,hasMore:true}));expect(value().ids).toHaveLength(20);expect(api.list).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByText("more"));await waitFor(()=>expect(value().ids).toContain("older"));
        expect(api.list.mock.calls[1][0]).toEqual(api.list.mock.calls[2][0]);expect(value()).toMatchObject({error:null,more:false,hasMore:false});
    });
    it("ignores a former owner's first-page response and resets current selection and draft",async()=>{
        const old=deferred<object[]>(), fresh=deferred<object[]>();api.list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
        const {rerender}=render(<View/>);fireEvent.click(screen.getByText("choose"));api.user={id:"b"};rerender(<View/>);
        expect(value()).toMatchObject({ids:null,loading:true,current:null,draft:null});
        await act(async()=>{fresh.resolve([row("b-only","b")]);});await act(async()=>{old.resolve([row("a-secret")]);});
        expect(value()).toMatchObject({ids:["b-only"],error:null,loading:false});
    });
    it("ignores a former owner's later-page failure without clearing a new owner's loading state",async()=>{
        const old=deferred<object[]>(), fresh=deferred<object[]>();api.list.mockResolvedValueOnce(Array.from({length:21},(_,i)=>row(`a${i}`))).mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
        const {rerender}=render(<View/>);await waitFor(()=>expect(value().ids).toHaveLength(20));fireEvent.click(screen.getByText("more"));
        api.user={id:"b"};rerender(<View/>);await act(async()=>{old.reject(new Error("old failure"));});
        expect(value()).toMatchObject({ids:null,error:null,loading:true,more:false});await act(async()=>{fresh.resolve([row("b-only","b")]);});expect(value().ids).toEqual(["b-only"]);
    });
    it("ignores a previous page response after reload and retains the reloaded cursor",async()=>{
        const oldPage=deferred<object[]>();api.list.mockResolvedValueOnce(Array.from({length:21},(_,i)=>row(`old${i}`))).mockReturnValueOnce(oldPage.promise).mockResolvedValueOnce(Array.from({length:21},(_,i)=>row(`fresh${i}`))).mockResolvedValueOnce([row("next")]);
        render(<View/>);await waitFor(()=>expect(value().ids).toHaveLength(20));fireEvent.click(screen.getByText("more"));fireEvent.click(screen.getByText("reload"));
        await waitFor(()=>expect(value().ids).toContain("fresh19"));await act(async()=>{oldPage.resolve([row("obsolete")]);});
        expect(value().ids).not.toContain("obsolete");fireEvent.click(screen.getByText("more"));await waitFor(()=>expect(value().ids).toContain("next"));expect(api.list.mock.calls[3][0].beforeId).toBe("fresh19");
    });
    it("invalidates a pending list and resets error/selection on logout",async()=>{
        const old=deferred<object[]>();api.list.mockReturnValueOnce(old.promise);const {rerender}=render(<View/>);fireEvent.click(screen.getByText("choose"));
        api.user=null;rerender(<View/>);await act(async()=>{old.reject(new Error("late private error"));});expect(value()).toMatchObject({ids:[],error:null,loading:false,more:false,hasMore:false,current:null,draft:null});
    });
});
