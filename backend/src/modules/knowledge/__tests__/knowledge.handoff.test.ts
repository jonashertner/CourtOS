import { describe, expect, it, vi } from "vitest";
import { parseResearchHandoffState, researchHandoff } from "../knowledge.handoff";
import type { Db } from "../../../lib/supabase";

const owner="00000000-0000-4000-8000-000000000001", handle="00000000-0000-4000-8000-000000000002";
const source={decision_id:"bge_BGE_137_I_195",court:"Bundesgericht",canton:"CH",docket_number:"BGE 137 I 195",decision_date:"2011-03-23",language:"de",title:"Gehör",source_url:"https://search.bger.ch/decision",pdf_url:null,content_hash:null,scraped_at:null,snippet:"public source"};
const state=()=>({version:1 as const,mode:"public" as const,public:{query:"rechtliches Gehör",submitted:"",language:"" as const,result:null,source:null},private:{query:"",submitted:"",selected:[],result:null,source:null}});
const metadata={id:handle,revision:1,acknowledged_revision:0,direction:"to_browser",expires_at:"2026-10-10T15:00:00.000Z"};
const database=(data:unknown={status:"ok",record:metadata},error:unknown=null)=>{const rpc=vi.fn().mockResolvedValue({data,error});return{rpc,db:{rpc} as unknown as Db};};

describe("bounded research handoff state",()=>{
  it("roundtrips draft query separately from submitted results without initiating any search",()=>{
    const value={...state(),public:{...state().public,query:"neuer Begriff",submitted:"Gehör",result:{results:[source],query_mode:"opencaselaw_ai",database_generation:null,ai_assisted:true}}};
    expect(parseResearchHandoffState(value)).toEqual(value);
  });
  it("rejects unknown nested fields and sender verification or full document payloads",()=>{
    for(const value of [
      {...state(),token:"secret"}, {...state(),private:{...state().private,document_body:"secret"}},
      {...state(),public:{...state().public,result:{results:[{...source,verified:true}],query_mode:"opencaselaw_ai",database_generation:null}}},
      {...state(),public:{...state().public,source:{decision:{...source,passage:{text:"whole doc"}},start:0,history:[],excerpt:null}}},
    ]) expect(parseResearchHandoffState(value)).toBeNull();
  });
  it("preserves Unicode source offsets while rejecting inconsistent, too long or out-of-window excerpts",()=>{
    const good={...state(),public:{...state().public,source:{decision:source,start:200,history:[0],excerpt:{text:"😀".repeat(800),start:220,end:1020,total_chars:2000}}}};
    expect(parseResearchHandoffState(good)).toEqual(good);
    for(const excerpt of [{...good.public.source.excerpt,end:1021},{...good.public.source.excerpt,text:"a".repeat(801),end:1021},{text:"a".repeat(20),start:0,end:20,total_chars:2000}]) {
      expect(parseResearchHandoffState({...good,public:{...good.public,source:{...good.public.source,excerpt}}})).toBeNull();
    }
  });
  it("bounds bytes before parsing and rejects NUL/unpaired surrogates, duplicate documents, unsafe URLs and identities",()=>{
    const selected={id:owner,filename:"A.pdf",file_type:"pdf",active_version_id:handle,active_version_number:1,size_bytes:100};
    const bad=[{...state(),public:{...state().public,query:"x".repeat(181)}},{...state(),public:{...state().public,query:"\0"}},{...state(),public:{...state().public,query:"\uD800"}},{...state(),private:{...state().private,selected:[selected,selected]}},{...state(),private:{...state().private,selected:[{...selected,id:"foreign"}]}}];
    for(const value of bad)expect(parseResearchHandoffState(value)).toBeNull();
    for(const source_url of ["javascript:alert(1)","https://owner:password@example.test", "https://example.test/"+"a".repeat(2048)]) {
      expect(parseResearchHandoffState({...state(),public:{...state().public,source:{decision:{...source,source_url},start:0,history:[],excerpt:null}}})).toBeNull();
    }
    const hit={document_id:owner,version_id:handle,version_number:1,filename:"A.pdf",page:1,quote:"😀".repeat(1500),score:1};
    const oversized={...state(),private:{...state().private,result:{results:Array(12).fill(hit),documents:[],notices:[]}}};
    expect(JSON.stringify(oversized).length).toBeLessThan(65536);
    expect(parseResearchHandoffState(oversized)).toBeNull();
  });
});

