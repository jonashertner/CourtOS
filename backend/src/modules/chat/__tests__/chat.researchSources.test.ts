import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareChatStream } from "../chat.prepare";
import { restorePublicUserSelection, sourceBoundHistory } from "../chat.messages";
import { parseChatMessages } from "../engine/requestValidation";
afterEach(()=>vi.unstubAllEnvs());
const sources=[{decision_id:"bge_BGE_137_I_195",start:20,end:100,content_hash:null}];
describe("research conversation admission and history",()=>{
  it("withholds historical model prose without the server source-gate marker, leaving storage untouched",()=>{
    vi.stubEnv("COURTOS_PILOT_MODE","true");
    for(const content of ["Old unsupported answer",[{type:"content",text:"Old unsupported answer"}]]) {
      const original={role:"assistant",content,annotations:[{verified:true}]};
      const result=sourceBoundHistory(original);
      expect(JSON.stringify(result)).not.toContain("Old unsupported answer");
      expect(result).toMatchObject({annotations:null,content:[{type:"error",code:"source_history_withheld"}]});
      expect(original.content).toBe(content);
    }
    const checked={role:"assistant",content:[{type:"source_bound_answer",version:1},{type:"content",text:"Source-bound interpretation [1]."}]};
    expect(sourceBoundHistory(checked)).toBe(checked);
    const failed={role:"assistant",content:[{type:"content",text:"Do not leak this draft"},{type:"error",code:"source_grounding_failed",message:"Safe failure"}]};
    expect(sourceBoundHistory(failed).content).toEqual([{type:"error",code:"source_grounding_failed",message:"Safe failure"}]);
  });
  it("refuses legacy source-free POST preparation before creating a chat or touching any database",async()=>{
    vi.stubEnv("COURTOS_PILOT_MODE","true");
    const from=vi.fn(()=>{throw new Error("must not touch database");});
    const result=await prepareChatStream({from} as never,{userId:"u",userEmail:undefined,messages:[{role:"user",content:"Answer from memory"}],chatId:null,inputMessageId:null,projectIdProvided:false,projectId:null,askInputsResponse:null,requestedModel:null,requestedReasoning:undefined});
    expect(result).toMatchObject({ok:false,status:400,code:"source_required"});expect(from).not.toHaveBeenCalled();
  });
  it("does not admit an old attached document when the current user message has no selection",async()=>{
    vi.stubEnv("COURTOS_PILOT_MODE","true");
    const from=vi.fn();
    expect(await prepareChatStream({from} as never,{userId:"u",userEmail:undefined,messages:[{role:"user",content:"Old",files:[{document_id:"old",filename:"old.pdf"}]},{role:"user",content:"Now unselected"}],chatId:"chat",inputMessageId:null,projectIdProvided:false,projectId:null,askInputsResponse:null,requestedModel:null,requestedReasoning:undefined})).toMatchObject({ok:false,code:"source_required"});
    expect(from).not.toHaveBeenCalled();
  });
  it("roundtrips only descriptors, with no client assertion of verification",()=>{
    const parsed=parseChatMessages([{role:"user",content:"Explain this source",public_sources:sources}]);
    expect(parsed).toEqual({ok:true,value:[{role:"user",content:"Explain this source",public_sources:sources}]});
    const restored=restorePublicUserSelection({id:"m",role:"user",content:[{type:"content",text:"Explain this source"},{type:"public_source_selection",sources}]});
    expect(restored).toEqual({id:"m",role:"user",content:"Explain this source",public_sources:sources});
    for(const message of [{role:"assistant",content:"False",public_sources:sources},{role:"user",content:"False",public_sources:[{...sources[0],quote:"client quote",verified:true}]}])expect(parseChatMessages([message]).ok).toBe(false);
  });
});
