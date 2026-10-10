import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/supabase";
const prefetch=vi.hoisted(()=>vi.fn());
vi.mock("../engine/sourceEvidence",async original=>({...await original<typeof import("../engine/sourceEvidence")>(),prefetchSourceEvidence:prefetch}));
import { createCaseReviewRecord, readCaseReviewRecord, writeCaseReviewRecord, loadCaseReviewEvidence } from "../chat.caseReview";

type Row=Record<string,unknown>;
function database(initial:Record<string,Row[]>={}) {
  const tables:Record<string,Row[]>={documents:[],chats:[],chat_messages:[],...initial};
  const operations:Array<{table:string;op:string;filters:Array<[string,string,unknown]>}>=[];
  const db={from(table:string){
    const filters:Array<[string,string,unknown]>=[];let op="read",value:Row|undefined,max=Infinity,single=false;
    const run=()=>{operations.push({table,op,filters:[...filters]});const rows=(tables[table]??[]).filter(row=>filters.every(([kind,key,val])=>kind==="in"?(val as unknown[]).includes(row[key]):row[key]===val));
      if(op==="insert"){tables[table]??=[];tables[table].push(value!);return {data:single?value:[value],error:null};}
      if(op==="update")for(const row of rows)Object.assign(row,value);
      return {data:single?(rows[0]??null):rows.slice(0,max),error:null};
    };
    const q={select:(_?:string)=>q,eq:(key:string,val:unknown)=>{filters.push(["eq",key,val]);return q;},is:(key:string,val:unknown)=>{filters.push(["is",key,val]);return q;},in:(key:string,val:unknown[])=>{filters.push(["in",key,val]);return q;},order:()=>q,limit:(n:number)=>{max=n;return q;},maybeSingle:()=>{single=true;return Promise.resolve(run());},single:()=>{single=true;return Promise.resolve(run());},insert:(val:Row)=>{op="insert";value=val;return q;},update:(val:Row)=>{op="update";value=val;return q;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(run()).then(resolve)};return q;
  }} as unknown as Db;
  return {db,tables,operations};
}
const id="00000000-0000-4000-8000-000000000001";
const record={id,status:"queued",input:{},created_at:new Date().toISOString(),report:null,error:null};
beforeEach(()=>{vi.clearAllMocks();prefetch.mockResolvedValue(new Map([["doc-0",{document_id:"doc",version_id:"version"}]]));});

describe("personal chat-backed review persistence and source scope",()=>{
  it("creates a private personal report under existing export/deletion lifecycle with no model-memory eligibility",async()=>{
    const {db,tables}=database();expect(await createCaseReviewRecord(db,"owner",id,"courtos-local",record)).toMatchObject({ok:true});
    expect(tables.chats[0]).toMatchObject({id,user_id:"owner",project_id:null,org_id:null});
    expect(tables.chat_messages[0]).toMatchObject({chat_id:id,author_user_id:"owner",role:"assistant",memory_eligible_at:null,memory_app_eligible_at:null});
    expect(await readCaseReviewRecord(db,"owner",id)).toMatchObject({ok:true,data:{record}});
    expect(await readCaseReviewRecord(db,"other",id)).toMatchObject({ok:false,kind:"not_found"});
  });
  it("cannot read/update a foreign or project report even if its handle is known",async()=>{
    const {db,tables,operations}=database();await createCaseReviewRecord(db,"owner",id,"courtos-local",record);
    expect(await writeCaseReviewRecord(db,"other",id,{...record,status:"completed"})).toMatchObject({ok:false,kind:"not_found"});
    expect(operations.some(op=>op.op==="update")).toBe(false);
    tables.chats[0].project_id="project";expect(await readCaseReviewRecord(db,"owner",id)).toMatchObject({ok:false,kind:"not_found"});
  });
  it("does not promote ordinary user chat content or mismatched report identity to a stored report",async()=>{
    const {db,tables}=database();await createCaseReviewRecord(db,"owner",id,"courtos-local",record);
    tables.chat_messages[0].role="user";expect(await readCaseReviewRecord(db,"owner",id)).toMatchObject({ok:false,kind:"not_found"});
    tables.chat_messages[0].role="assistant";tables.chat_messages[0].content=[{type:"content",text:JSON.stringify(record)}];
    expect(await readCaseReviewRecord(db,"owner",id)).toMatchObject({ok:false,kind:"not_found"});
    tables.chat_messages[0].content=[{type:"courtos_case_review_v1",record:{...record,id:"different"}}];
    expect(await readCaseReviewRecord(db,"owner",id)).toMatchObject({ok:false,kind:"not_found"});
  });
  it("updates only the account-owned report message and never publishes source text in a plain history summary",async()=>{
    const {db,tables,operations}=database();await createCaseReviewRecord(db,"owner",id,"courtos-local",record);
    await writeCaseReviewRecord(db,"owner",id,{...record,status:"completed",report:{canary:"PRIVATE_SOURCE"}});
    const content=tables.chat_messages[0].content as Array<{text?:string;record?:unknown}>;
    expect(content[0].text).not.toContain("PRIVATE_SOURCE");expect(content[1].record).toMatchObject({report:{canary:"PRIVATE_SOURCE"}});
    expect(operations.find(op=>op.op==="update")?.filters).toEqual(expect.arrayContaining([["eq","chat_id",id],["eq","author_user_id","owner"]]));
  });
  it.each(["foreign","project","organization","workflow","not_ready","template"])("rejects %s sources before PDF work",async variant=>{
    const doc:Row={id:"doc",user_id:"owner",status:"ready",library_kind:"file",project_id:null,org_id:null,workflow_id:null};
    if(variant==="foreign")doc.user_id="other";if(variant==="project")doc.project_id="p";if(variant==="organization")doc.org_id="o";if(variant==="workflow")doc.workflow_id="w";if(variant==="not_ready")doc.status="processing";if(variant==="template")doc.library_kind="template";
    const {db}=database({documents:[doc]});await expect(loadCaseReviewEvidence(db,"owner",[{document_id:"doc",version_id:"version"}])).rejects.toThrow();expect(prefetch).not.toHaveBeenCalled();
  });
  it("passes exact selected versions to byte-hash admission and repeats owner scope after asynchronous loading",async()=>{
    const {db,tables}=database({documents:[{id:"doc",user_id:"owner",current_version_id:"newer",status:"ready",library_kind:"file",project_id:null,org_id:null,workflow_id:null}]});
    await loadCaseReviewEvidence(db,"owner",[{document_id:"doc",version_id:"version"}]);
    expect(prefetch).toHaveBeenCalledWith(expect.any(Map),{"doc-0":{document_id:"doc",version_id:"version",filename:""}},db,"owner");
    prefetch.mockImplementationOnce(async()=>{tables.documents[0].project_id="moved";return new Map([["doc-0",{}]]);});
    await expect(loadCaseReviewEvidence(db,"owner",[{document_id:"doc",version_id:"version"}])).rejects.toThrow(/geändert/);
  });
});
