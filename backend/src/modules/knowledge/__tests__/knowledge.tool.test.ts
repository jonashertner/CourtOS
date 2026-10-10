import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { runToolCalls } from "../../chat/engine/tools/toolDispatcher";
import type { Db } from "../../../lib/supabase";
import { buildMessages } from "../../chat/engine/contextBuilders";
import { TOOLS, withKnowledgeReadDescriptions } from "../../chat/engine/tools/toolSchemas";
const search = vi.hoisted(()=>vi.fn());
vi.mock("../knowledge.service",()=>({searchKnowledge:search}));
beforeEach(()=>{vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","true");search.mockReset();});
afterEach(()=>vi.unstubAllEnvs());
it("accepts a fresh bounded passage as evidence without a whole-book read, only when enabled",()=>{
 const docs=[{doc_id:"doc-0",filename:"Literatur.pdf"}];
 const prompt=JSON.stringify(buildMessages([],docs));
 expect(prompt).toContain("version-bound passage is sufficient evidence");
 expect(prompt).not.toContain("You MUST call read_document");
 expect(withKnowledgeReadDescriptions(TOOLS).find(t=>t.function.name==="read_document")?.function.description).toContain("without reading the whole book");
 expect(TOOLS.find(t=>t.function.name==="read_document")?.function.description).toContain("Always call this before");
 vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","false");
 expect(JSON.stringify(buildMessages([],docs))).toContain("You MUST call read_document");
});
it("takes user and selected corpus from server context, never model-controlled ids",async()=>{
 search.mockResolvedValue({ok:true,data:{results:[{document_id:"owned",version_id:"v1",version_number:1,filename:"Literatur.pdf",page:2,quote:"Originaltext"}],documents:[{document_id:"owned",version_id:"v1"}],notices:[]}});
 const result=await runToolCalls([{id:"call",function:{name:"search_knowledge",arguments:JSON.stringify({query:"Gehör"})}}],new Map(),"actor",{} as Db,()=>{},undefined,undefined,{"doc-0":{document_id:"owned",filename:"Literatur.pdf",version_id:"v1",version_number:1}});
 expect(search).toHaveBeenCalledWith(expect.anything(),"actor",{query:"Gehör",document_ids:["owned"],limit:3},true);
 const content=JSON.parse((result.toolResults[0] as {content:string}).content);
 expect(content.passages[0]).toMatchObject({doc_id:"doc-0",page:2,quote:"Originaltext"});
 await runToolCalls([{id:"bad",function:{name:"search_knowledge",arguments:JSON.stringify({query:"Gehör",document_ids:["foreign"],user_id:"victim"})}}],new Map(),"actor",{} as Db,()=>{},undefined,undefined,{"doc-0":{document_id:"owned",filename:"Literatur.pdf",version_id:"v1"}});
 expect(search).toHaveBeenCalledTimes(1);
});
it("does not expose a passage from a changed version under an old citation handle",async()=>{
 search.mockResolvedValue({ok:true,data:{results:[{document_id:"owned",version_id:"v2",filename:"Changed",page:1,quote:"New text"}],documents:[{document_id:"owned",version_id:"v2"}],notices:[]}});
 const result=await runToolCalls([{id:"call",function:{name:"search_knowledge",arguments:'{"query":"Gehör"}'}}],new Map(),"actor",{} as Db,()=>{},undefined,undefined,{"doc-0":{document_id:"owned",filename:"Literatur.pdf",version_id:"v1"}});
 const content=JSON.parse((result.toolResults[0] as {content:string}).content);
 expect(content.error).toContain("source version has changed");
 expect(content.passages).toBeUndefined();
 expect(result.docsFound).toEqual([]);
});
it("does not silently search only part of an oversized selected corpus",async()=>{
 const index=Object.fromEntries(Array.from({length:21},(_,i)=>[`doc-${i}`,{document_id:`owned-${i}`,filename:`Literatur${i}.pdf`,version_id:`v${i}`} ]));
 const result=await runToolCalls([{id:"call",function:{name:"search_knowledge",arguments:'{"query":"Gehör"}'}}],new Map(),"actor",{} as Db,()=>{},undefined,undefined,index);
 expect(search).not.toHaveBeenCalled();
 expect(JSON.parse((result.toolResults[0] as {content:string}).content).error).toContain("at most 20");
});

it("reports a changed attachment version even when the current version yields no hits",async()=>{
 search.mockResolvedValue({ok:true,data:{results:[],documents:[{document_id:"owned",version_id:"v2"}],notices:[]}});
 const result=await runToolCalls([{id:"call",function:{name:"search_knowledge",arguments:'{"query":"Gehör"}'}}],new Map(),"actor",{} as Db,()=>{},undefined,undefined,{"doc-0":{document_id:"owned",filename:"Literatur.pdf",version_id:"v1"}});
 const content=JSON.parse((result.toolResults[0] as {content:string}).content);
 expect(content.error).toContain("Refresh and reselect");
 expect(content.passages).toBeUndefined();
 expect(result.docsFound).toEqual([]);
});
