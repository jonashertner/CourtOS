import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPublicKnowledge } from "./knowledgeApi";

beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
function delayed(milliseconds: number) {
    const fetch=vi.fn().mockImplementation((_url,init)=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>resolve(Response.json({results:[]})),milliseconds);
        init.signal.addEventListener("abort",()=>{clearTimeout(timer);reject(new DOMException("Synthetic abort","AbortError"));},{once:true});
    }));
    vi.stubGlobal("fetch",fetch);return fetch;
}
describe("public search browser wait",()=>{
    it("allows the server search budget and does not silently submit a second request",async()=>{
        const fetch=delayed(46_000);const pending=searchPublicKnowledge("rechtliches Gehör","de");
        await vi.advanceTimersByTimeAsync(46_000);expect(await pending).toEqual({results:[]});
        expect(fetch).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
        expect(fetch).toHaveBeenCalledWith("/api/knowledge/public/search",expect.objectContaining({credentials:"include",body:JSON.stringify({query:"rechtliches Gehör",limit:5,language:"de"})}));
    });
    it("clears an unbounded wait at50seconds using the existing localised timeout code",async()=>{
        const fetch=delayed(70_000);const pending=searchPublicKnowledge("Gehör","");
        const checked=expect(pending).rejects.toMatchObject({name:"KnowledgeApiError",code:"timeout"});
        await vi.advanceTimersByTimeAsync(50_000);await checked;
        expect(fetch).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
    });
    it("preserves a caller cancellation without showing it as a search failure or retrying",async()=>{
        const fetch=delayed(70_000);const controller=new AbortController();
        const pending=searchPublicKnowledge("Gehör","",controller.signal);
        const checked=expect(pending).rejects.toMatchObject({name:"AbortError"});
        controller.abort();await checked;
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);expect(fetch).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
    });
    it("never starts HTTP for an already cancelled caller",async()=>{
        const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const controller=new AbortController();controller.abort();
        await expect(searchPublicKnowledge("Gehör","",controller.signal)).rejects.toMatchObject({name:"AbortError"});
        expect(fetch).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
    });
    it("keeps a server-side timeout and its fixed code without a second attempt",async()=>{
        const fetch=vi.fn().mockResolvedValue(Response.json({code:"public_research_timeout",detail:"PRIVATE"},{status:503}));vi.stubGlobal("fetch",fetch);
        await expect(searchPublicKnowledge("Gehör","")).rejects.toMatchObject({code:"timeout"});
        expect(fetch).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
    });
});
