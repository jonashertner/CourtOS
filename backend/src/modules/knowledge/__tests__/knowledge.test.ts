import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { knowledgePassages, parseKnowledgeInput, searchKnowledge } from "../knowledge.service";
import { publicKnowledgeRequest } from "../knowledge.public";
import type { Db } from "../../../lib/supabase";
import { courtosKnowledgeEnabled } from "../../../lib/courtosKnowledge";
import { courtosPilotToolAllowed } from "../../../lib/courtosPilot";
const storage = vi.hoisted(() => ({ headFile: vi.fn(), downloadFile: vi.fn() }));
const pdf = vi.hoisted(() => ({ readPdfPages: vi.fn() }));
vi.mock("../../../lib/storage", () => storage);
vi.mock("../../../lib/pdfText", () => pdf);
const doc = "00000000-0000-4000-8000-000000000001", version = "00000000-0000-4000-8000-000000000002";
const input = { query: "rechtliches Gehör", document_ids: [doc], limit: 3 };
function fakeDb(documents: unknown[], versions: unknown[] = []) {
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = { then: (resolve: (x: unknown) => unknown) => Promise.resolve({ data: table === "documents" ? documents : versions, error: null }).then(resolve) };
    for (const method of ["select","eq","is","in"]) builder[method] = (...args: unknown[]) => { calls.push([table,method,...args]); return builder; };
    return builder;
  });
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
  return { db: { from, rpc } as unknown as Db, calls, from, rpc };
}
const readyVersion = { id: version, document_id: doc, storage_path: "a.pdf", pdf_storage_path: null, content_sha256: "hash", filename: "Literatur.pdf", file_type: "pdf", version_number: 1, courtos_knowledge_index: { index_status: "ready", indexed_pages: 2, total_pages: 2 } };
beforeEach(() => { vi.stubEnv("COURTOS_PILOT_MODE","true"); vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","true"); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("selected private knowledge", () => {
  it("requires both explicit knowledge opt-in and pilot mode", async () => {
    vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","false");
    const { db,from } = fakeDb([]);
    expect(courtosPilotToolAllowed("search_knowledge")).toBe(false);
    expect(await searchKnowledge(db,"u",input)).toMatchObject({ ok:false,kind:"not_found" });
    expect(from).not.toHaveBeenCalled();
    vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","true"); vi.stubEnv("COURTOS_PILOT_MODE","false");
    expect(courtosKnowledgeEnabled()).toBe(false); expect(courtosPilotToolAllowed("search_knowledge")).toBe(false);
  });
  it("rejects arbitrary identities, duplicate ids, unbounded query and limits", () => {
    for (const body of [{...input,user_id:"foreign"},{...input,query:"a".repeat(301)},{...input,limit:21},{...input,document_ids:[doc,doc]},{...input,document_ids:["not-a-uuid"]}]) expect(parseKnowledgeInput(body)).toBeNull();
    expect(parseKnowledgeInput(input)).toEqual(input);
  });
  it("rejects inaccessible selection before any file read, version lookup or ranking", async () => {
    const {db,from,rpc,calls}=fakeDb([]);
    expect(await searchKnowledge(db,"owner",input)).toMatchObject({ok:false,kind:"not_found"});
    expect(from).toHaveBeenCalledTimes(1); expect(rpc).not.toHaveBeenCalled(); expect(storage.headFile).not.toHaveBeenCalled();
    expect(calls).toContainEqual(["documents","eq","user_id","owner"]);
    for (const field of ["project_id","org_id","workflow_id"]) expect(calls).toContainEqual(["documents","is",field,null]);
  });
  it("searches only authorised current versions and reuses a derived index", async () => {
    const {db,rpc}=fakeDb([{id:doc,current_version_id:version}],[readyVersion]);
    rpc.mockResolvedValue({data:[{document_id:doc,version_id:version,page:2,quote:"rechtliches Gehör",score:1}],error:null});
    const result=await searchKnowledge(db,"owner",input);
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("courtos_search_knowledge",{p_user_id:"owner",p_document_ids:[doc],p_query:input.query,p_limit:3});
    expect(storage.downloadFile).not.toHaveBeenCalled();
  });
  it("fences a replacement race and does not rank the stale extracted bytes", async () => {
    const {db,rpc}=fakeDb([{id:doc,current_version_id:version}],[{...readyVersion,courtos_knowledge_index:null}]);
    storage.headFile.mockResolvedValue({size:10}); storage.downloadFile.mockResolvedValue(new ArrayBuffer(10));
    pdf.readPdfPages.mockResolvedValue([{page:1,totalPages:1,text:"[Page 1]\nOriginal passage",empty:false,truncated:false}]);
    rpc.mockResolvedValueOnce({data:false,error:null});
    expect(await searchKnowledge(db,"owner",input)).toMatchObject({ok:false,kind:"conflict"});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("courtos_store_knowledge_index",expect.objectContaining({p_content_sha256:"hash",p_storage_path:"a.pdf",p_version_id:version}));
  });
  it("labels scanned/partial sources without pretending that no match proves absence", async () => {
    const {db,rpc}=fakeDb([{id:doc,current_version_id:version}],[{...readyVersion,courtos_knowledge_index:null}]);
    storage.headFile.mockResolvedValue({size:10}); storage.downloadFile.mockResolvedValue(new ArrayBuffer(10));
    pdf.readPdfPages.mockResolvedValue([{page:1,totalPages:2,text:"[Page 1]\nText",empty:false,truncated:true}]);
    rpc.mockResolvedValueOnce({data:{stored:true,metadata:{index_status:"partial",indexed_pages:1,total_pages:2}},error:null}).mockResolvedValueOnce({data:[],error:null});
    const result=await searchKnowledge(db,"owner",input);
    expect(result).toMatchObject({ok:true,data:{documents:[{index_status:"partial"}]}});
    if(result.ok) expect(result.data.notices.join(" ")).toContain("keine Abwesenheit");
  });
  it("returns exact page-local text and bounded overlapping passages", () => {
    const text="Rechtliches Gehör. "+"x".repeat(4000);
    const passages=knowledgePassages([{page:4,totalPages:4,text:"[Page 4]\n"+text,empty:false,truncated:false}]);
    expect(passages.length).toBe(3); expect(passages.every(p=>p.page===4&&p.quote.length<=1600&&text.includes(p.quote))).toBe(true);
  });
  it("keeps Unicode quotes exact across chunk and UTF-8 budget boundaries", () => {
    const text = "x".repeat(1399) + "😀" + "x".repeat(198) + "😀" + "z".repeat(2000);
    const pages = [{page:1,totalPages:1,text:"[Page 1]\n"+text,empty:false,truncated:false}];
    for (const budget of [1600,500000]) {
      const passages = knowledgePassages(pages,budget);
      expect(passages.every(p=>text.includes(p.quote)&&Buffer.from(p.quote,"utf8").toString("utf8")===p.quote)).toBe(true);
      expect(passages.reduce((n,p)=>n+Buffer.byteLength(p.quote,"utf8"),0)).toBeLessThanOrEqual(budget);
    }
  });
});
describe("fixed local public-source proxy",()=>{
  it.each([
    [503,"public_research_timeout","unavailable","public_research_timeout"],
    [429,"public_research_busy","unavailable","public_research_busy"],
    [422,undefined,"validation","public_research_invalid_query"],
    [503,"unknown_private_error","unavailable","public_research_unavailable"],
    [500,"public_research_timeout","unavailable","public_research_unavailable"],
  ])("preserves a safe actionable failure for upstream %s/%s",async(status,code,kind,expectedCode)=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({code,detail:"sensitive raw database detail"}),{status:Number(status)})));
    const result=await publicKnowledgeRequest("search",{query:"Gehör"});
    expect(result).toMatchObject({ok:false,kind,code:expectedCode});
    expect(JSON.stringify(result)).not.toContain("sensitive raw database detail");
  });
  it("rejects private fields and URL injection before network",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect(await publicKnowledgeRequest("search",{query:"Gehör",document_ids:[doc]})).toMatchObject({ok:false,kind:"validation"});
    expect(await publicKnowledgeRequest("decision",{id:"https://outside.invalid/a"})).toMatchObject({ok:false,kind:"validation"});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("encodes actual corpus identifiers with spaces and colons as one path segment",async()=>{
    const fetch=vi.fn().mockImplementation(async()=>new Response("{}"));vi.stubGlobal("fetch",fetch);
    for(const id of ["ow_gerichte_VVGE 1976_77 Nr. 54","source:case_1","ow_gerichte_OGVE-2016-17-79.htm#"]){
      expect(await publicKnowledgeRequest("decision",{id})).toMatchObject({ok:true});
      expect(fetch).toHaveBeenLastCalledWith(`http://127.0.0.1:18184/decisions/${encodeURIComponent(id)}?start=0&length=4000`,expect.anything());
    }
    for(const id of ["../private","case/other","case\\other","case\nother","a".repeat(241)]){
      expect(await publicKnowledgeRequest("decision",{id})).toMatchObject({ok:false,kind:"validation"});
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("forwards only explicit public query to fixed loopback with no credentials or redirects",async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({results:[]})));vi.stubGlobal("fetch",fetch);
    expect(await publicKnowledgeRequest("search",{query:"Gehör",limit:5})).toMatchObject({ok:true});
    const [url,init]=fetch.mock.calls[0];expect(url).toBe("http://127.0.0.1:18184/search");
    expect(JSON.parse(init.body)).toEqual({query:"Gehör",limit:5});expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({"Content-Type":"application/json"});
  });
  it("never falls back to an external provider when local search fails",async()=>{
    const fetch=vi.fn().mockRejectedValue(new Error("offline"));vi.stubGlobal("fetch",fetch);
    expect(await publicKnowledgeRequest("search",{query:"Gehör"})).toMatchObject({ok:false,kind:"unavailable"});
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels an oversized streamed response before consuming its remaining chunks",async()=>{
    let reads=0; const cancelled=vi.fn();
    const stream=new ReadableStream<Uint8Array>({pull(controller){reads++;controller.enqueue(new Uint8Array(80000));},cancel:cancelled},{highWaterMark:0});
    const fetch=vi.fn().mockResolvedValue(new Response(stream));vi.stubGlobal("fetch",fetch);
    expect(await publicKnowledgeRequest("search",{query:"Gehör"})).toMatchObject({ok:false,kind:"unavailable"});
    expect(reads).toBe(2);expect(cancelled).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects an oversized declared response without reading its body",async()=>{
    const pull=vi.fn();const cancel=vi.fn();
    const stream=new ReadableStream<Uint8Array>({pull,cancel},{highWaterMark:0});
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(stream,{headers:{"content-length":"150001"}})));
    expect(await publicKnowledgeRequest("search",{query:"Gehör"})).toMatchObject({ok:false,kind:"unavailable"});
    expect(pull).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledTimes(1);
  });
});
