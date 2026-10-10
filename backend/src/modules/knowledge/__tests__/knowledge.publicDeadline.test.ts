import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicKnowledgeRequest } from "../knowledge.public";

beforeEach(() => {
  vi.stubEnv("COURTOS_PILOT_MODE", "true"); vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED", "true");
  vi.useFakeTimers();
  vi.spyOn(AbortSignal,"timeout").mockImplementation(ms => {
    const controller=new AbortController();
    setTimeout(()=>controller.abort(new DOMException("Synthetic deadline", "TimeoutError")),ms);
    return controller.signal;
  });
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
function delayed(milliseconds: number) {
  const fetch=vi.fn().mockImplementation((_url,init)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(Response.json({results:[]})),milliseconds);
    init.signal.addEventListener("abort",()=>{clearTimeout(timer);reject(init.signal.reason);},{once:true});
  }));
  vi.stubGlobal("fetch",fetch); return fetch;
}
describe("bounded public search deadline",()=>{
  it("allows a slower cold query in one request without changing private content or limits",async()=>{
    const fetch=delayed(30_000);const result=publicKnowledgeRequest("search",{query:"rechtliches Gehör",limit:5});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ok:true,data:{results:[]}});
    expect(AbortSignal.timeout).toHaveBeenCalledWith(47_000);expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:18184/search",expect.objectContaining({body:JSON.stringify({query:"rechtliches Gehör",limit:5}),redirect:"error",headers:{"Content-Type":"application/json"}}));
  });
  it("turns its own expired deadline into the same safe actionable timeout, without retry",async()=>{
    const fetch=delayed(60_000);const result=publicKnowledgeRequest("search",{query:"Gehör"});
    await vi.advanceTimersByTimeAsync(47_000);
    expect(await result).toMatchObject({ok:false,code:"public_research_timeout"});expect(fetch).toHaveBeenCalledOnce();
  });
  it("retains the shorter original-source retrieval deadline",async()=>{
    const fetch=delayed(30_000);const result=publicKnowledgeRequest("decision",{id:"bge_137_I_195"});
    await vi.advanceTimersByTimeAsync(26_000);
    expect(await result).toMatchObject({ok:false,code:"public_research_timeout"});expect(AbortSignal.timeout).toHaveBeenCalledWith(26_000);expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not relabel an immediate connection failure as a timeout",async()=>{
    const fetch=vi.fn().mockRejectedValue(new Error("PRIVATE connection detail"));vi.stubGlobal("fetch",fetch);
    expect(await publicKnowledgeRequest("search",{query:"Gehör"})).toMatchObject({ok:false,code:"public_research_unavailable"});expect(fetch).toHaveBeenCalledOnce();
  });
});
