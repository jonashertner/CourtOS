import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseReviewRecord } from "@mike/contracts";
import type { CourtosQuotaReservation } from "../../../lib/courtosQuota";
import { resetStreamRunsForTests } from "../../../lib/streamRuns";
const mocks = vi.hoisted(()=>({ read:vi.fn(),create:vi.fn(),write:vi.fn(),load:vi.fn(),stream:vi.fn(),reserve:vi.fn() }));
vi.mock("../../chat/chat.service",()=>({readCaseReviewRecord:mocks.read,createCaseReviewRecord:mocks.create,writeCaseReviewRecord:mocks.write,loadCaseReviewEvidence:mocks.load}));
vi.mock("../../../lib/llm/providers",()=>({streamWithProvider:mocks.stream}));
vi.mock("../../../lib/courtosQuota",async original=>({...await original<typeof import("../../../lib/courtosQuota")>(),reserveCourtosQuota:mocks.reserve}));
import { getCaseReview, startCaseReview, stopCaseReview, caseReviewRun } from "../knowledge.review";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const id="10000000-0000-4000-8000-000000000001",doc="20000000-0000-4000-8000-000000000001",version="30000000-0000-4000-8000-000000000001";
const input={request_id:id,kind:"facts",language:"de",sources:[{document_id:doc,version_id:version,role:"claim",party_label:"A"}]};
const text="Partei A behauptet eine Zahlung; eine Bestätigung ist nicht ausgewählt.";
const evidence=[{document_id:doc,version_id:version,version_number:1,filename:"Original.pdf",pdf_sha256:hash("pdf"),version_sha256:hash("pdf"),pages:[{page:1,text,sha256:hash(text)}]}];
const output={rows:[{category:"fact",claim:{p:"p1",q:text},posture:"allegation",date:null,amounts:[],assessment:"not_found",reason:"In den ausgewählten Quellen fehlt ein Zahlungsbeleg.",evidence:[],opposing:[],references:[]}],more_claims:false};
let records:Map<string,{owner:string;record:CaseReviewRecord}>;
let reservation:CourtosQuotaReservation;
const db={} as never;
const fail={ok:false,kind:"not_found",code:"review_not_found",detail:"Nicht verfügbar."};
const settle=async()=>{for(let i=0;i<12;i++) await new Promise(resolve=>setTimeout(resolve,0));};
beforeEach(()=>{
  vi.clearAllMocks(); vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","true");
  vi.spyOn(console,"warn").mockImplementation(()=>{});
  records=new Map();
  const controller=new AbortController(); let attached=false;
  reservation={userId:"owner",signal:controller.signal,attachRun(){attached=true;},hasRun:()=>attached,markModelStarted:vi.fn(),release:vi.fn(async()=>{})};
  mocks.reserve.mockResolvedValue({ok:true,reservation});
  mocks.read.mockImplementation(async(_db,owner,key)=>{const saved=records.get(key);return saved && saved.owner===owner?{ok:true,data:{messageId:"message",record:saved.record}}:fail;});
  mocks.create.mockImplementation(async(_db,owner,key,_model,record)=>{records.set(key,{owner,record});return {ok:true,data:{messageId:"message"}};});
  mocks.write.mockImplementation(async(_db,owner,key,record)=>{if(records.get(key)?.owner!==owner)return fail;records.set(key,{owner,record});return {ok:true,data:null};});
  mocks.load.mockResolvedValue(evidence);
  mocks.stream.mockResolvedValue({fullText:JSON.stringify(output),finishReason:"stop"});
});
afterEach(()=>{resetStreamRunsForTests();vi.unstubAllEnvs();vi.restoreAllMocks();});

