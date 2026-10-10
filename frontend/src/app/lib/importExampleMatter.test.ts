import {readFileSync} from "node:fs";
import {webcrypto,createHash} from "node:crypto";
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {Document} from "@/app/components/shared/types";
import {EXAMPLE_MATTERS} from "./exampleMatters";
import {importExampleMatter} from "./importExampleMatter";
const api=vi.hoisted(()=>({upload:vi.fn(),search:vi.fn(),folder:vi.fn(),get:vi.fn(),move:vi.fn()}));
vi.mock("./mikeApi",()=>({uploadLibraryDocuments:api.upload,searchLibraryDocuments:api.search,resolveLibraryFolderPath:api.folder,getDocument:api.get,moveLibraryDocument:api.move}));
const matter=EXAMPLE_MATTERS[0];
let documents:Document[];
const fixture=(index:number,previous=false)=>({id:`doc-${index}`,current_version_id:`version-${index}`,status:"ready",filename:matter.documents[index].filename,project_id:null,library_kind:"file",file_type:"pdf",size_bytes:previous?matter.documents[index].previousEditions[0].bytes:matter.documents[index].bytes,content_sha256:previous?matter.documents[index].previousEditions[0].sha256:matter.documents[index].sha256,updated_at:"2026-10-10T14:00:00Z",library_folder_id:null} as Document);
beforeEach(()=>{
    vi.clearAllMocks();documents=[];vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("fetch",vi.fn(async(path:string)=>new Response(readFileSync(`public${path}`))));
    api.search.mockImplementation(async()=>({documents:documents.map(doc=>({...doc})),documentsHasMore:false}));
    api.folder.mockImplementation(async(_kind,segments)=>({conflict:false,folder_id:segments.join("/"),folders:[]}));
    api.get.mockImplementation(async(id:string)=>({...documents.find(doc=>doc.id===id)}));
    api.move.mockImplementation(async(_kind,id,folderId)=>{const doc=documents.find(item=>item.id===id)!;doc.library_folder_id=folderId;doc.updated_at="2026-10-10T14:01:00Z";return {...doc};});
    api.upload.mockImplementation(async(_kind,files:{clientId:string;file:File;folderId:string}[])=>files.map(({clientId,file,folderId})=>{const index=matter.documents.findIndex(item=>item.id===clientId);const document={...fixture(index),library_folder_id:folderId};documents.push(document);return {clientId,filename:file.name,status:"completed",errorCode:null,result:document};}));
});
describe("explicit structured example import",()=>{
    it("ships four distinct numbered matters with hash-bound PDFs and retained prior editions",()=>{
        expect(EXAMPLE_MATTERS.map(m=>m.language)).toEqual(["de","fr","it","en"]);
        expect(EXAMPLE_MATTERS.map(m=>m.caseNumber)).toEqual(["CourtOS-UE-2026-001","CourtOS-UE-2026-002","CourtOS-UE-2026-003","CourtOS-UE-2026-004"]);
        expect(new Set(EXAMPLE_MATTERS.map(m=>m.judgment.number)).size).toBe(4);
        for(const item of EXAMPLE_MATTERS){
            expect(item.textBytes).toBeLessThan(10000);expect(item.documents.map(d=>d.role)).toEqual(["claim","response","exhibit","exhibit"]);
            for(const document of item.documents){const bytes=readFileSync(`public${document.path}`);expect(bytes.length).toBe(document.bytes);expect(createHash("sha256").update(bytes).digest("hex")).toBe(document.sha256);expect(bytes.subarray(0,5).toString()).toBe("%PDF-");expect(document.path).not.toContain("findings");expect(document.previousEditions).toHaveLength(1);}
        }
    });
    it("uploads into native case/party folders and uses authoritative returned versions",async()=>{
        const controller=new AbortController();const result=await importExampleMatter(matter,controller.signal);
        expect(api.upload).toHaveBeenCalledOnce();expect(api.upload.mock.calls[0][2]).toEqual({signal:controller.signal});
        expect(api.upload.mock.calls[0][1].map((f:{folderId:string})=>f.folderId)).toEqual(matter.documents.map(d=>[matter.caseNumber,...d.folders].join("/")));
        expect(api.folder.mock.calls.every(call=>call[2]===null&&call[3]==="reuse"&&call[1][0]===matter.caseNumber)).toBe(true);
        expect(api.folder.mock.calls[0][1]).toEqual([matter.caseNumber]);
        for(const party of matter.parties)expect(api.folder).toHaveBeenCalledWith("files",[matter.caseNumber,party.label,party.exhibits],null,"reuse");
        expect(result.sources[0]).toMatchObject({document:{id:"doc-0",current_version_id:"version-0"},role:"claim",party:"A.________ AG · Vermieterin"});
        expect(result.reusedCount).toBe(0);expect(api.move).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(4);
    });
    it("reuses exact prior editions without replacing bytes and conditionally files only those samples",async()=>{
        documents=matter.documents.map((_,index)=>fixture(index,true));
        const result=await importExampleMatter(matter,new AbortController().signal);
        expect(api.upload).not.toHaveBeenCalled();expect(result.reusedCount).toBe(4);expect(result.previousEditionCount).toBe(4);expect(api.move).toHaveBeenCalledTimes(4);
        expect(api.move.mock.calls[0][3]).toEqual({version_id:"version-0",content_sha256:matter.documents[0].previousEditions[0].sha256,updated_at:"2026-10-10T14:00:00Z"});
        expect(result.sources.map(s=>s.document.content_sha256)).toEqual(matter.documents.map(d=>d.previousEditions[0].sha256));
    });
    it("a repeated completed import reuses the same folder and documents without writes to files",async()=>{
        const first=await importExampleMatter(matter,new AbortController().signal);
        api.upload.mockClear();const second=await importExampleMatter(matter,new AbortController().signal);
        expect(second.folderId).toBe(first.folderId);expect(second.sources.map(s=>s.document.id)).toEqual(first.sources.map(s=>s.document.id));expect(api.upload).not.toHaveBeenCalled();expect(api.move).not.toHaveBeenCalled();
    });
    it("fills only missing inputs after a confirmed partial import",async()=>{
        documents=[fixture(0,true),fixture(1,true)];const result=await importExampleMatter(matter,new AbortController().signal);
        expect(api.upload.mock.calls[0][1].map((f:{clientId:string})=>f.clientId)).toEqual(["D03","D04"]);expect(result.reusedCount).toBe(2);
    });
    it.each(["changed","duplicate","processing","page-limit"])("rejects %s existing matches before folder or upload mutation",async(reason)=>{
        documents=[fixture(0)];if(reason==="changed")documents[0].content_sha256="e".repeat(64);if(reason==="duplicate")documents.push({...fixture(0),id:"another"});if(reason==="processing")documents[0].status="processing";if(reason==="page-limit")api.search.mockResolvedValue({documents,documentsHasMore:true});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"existing",uploadAttempted:false});expect(api.upload).not.toHaveBeenCalled();expect(api.folder).not.toHaveBeenCalled();expect(api.move).not.toHaveBeenCalled();
    });
    it("stops on a concurrent conditional-move conflict without uploading duplicates",async()=>{
        documents=[fixture(0,true)];api.move.mockRejectedValue(new Error("409"));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"existing"});expect(api.upload).not.toHaveBeenCalled();
    });
    it("rejects changed/login-page assets before touching library state",async()=>{
        vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>login</html>"));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"asset",uploadAttempted:false});expect(api.upload).not.toHaveBeenCalled();expect(api.folder).not.toHaveBeenCalled();
    });
    it("does not report a complete selection from an unready resulting version",async()=>{
        api.upload.mockImplementation(async(_kind,files:{clientId:string;file:File}[])=>files.map(({clientId,file},index)=>{const document=fixture(index);document.status="processing";documents.push(document);return {clientId,filename:file.name,status:"completed",result:document};}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"upload",uploadAttempted:true});
    });
    it("cancels before any request after an already-aborted signal",async()=>{
        const controller=new AbortController();controller.abort();await expect(importExampleMatter(matter,controller.signal)).rejects.toMatchObject({name:"AbortError"});expect(api.upload).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    });
});
