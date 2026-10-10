import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamWithProvider } from "./providers";
import { withCourtosQuota, type CourtosQuotaReservation } from "../courtosQuota";
import { caseReviewResponseFormat } from "../courtosCaseReviewOutput";

const response=()=>new Response([
  `data: ${JSON.stringify({id:"test",object:"chat.completion.chunk",created:1,model:"gemma-test",choices:[{index:0,delta:{role:"assistant",content:'{"rows":[],"more_claims":false}'},finish_reason:null}]})}\n\n`,
  `data: ${JSON.stringify({id:"test",object:"chat.completion.chunk",created:1,model:"gemma-test",choices:[{index:0,delta:{},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}})}\n\n`,
  "data: [DONE]\n\n",
].join(""),{headers:{"content-type":"text/event-stream"}});
const reservation:CourtosQuotaReservation={userId:"synthetic",signal:new AbortController().signal,attachRun(){},hasRun:()=>true,markModelStarted:vi.fn(),release:async()=>{}};
beforeEach(()=>{vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_ACCESS_SELF_REGISTRATION","true");vi.stubEnv("COURTOS_PILOT_MODEL_NAME","gemma-test");vi.stubEnv("COURTOS_PILOT_MODEL_URL","http://127.0.0.1:18181/v1");vi.stubEnv("LLM_MAX_OUTPUT_TOKENS","768");});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});

describe("task-scoped CourtOS review model boundary",()=>{
  it("uses2048 JSON tokens only for review while ordinary pilot chat remains768",async()=>{
    const fetch=vi.fn().mockImplementation(async(input)=>String(input).endsWith("/props")?Response.json({default_generation_settings:{n_ctx:8192}}):String(input).endsWith("/input_tokens")?Response.json({input_tokens:4000}):response());vi.stubGlobal("fetch",fetch);
    const run=(review:boolean)=>withCourtosQuota(reservation,()=>streamWithProvider({model:"courtos-local",systemPrompt:"Synthetic",messages:[{role:"user",content:"Synthetic"}],maxIterations:1,...(review?{courtosTask:"case-review" as const}:{})}));
    expect(await run(true)).toMatchObject({finishReason:"stop"});await run(false);
    const requests=fetch.mock.calls.filter(call=>String(call[0]).endsWith("/chat/completions")).map(call=>({url:String(call[0]),body:JSON.parse(call[1].body),init:call[1]}));
    expect(requests[0].url).toBe("http://127.0.0.1:18181/v1/chat/completions");
    expect(requests[0].body).toMatchObject({max_tokens:2048,response_format:caseReviewResponseFormat(),chat_template_kwargs:{enable_thinking:false}});
    expect(requests[0].body.response_format.type).toBe("json_schema");
    expect(requests[0].body.response_format.json_schema.schema).toMatchObject({type:"object",additionalProperties:false,required:["rows","more_claims"]});
    const tokenRequest=fetch.mock.calls.find(call=>String(call[0]).endsWith("/input_tokens"))!;
    expect(JSON.parse(tokenRequest[1].body)).toEqual(requests[0].body);
    expect(requests[1].body.max_tokens).toBe(768);expect(requests[1].body).not.toHaveProperty("response_format");
    expect(requests.every(value=>value.init.redirect==="error")).toBe(true);
    expect(requests[0].body).not.toHaveProperty("tools");
  });
  it("does not retry an uncertain provider error or fall back to another model",async()=>{
    const fetch=vi.fn().mockImplementation(async(input)=>String(input).endsWith("/props")?Response.json({default_generation_settings:{n_ctx:8192}}):String(input).endsWith("/input_tokens")?Response.json({input_tokens:4000}):new Response("synthetic failure",{status:503}));vi.stubGlobal("fetch",fetch);
    await expect(withCourtosQuota(reservation,()=>streamWithProvider({model:"courtos-local",courtosTask:"case-review",systemPrompt:"Synthetic",messages:[{role:"user",content:"Synthetic"}],maxIterations:1}))).rejects.toThrow();
    expect(fetch.mock.calls.filter(call=>String(call[0]).endsWith("/chat/completions"))).toHaveLength(1);
  });
  it("cannot call a frontier provider in the pilot even with the internal task flag",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(withCourtosQuota(reservation,()=>streamWithProvider({model:"claude-opus-5-5",courtosTask:"case-review",systemPrompt:"Synthetic",messages:[{role:"user",content:"Synthetic"}]}))).rejects.toThrow(/configured local model/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("never starts inference or retries when exact token admission fails",async()=>{
    const fetch=vi.fn().mockImplementation(async(input)=>String(input).endsWith("/props")?Response.json({default_generation_settings:{n_ctx:8192}}):Response.json({input_tokens:6081}));vi.stubGlobal("fetch",fetch);
    await expect(withCourtosQuota(reservation,()=>streamWithProvider({model:"courtos-local",courtosTask:"case-review",systemPrompt:"Synthetic",messages:[{role:"user",content:"Synthetic"}],maxIterations:1}))).rejects.toMatchObject({code:"review_context_unavailable"});
    expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls.some(call=>String(call[0]).endsWith("/chat/completions"))).toBe(false);expect(reservation.markModelStarted).not.toHaveBeenCalled();
  });
  it("still refuses an oversized body before any model HTTP and never trims it",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(withCourtosQuota(reservation,()=>streamWithProvider({model:"courtos-local",courtosTask:"case-review",systemPrompt:"Synthetic",messages:[{role:"user",content:"x".repeat(21000)}],maxIterations:1}))).rejects.toThrow(/Modellkontext/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