describe("research handoff persistence boundary",()=>{
  it("takes the owner exclusively from authenticated input and calls only the atomic RPC",async()=>{
    const {db,rpc}=database();
    expect(await researchHandoff(db,owner,{action:"create",state:state()})).toEqual({ok:true,data:metadata});
    expect(rpc).toHaveBeenCalledExactlyOnceWith("courtos_research_handoff",{p_user_id:owner,p_action:"create",p_id:null,p_expected_revision:null,p_state:state(),p_direction:null,p_metadata_only:false});
  });
  it("rejects unknown/unbounded state and invalid revisions before touching persistence",async()=>{
    const {db,rpc}=database();
    expect(await researchHandoff(db,owner,{action:"create",state:{...state(),user_id:owner}})).toMatchObject({ok:false,code:"handoff_invalid"});
    for(const expectedRevision of [0,1.5,33,NaN])expect(await researchHandoff(db,owner,{action:"ack",id:handle,expectedRevision})).toMatchObject({ok:false,code:"handoff_invalid"});
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["not_found","not_found","handoff_not_found"],["conflict","conflict","handoff_conflict"],["limit","conflict","handoff_limit"],["revision_limit","conflict","handoff_revision_limit"]])("maps %s without response payload or raw database details",async(status,kind,code)=>{
    const {db}=database({status,detail:"SECRET",state:{token:"SECRET"}});
    const result=await researchHandoff(db,owner,{action:"read",id:handle,metadataOnly:false});
    expect(result).toMatchObject({ok:false,kind,code});expect(JSON.stringify(result)).not.toContain("SECRET");
  });
  it("strips any incidental payload from metadata and validates stored state on full reads",async()=>{
    const {db}=database({status:"ok",record:{...metadata,state:{token:"SECRET"},user_id:"SECRET"}});
    expect(await researchHandoff(db,owner,{action:"read",id:handle,metadataOnly:true})).toEqual({ok:true,data:metadata});
    expect(await researchHandoff(db,owner,{action:"read",id:handle,metadataOnly:false})).toMatchObject({ok:false,code:"handoff_unavailable"});
    const valid=database({status:"ok",record:{...metadata,state:state()}});
    expect(await researchHandoff(valid.db,owner,{action:"read",id:handle,metadataOnly:false})).toEqual({ok:true,data:{...metadata,state:state()}});
  });
  it("refuses an unexpected response identity before exposing its cached state",async()=>{
    const {db}=database({status:"ok",record:{...metadata,id:owner,state:state()}});
    for(const input of [{action:"read" as const,id:handle,metadataOnly:false},{action:"ack" as const,id:handle,expectedRevision:1},{action:"update" as const,id:handle,expectedRevision:1,state:state(),direction:"to_word" as const}]){
      expect(await researchHandoff(db,owner,input)).toMatchObject({ok:false,code:"handoff_unavailable"});
    }
  });
  it("does not log or return DB error content, including thrown errors",async()=>{
    const error=vi.spyOn(console,"error").mockImplementation(()=>{});
    try{
      const {db,rpc}=database(null,{message:"SECRET ROW"});
      expect(await researchHandoff(db,owner,{action:"read",id:handle,metadataOnly:false})).toMatchObject({ok:false,code:"handoff_unavailable"});
      rpc.mockRejectedValue(new Error("SECRET ROW"));
      const result=await researchHandoff(db,owner,{action:"read",id:handle,metadataOnly:false});
      expect(JSON.stringify(result)).not.toContain("SECRET");expect(error).not.toHaveBeenCalled();
    }finally{error.mockRestore();}
  });
});