describe("server-owned durable case review",()=>{
  it("returns a stable queued record before model completion, holds draft tokens and persists validated result",async()=>{
    let complete!:(value:unknown)=>void;mocks.stream.mockReturnValue(new Promise(resolve=>{complete=resolve;}));
    const started=await startCaseReview(db,"owner",input);expect(started).toMatchObject({ok:true,data:{id,status:"queued",report:null}});
    await settle();expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"reading",report:null}});
    const writes=mocks.write.mock.calls.length;
    expect(mocks.stream.mock.calls[0][0].callbacks.onProviderState("queued")).toBeUndefined();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"queued",report:null}});
    expect(reservation.markModelStarted).not.toHaveBeenCalled();
    expect(mocks.stream.mock.calls[0][0].callbacks.onProviderState("dispatching")).toBeUndefined();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"analysing",report:null}});
    expect(mocks.write).toHaveBeenCalledTimes(writes);
    expect(records.get(id)?.record.status).toBe("reading");
    expect(mocks.stream).toHaveBeenCalledWith(expect.objectContaining({courtosTask:"case-review",maxIterations:1,reasoning:"none"}));
    expect(mocks.stream.mock.calls[0][0]).not.toHaveProperty("tools");
    expect(mocks.stream.mock.calls[0][0].callbacks).not.toHaveProperty("onContentDelta");
    complete({fullText:JSON.stringify(output),finishReason:"stop"});await settle();
    const record=await getCaseReview(db,"owner",id);expect(record).toMatchObject({ok:true,data:{status:"completed",report:{rows:[{proposition:{filename:"Original.pdf",version_id:version,page:1},semantic_status:"ai_draft_requires_review"}]}}});
    expect(mocks.load).toHaveBeenCalledTimes(2);expect(reservation.release).toHaveBeenCalledOnce();
  });
  it("reuses the same account-owned request without a second inference and rejects changed input",async()=>{
    await startCaseReview(db,"owner",input);await settle();
    expect(await startCaseReview(db,"owner",input)).toMatchObject({ok:true,data:{status:"completed"}});
    expect(mocks.stream).toHaveBeenCalledOnce();expect(mocks.reserve).toHaveBeenCalledOnce();
    expect(await startCaseReview(db,"owner",{...input,kind:"legal"})).toMatchObject({ok:false,kind:"conflict",code:"review_request_conflict"});
    expect(mocks.stream).toHaveBeenCalledOnce();
  });
  it("polling and foreign handle requests cannot start a model or expose a report",async()=>{
    await startCaseReview(db,"owner",input);await settle();
    expect(await getCaseReview(db,"stranger",id)).toMatchObject({ok:false,kind:"not_found"});
    expect(await stopCaseReview(db,"stranger",id)).toMatchObject({ok:false,kind:"not_found"});
    for(let i=0;i<3;i++)await getCaseReview(db,"owner",id);
    expect(mocks.stream).toHaveBeenCalledOnce();expect(caseReviewRun(id,"stranger")).toBeUndefined();
  });
  it("retains a completed report after the in-memory stream is gone",async()=>{
    await startCaseReview(db,"owner",input);await settle();resetStreamRunsForTests();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"completed",report:{rows:expect.any(Array)}}});
    expect(mocks.stream).toHaveBeenCalledOnce();
  });
  it("marks a lost unfinished run interrupted without automatically charging or retrying",async()=>{
    records.set(id,{owner:"owner",record:{id,input:input as never,status:"analysing",created_at:new Date(Date.now()-60_000).toISOString(),report:null,error:null}});
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"interrupted",report:null,error:{code:"review_interrupted"}}});
    expect(mocks.reserve).not.toHaveBeenCalled();expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("rejects quota admission before persisting or starting a model",async()=>{
    mocks.reserve.mockResolvedValue({ok:false,status:429,detail:"Tageslimit",retryAfter:60});
    expect(await startCaseReview(db,"owner",input)).toMatchObject({ok:false,kind:"usage_limit",status:429,retryAfter:60});
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("source admission failure releases reservation without inference",async()=>{
    mocks.load.mockRejectedValue(Object.assign(new Error("raw private filename"),{code:"source_grounding_failed"}));
    await startCaseReview(db,"owner",input);await settle();
    const record=await getCaseReview(db,"owner",id);expect(record).toMatchObject({ok:true,data:{status:"failed",report:null,error:{code:"review_grounding_failed"}}});
    expect(JSON.stringify(record)).not.toContain("raw private filename");expect(mocks.stream).not.toHaveBeenCalled();expect(reservation.release).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("[case-review/rejected]",{report_id:id,code:"source_admission"});
  });
  it.each(["length","wrong_quote","changed_version"])("withholds %s output before publication",async mode=>{
    if(mode==="length")mocks.stream.mockResolvedValue({fullText:JSON.stringify(output),finishReason:"length"});
    if(mode==="wrong_quote")mocks.stream.mockResolvedValue({fullText:JSON.stringify({...output,rows:[{...output.rows[0],claim:{p:"p1",q:"Eine erfundene Zahlung von CHF 12000 im Jahr 2023."}}]}),finishReason:"stop"});
    if(mode==="changed_version")mocks.load.mockResolvedValueOnce(evidence).mockResolvedValueOnce([{...evidence[0],pdf_sha256:hash("changed")}]);
    await startCaseReview(db,"owner",input);await settle();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"failed",report:null}});
    expect(mocks.write.mock.calls.some(call=>call[3].status==="completed")).toBe(false);
    const code={length:"finish_length",wrong_quote:"quote_absent",changed_version:"source_changed_before_release"}[mode];
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("[case-review/rejected]",{report_id:id,code});
  });
  it("explicit stop aborts generation; a browser disconnect does not own the server job",async()=>{
    mocks.stream.mockImplementation(({abortSignal})=>new Promise((_resolve,reject)=>abortSignal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true})));
    await startCaseReview(db,"owner",input);await settle();
    const run=caseReviewRun(id,"owner")!;const detach=run.subscribe(1,{write:()=>{},end:()=>{}});detach();expect(run.stopped).toBe(false);
    await stopCaseReview(db,"owner",id);await settle();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"cancelled",report:null}});expect(reservation.release).toHaveBeenCalledOnce();
    expect(console.warn).not.toHaveBeenCalled();
  });
  it("rejects late provider progress after Stop without a database write or state regression",async()=>{
    mocks.stream.mockImplementation(({abortSignal})=>new Promise((_resolve,reject)=>abortSignal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true})));
    await startCaseReview(db,"owner",input);await settle();
    const progress=mocks.stream.mock.calls[0][0].callbacks.onProviderState;
    await stopCaseReview(db,"owner",id);await settle();
    const writes=mocks.write.mock.calls.length;
    expect(()=>progress("queued")).toThrow();expect(()=>progress("dispatching")).toThrow();
    expect(mocks.write).toHaveBeenCalledTimes(writes);
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"cancelled",report:null}});
  });
  it.each(["reading","completed"])("does not publish a %s write returning after Stop",async delayedStatus=>{
    const originalWrite=mocks.write.getMockImplementation()!;
    let release!:()=>void;
    mocks.write.mockImplementation(async(...args)=>{
      if(args[3].status===delayedStatus)await new Promise<void>(resolve=>{release=resolve;});
      return originalWrite(...args);
    });
    await startCaseReview(db,"owner",input);await settle();
    expect(release).toBeTypeOf("function");
    const run=caseReviewRun(id,"owner")!,frames:string[]=[];
    run.subscribe(run.seq+1,{write:line=>frames.push(line),end:()=>{}});
    await stopCaseReview(db,"owner",id);release();await settle();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"cancelled",report:null}});
    expect(records.get(id)?.record).toMatchObject({status:"cancelled",report:null});
    expect(frames.some(line=>line.includes('"type":"review_result"'))).toBe(false);
    expect(frames.some(line=>line.includes(`"status":"${delayedStatus}"`))).toBe(false);
    if(delayedStatus==="reading")expect(mocks.stream).not.toHaveBeenCalled();
    expect(reservation.release).toHaveBeenCalledOnce();
  });
  it("never publishes an otherwise valid result when durable final storage fails",async()=>{
    const write=mocks.write.getMockImplementation()!;
    mocks.write.mockImplementation(async(...args)=>args[3].status==="completed"?{ok:false,kind:"unavailable",detail:"store failed"}:write(...args));
    await startCaseReview(db,"owner",input);await settle();
    expect(await getCaseReview(db,"owner",id)).toMatchObject({ok:true,data:{status:"failed",report:null}});
  });
  it("holds throwing storage failures and releases the server reservation",async()=>{
    mocks.write.mockRejectedValue(new Error("PRIVATE storage error"));
    await startCaseReview(db,"owner",input);await settle();
    const result=await getCaseReview(db,"owner",id);
    expect(result).toMatchObject({ok:true,data:{status:"failed",report:null,error:{code:"review_storage_unavailable"}}});
    expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(mocks.stream).not.toHaveBeenCalled();expect(reservation.release).toHaveBeenCalledOnce();
  });
  it("releases a reservation if creating the durable report unexpectedly throws",async()=>{
    mocks.create.mockRejectedValue(new Error("PRIVATE create error"));
    expect(await startCaseReview(db,"owner",input)).toMatchObject({ok:false,kind:"unavailable",code:"review_storage_unavailable"});
    expect(reservation.release).toHaveBeenCalledOnce();expect(mocks.stream).not.toHaveBeenCalled();
  });
});
