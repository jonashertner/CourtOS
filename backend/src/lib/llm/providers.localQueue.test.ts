import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { streamWithProvider } from "./providers";
import { withCourtosQuota, type CourtosQuotaReservation } from "../courtosQuota";

const chunk=(text:string,done=false)=>`data: ${JSON.stringify({id:"test",object:"chat.completion.chunk",created:1,model:"gemma-test",choices:[{index:0,delta:done?{}:{role:"assistant",content:text},finish_reason:done?"stop":null}]})}\n\n`;
const finish=()=>chunk("",true)+"data: [DONE]\n\n";
function quota(userId:string):CourtosQuotaReservation { return {userId,signal:new AbortController().signal,attachRun(){},hasRun:()=>true,markModelStarted:vi.fn(),release:async()=>{}}; }
const params={model:"courtos-local",systemPrompt:"Synthetic",messages:[{role:"user" as const,content:"Synthetic"}],maxIterations:1};
beforeEach(()=>{vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_ACCESS_SELF_REGISTRATION","true");vi.stubEnv("COURTOS_PILOT_MODEL_NAME","gemma-test");vi.stubEnv("COURTOS_PILOT_MODEL_URL","http://127.0.0.1:18181/v1");});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});

it("serializes chat and review, starts no preflight while queued, and never charges cancelled waiting work",async()=>{
  let headers!:(response:Response)=>void;
  const network=vi.fn().mockImplementation(async(url)=>String(url).endsWith("/props")?Response.json({default_generation_settings:{n_ctx:8192}}):String(url).endsWith("/input_tokens")?Response.json({input_tokens:100}):network.mock.calls.length===1?new Promise<Response>(resolve=>{headers=resolve;}):new Response(chunk("done")+finish(),{headers:{"content-type":"text/event-stream"}}));
  vi.stubGlobal("fetch",network);
  const a=quota("A"),b=quota("B"),c=quota("C"),cancel=new AbortController(),statesA=vi.fn(),statesB=vi.fn(),statesC=vi.fn();
  const first=withCourtosQuota(a,()=>streamWithProvider({...params,callbacks:{onProviderState:statesA}}));
  await vi.waitFor(()=>expect(network).toHaveBeenCalledOnce());
  const second=withCourtosQuota(b,()=>streamWithProvider({...params,courtosTask:"case-review",callbacks:{onProviderState:statesB}}));
  const third=withCourtosQuota(c,()=>streamWithProvider({...params,abortSignal:cancel.signal,callbacks:{onProviderState:statesC}}));
  const cancelled=expect(third).rejects.toThrow("cancelled");
  expect(statesA).toHaveBeenCalledWith("dispatching");expect(statesB).toHaveBeenCalledExactlyOnceWith("queued");
  expect(statesC).toHaveBeenCalledExactlyOnceWith("queued");expect(network).toHaveBeenCalledOnce();
  expect(a.markModelStarted).toHaveBeenCalledOnce();expect(b.markModelStarted).not.toHaveBeenCalled();
  cancel.abort(new Error("cancelled"));await cancelled;expect(c.markModelStarted).not.toHaveBeenCalled();
  headers(new Response(chunk("first")+finish(),{headers:{"content-type":"text/event-stream"}}));
  await expect(first).resolves.toMatchObject({fullText:"first"});await expect(second).resolves.toMatchObject({fullText:"done"});
  expect(network).toHaveBeenCalledTimes(4);expect(b.markModelStarted).toHaveBeenCalledOnce();
  expect(statesB.mock.calls.map(call=>call[0])).toEqual(["queued","dispatching"]);
});

it("does not start a waiting request's first-output clock until its slot is granted",async()=>{
  vi.useFakeTimers();vi.stubEnv("STREAM_FIRST_CHUNK_TIMEOUT_MS","10000");vi.stubEnv("STREAM_CHUNK_TIMEOUT_MS","5000");
  let output!:ReadableStreamDefaultController<Uint8Array>;const encoder=new TextEncoder();
  const network=vi.fn().mockImplementation(async()=>new Response(network.mock.calls.length===1?new ReadableStream<Uint8Array>({start(controller){output=controller;}}):chunk("second")+finish(),{headers:{"content-type":"text/event-stream"}}));vi.stubGlobal("fetch",network);
  const first=withCourtosQuota(quota("A"),()=>streamWithProvider(params));
  await vi.advanceTimersByTimeAsync(1);
  const second=withCourtosQuota(quota("B"),()=>streamWithProvider(params));
  for(let i=0;i<4;i++){output.enqueue(encoder.encode(chunk("x")));await vi.advanceTimersByTimeAsync(4000);}
  expect(network).toHaveBeenCalledOnce(); // 16s exceeds the second request's 10s first-output limit.
  output.enqueue(encoder.encode(finish()));output.close();
  await expect(first).resolves.toMatchObject({fullText:"xxxx"});await expect(second).resolves.toMatchObject({fullText:"second"});
  expect(network).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
});
