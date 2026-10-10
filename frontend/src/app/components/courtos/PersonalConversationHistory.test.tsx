import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { researchConversationMessages as M } from "@/app/lib/researchConversationMessages";
import { PersonalConversationHistory } from "./PersonalConversationHistory";

const api=vi.hoisted(()=>({chats:[] as object[]|null,historyLoading:false,historyError:null as "initial"|"more"|null,hasMoreChats:false,loadingMoreChats:false,loadChats:vi.fn(),loadMoreChats:vi.fn()}));
vi.mock("@/app/contexts/ChatHistoryContext",()=>({useChatHistoryContext:()=>api}));
const owner="11111111-1111-4111-8111-111111111111";
const row=(id:string,title:string)=>({id,title,user_id:owner,project_id:null,created_at:"2026-09-10T12:00:00Z",updated_at:"2026-10-09T12:00:00Z"});
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();api.chats=[];api.historyLoading=false;api.historyError=null;api.hasMoreChats=false;api.loadingMoreChats=false;});
async function setup(){const onSelect=vi.fn();render(<PersonalConversationHistory owner={owner} selected="a" disabled={false} onSelect={onSelect}/>);const user=userEvent.setup();await user.click(screen.getByText(M.history.de,{selector:"summary"}));return {user,onSelect};}
describe("personal title/date history",()=>{
    it("searches only owned personal titles and dates, never answer bodies or project chats",async()=>{
        api.chats=[{...row("a","Gehör und Zustellung"),messages:[{content:"WITHHELD_ANSWER_SENTINEL"}]},{...row("foreign","Fremdes Gespräch"),user_id:"other"},{...row("project","Projektgespräch"),project_id:"project"},row("b","Kostenentscheid")];
        const {user,onSelect}=await setup();
        expect(screen.queryByRole("button",{name:/Fremdes Gespräch|Projektgespräch/})).toBeNull();
        expect(screen.getByRole("button",{name:/Gehör und Zustellung/})).toHaveAttribute("aria-pressed","true");
        const input=screen.getByRole("searchbox");await user.type(input,"WITHHELD_ANSWER_SENTINEL");
        expect(screen.getByText(M.historyNoMatch.de)).toBeVisible();expect(screen.queryByRole("button",{name:/Gehör und Zustellung/})).toBeNull();
        await user.clear(input);await user.type(input,"2026-09-10");expect(screen.getByRole("button",{name:/Gehör und Zustellung/})).toBeVisible();
        await user.clear(input);await user.type(input,"KOSTEN");await user.click(screen.getByRole("button",{name:/Kostenentscheid/}));
        expect(onSelect).toHaveBeenCalledExactlyOnceWith("b");expect(api.loadChats).not.toHaveBeenCalled();expect(api.loadMoreChats).not.toHaveBeenCalled();
    });
    it("distinguishes a loading failure from an empty search and offers an explicit retry",async()=>{
        api.historyError="initial";const {user}=await setup();
        expect(screen.getByRole("alert")).toHaveTextContent(M.historyFailed.de);
        expect(screen.queryByText(M.historyEmpty.de)).toBeNull();expect(screen.queryByText(M.historyNoMatch.de)).toBeNull();
        await user.click(screen.getByRole("button",{name:M.reload.de}));expect(api.loadChats).toHaveBeenCalledOnce();
    });
    it("keeps loaded results on a later-page failure and explicitly retries the later page",async()=>{
        api.chats=[row("a","Erhaltenes Gespräch")];api.historyError="more";api.hasMoreChats=true;const {user}=await setup();
        expect(screen.getByRole("button",{name:/Erhaltenes Gespräch/})).toBeVisible();expect(screen.getByRole("alert")).toHaveTextContent(M.historyMoreFailed.de);
        await user.click(screen.getByRole("button",{name:M.reload.de}));expect(api.loadMoreChats).toHaveBeenCalledOnce();expect(api.loadChats).not.toHaveBeenCalled();
    });
    it("loads older pages only on request even with an empty filter result",async()=>{
        api.chats=[row("a","Erstes Gespräch")];api.hasMoreChats=true;const {user}=await setup();
        await user.type(screen.getByRole("searchbox"),"anderer Titel");expect(api.loadMoreChats).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button",{name:M.historyMore.de}));expect(api.loadMoreChats).toHaveBeenCalledOnce();
    });
    it.each(["de","fr","it","en"] as const)("labels loaded personal scope, empty list and navigation in %s",async locale=>{
        setCourtOSLocale(owner,locale);render(<CourtOSLocaleProvider ownerId={owner}><PersonalConversationHistory owner={owner} disabled={false} onSelect={vi.fn()}/></CourtOSLocaleProvider>);
        await userEvent.setup().click(screen.getByText(M.history[locale],{selector:"summary"}));
        expect(screen.getByRole("searchbox",{name:M.historySearch[locale]})).toHaveAccessibleDescription(M.historyScope[locale]);
        expect(screen.getByText(M.historyEmpty[locale])).toBeVisible();expect(screen.getByRole("button",{name:M.newConversation[locale]})).toBeVisible();
    });
});
