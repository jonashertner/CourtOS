import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preflightCourtosReviewRequest } from "./courtosReviewPreflight";
import { withCourtosQuota, type CourtosQuotaReservation } from "../courtosQuota";

const url="http://127.0.0.1:18181/v1/chat/completions";
const body=JSON.stringify({model:"gemma-test",max_tokens:2048,response_format:{type:"json_object"},messages:[{role:"user",content:"Synthetic source \"é🧑\""}]});
const reservation:CourtosQuotaReservation={userId:"synthetic",signal:new AbortController().signal,attachRun(){},hasRun:()=>true,markModelStarted:vi.fn(),release:async()=>{}};
const init:RequestInit={method:"POST",headers:{Authorization:"Bearer must-not-forward",Cookie:"must-not-forward"},body};
const check=(request=url,options=init)=>withCourtosQuota(reservation,()=>preflightCourtosReviewRequest(request,options));
const stub=(tokens=6080,context=8192)=>{const fetch=vi.fn().mockResolvedValueOnce(Response.json({default_generation_settings:{n_ctx:context}})).mockResolvedValueOnce(Response.json({input_tokens:tokens}));vi.stubGlobal("fetch",fetch);return fetch;};
beforeEach(()=>{vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_PILOT_MODEL_NAME","gemma-test");vi.stubEnv("COURTOS_PILOT_MODEL_URL","http://127.0.0.1:18181/v1");});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

describe("exact bounded local review token admission",()=>{
  it("counts the exact final request on fixed endpoints without forwarding credentials or beginning inference",async()=>{
    const fetch=stub();await check();
    expect(fetch.mock.calls.map(call=>call[0])).toEqual(["http://127.0.0.1:18181/props","http://127.0.0.1:18181/v1/chat/completions/input_tokens"]);
    expect(fetch.mock.calls[1][1].body).toBe(body);
    for(const [,options] of fetch.mock.calls){expect(options).toMatchObject({credentials:"omit",redirect:"error"});expect(new Headers(options.headers).has("Authorization")).toBe(false);expect(new Headers(options.headers).has("Cookie")).toBe(false);}
    expect(reservation.markModelStarted).not.toHaveBeenCalled();
  });
  it("admits exactly the remaining headroom and refuses one excess token without truncation",async()=>{
    stub(6080);await expect(check()).resolves.toBeUndefined();
    const fetch=stub(6081);await expect(check()).rejects.toMatchObject({code:"review_context_unavailable"});expect(fetch.mock.calls[1][1].body).toBe(body);
  });
  it("respects a smaller observed context and never treats a larger context as permission to exceed8192",async()=>{
    stub(1984,4096);await expect(check()).resolves.toBeUndefined();
    stub(1985,4096);await expect(check()).rejects.toThrow();
    stub(6081,32768);await expect(check()).rejects.toThrow();
  });
  it("rejects missing quota, wrong model/destination/method/task body before HTTP",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(preflightCourtosReviewRequest(url,init)).rejects.toThrow();
    for(const request of ["https://api.example.com/v1/chat/completions",url+"?key=x",url+"/../other"])await expect(check(request)).rejects.toThrow();
    for(const invalid of [{...init,method:"GET"},{...init,body:JSON.stringify({model:"gemma-test",max_tokens:768})},{...init,body:JSON.stringify({model:"other",max_tokens:2048})},{...init,body:JSON.stringify({model:"gemma-test",max_tokens:2048,tools:[]})}])await expect(check(url,invalid)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not infer when the endpoint is unsupported, malformed, noninteger or discloses an upstream error",async()=>{
    for(const response of [new Response("PRIVATE",{status:404}),new Response("PRIVATE",{headers:{"content-type":"text/html"}}),new Response("PRIVATE",{headers:{"content-type":"application/json"}}),Response.json({input_tokens:1.5}),Response.json({input_tokens:0}),Response.json({input_tokens:"100"})]){
      const fetch=vi.fn().mockResolvedValueOnce(Response.json({default_generation_settings:{n_ctx:8192}})).mockResolvedValueOnce(response);vi.stubGlobal("fetch",fetch);
      await expect(check()).rejects.toMatchObject({code:"review_context_unavailable"});expect(fetch).toHaveBeenCalledTimes(2);
    }
  });
  it("cancels declared or streamed oversized responses before parsing",async()=>{
    for(const declared of [false,true]){
      const cancel=vi.fn();const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode("x".repeat(4097)));},cancel});
      const response=new Response(stream,{headers:{"content-type":"application/json",...(declared?{"content-length":"4097"}:{})}});
      const fetch=vi.fn().mockResolvedValueOnce(Response.json({default_generation_settings:{n_ctx:8192}})).mockResolvedValueOnce(response);vi.stubGlobal("fetch",fetch);
      await expect(check()).rejects.toThrow();expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it("refuses invalid UTF8 and a cancelled quota without exposing source or response text",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(Response.json({default_generation_settings:{n_ctx:8192}})).mockResolvedValueOnce(new Response(new Uint8Array([0xff]),{headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",fetch);
    await expect(check()).rejects.toThrow(/Modellkontext/);
    const controller=new AbortController();controller.abort();stub();
    await expect(withCourtosQuota({...reservation,signal:controller.signal},()=>preflightCourtosReviewRequest(url,init))).rejects.toThrow();
  });
});
