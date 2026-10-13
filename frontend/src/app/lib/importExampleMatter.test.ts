import {readFileSync} from "node:fs";
import {webcrypto,createHash} from "node:crypto";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {Document,LibraryFolder} from "@/app/components/shared/types";
import {EXAMPLE_MATTERS} from "./exampleMatters";
import {importExampleMatter} from "./importExampleMatter";
const api=vi.hoisted(()=>({upload:vi.fn(),search:vi.fn(),folder:vi.fn(),get:vi.fn(),move:vi.fn(),root:vi.fn(),children:vi.fn(),rename:vi.fn(),renameFolder:vi.fn()}));
vi.mock("./mikeApi",()=>({uploadLibraryDocuments:api.upload,searchLibraryDocuments:api.search,resolveLibraryFolderPath:api.folder,getDocument:api.get,moveLibraryDocument:api.move,getLibrary:api.root,getLibraryFolderChildren:api.children,renameLibraryDocument:api.rename,renameLibraryFolder:api.renameFolder}));
const matter=EXAMPLE_MATTERS[0];
let documents:Document[];
const fixture=(index:number,previous=false)=>({id:`doc-${index}`,current_version_id:`version-${index}`,status:"ready",filename:matter.documents[index].filename,project_id:null,library_kind:"file",file_type:"pdf",size_bytes:previous?matter.documents[index].previousEditions[0].bytes:matter.documents[index].bytes,content_sha256:previous?matter.documents[index].previousEditions[0].sha256:matter.documents[index].sha256,updated_at:"2026-10-10T14:00:00Z",library_folder_id:null} as Document);
function legacyTree(){
    const folder=(id:string,name:string,parent_folder_id:string|null)=>({id,name,parent_folder_id,updated_at:"2026-10-10T14:00:00Z"} as LibraryFolder);
    const folders=[folder("case-old",matter.legacyFiling.caseNumber,null),...matter.legacyFiling.parties.flatMap((party,index)=>[
        folder(`party-${index}`,party.label,"case-old"),folder(`submissions-${index}`,party.submissions,`party-${index}`),folder(`exhibits-${index}`,party.exhibits,`party-${index}`)
    ]),folder("common",matter.legacyFiling.sharedFolder,"case-old")];
    documents=matter.documents.map((entry,index)=>({...fixture(index,true),filename:entry.previousFilenames[0],library_folder_id:index<2?`submissions-${index}`:"common"}));
    api.root.mockImplementation(async()=>({folders:folders.filter(f=>f.parent_folder_id===null).map(f=>({...f})),documents:[],documentsHasMore:false}));
    api.children.mockImplementation(async(_kind,id)=>({folders:folders.filter(f=>f.parent_folder_id===id).map(f=>({...f})),documents:documents.filter(doc=>doc.library_folder_id===id).map(doc=>({...doc})),documentsHasMore:false}));
    api.renameFolder.mockImplementation(async(_kind,id,name)=>{const item=folders.find(f=>f.id===id)!;item.name=name;item.updated_at="2026-10-10T14:01:00Z";return {...item};});
    api.folder.mockImplementation(async(_kind,segments:string[])=>{let parent:string|null=null;for(const name of segments){const item=folders.find(f=>f.parent_folder_id===parent&&f.name===name);if(!item)throw Error("Unexpected new/duplicate folder");parent=item.id;}return {folder_id:parent,conflict:false,folders:[]};});
    return folders;
}
beforeEach(()=>{
    vi.clearAllMocks();vi.spyOn(console,"warn").mockImplementation(()=>undefined);documents=[];vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("fetch",vi.fn(async(path:string)=>new Response(readFileSync(`public${new URL(path,"https://sandbox.test").pathname}`))));
    api.root.mockResolvedValue({folders:[],documents:[],documentsHasMore:false});api.children.mockResolvedValue({folders:[],documents:[],documentsHasMore:false});
    api.rename.mockImplementation(async(_kind,id,filename)=>{const doc=documents.find(item=>item.id===id)!;doc.filename=filename;doc.updated_at="2026-10-10T14:00:01Z";return {...doc};});
    api.search.mockImplementation(async()=>({documents:documents.map(doc=>({...doc})),documentsHasMore:false}));
    api.folder.mockImplementation(async(_kind,segments)=>({conflict:false,folder_id:segments.join("/"),folders:[]}));
    api.get.mockImplementation(async(id:string)=>({...documents.find(doc=>doc.id===id)}));
    api.move.mockImplementation(async(_kind,id,folderId)=>{const doc=documents.find(item=>item.id===id)!;doc.library_folder_id=folderId;doc.updated_at="2026-10-10T14:01:00Z";return {...doc};});
    api.upload.mockImplementation(async(_kind,files:{clientId:string;file:File;folderId:string}[])=>files.map(({clientId,file,folderId})=>{const index=matter.documents.findIndex(item=>item.id===clientId);const document={...fixture(index),library_folder_id:folderId};documents.push(document);return {clientId,filename:file.name,status:"completed",errorCode:null,result:document};}));
});
afterEach(()=>vi.restoreAllMocks());
describe("explicit structured example import",()=>{
    it("ships four distinct numbered matters with hash-bound PDFs and retained prior editions",()=>{
        expect(EXAMPLE_MATTERS.map(m=>m.language)).toEqual(["de","fr","it","en"]);
        expect(EXAMPLE_MATTERS.map(m=>m.caseNumber)).toEqual(["FV.2026.117","C.2026.204","OR.2026.83","HG.2026.42"]);
        expect(new Set(EXAMPLE_MATTERS.map(m=>m.judgment.number)).size).toBe(4);
        for(const item of EXAMPLE_MATTERS){
            expect(item.textBytes).toBeLessThan(10000);expect(item.documents.map(d=>d.role)).toEqual(["claim","response","exhibit","exhibit"]);
            for(const document of item.documents){const bytes=readFileSync(`public${document.path}`);expect(bytes.length).toBe(document.bytes);expect(createHash("sha256").update(bytes).digest("hex")).toBe(document.sha256);expect(bytes.subarray(0,5).toString()).toBe("%PDF-");expect(document.path).not.toContain("findings");expect(document.previousEditions.length).toBeGreaterThanOrEqual(2);expect(document.filename).not.toContain("CourtOS");expect(document.filename).toContain(" ");}
        }
    });
    it("uploads into native case/party folders and uses authoritative returned versions",async()=>{
        const controller=new AbortController();const result=await importExampleMatter(matter,controller.signal);
        expect(api.upload).toHaveBeenCalledOnce();expect(api.upload.mock.calls[0][2]).toEqual({signal:controller.signal});
        expect(api.upload.mock.calls[0][1].map((f:{folderId:string})=>f.folderId)).toEqual(matter.documents.map(d=>[matter.caseNumber,...d.folders].join("/")));
        expect(api.folder.mock.calls.every(call=>call[2]===null&&call[3]==="reuse"&&call[1][0]===matter.caseNumber)).toBe(true);
        expect(api.folder.mock.calls[0][1]).toEqual([matter.caseNumber]);
        for(const party of matter.parties)expect(api.folder).toHaveBeenCalledWith("files",[matter.caseNumber,party.label,party.exhibits],null,"reuse");
        expect(result.sources[0]).toMatchObject({document:{id:"doc-0",current_version_id:"version-0"},role:"claim",party:"Bergtal Immobilien AG · Vermieterin"});
        expect(result.reusedCount).toBe(0);expect(api.move).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledTimes(4);
    });
    it("binds every download to its catalogue SHA and bypasses the browser cache",async()=>{
        await importExampleMatter(matter,new AbortController().signal);
        for(const entry of matter.documents)expect(fetch).toHaveBeenCalledWith(`${entry.path}?v=${entry.sha256}`,expect.objectContaining({cache:"no-store",credentials:"same-origin",redirect:"error"}));
    });
    it.each(["inventory","existing_file","folder_resolve","file_move"] as const)("classifies %s HTTP failures as library checks, without exposing returned data",async(stage)=>{
        const failure=Object.assign(new Error("PRIVATE RESPONSE WITH TOKENS"),{status:403,code:"PRIVATE_CODE"});
        if(stage==="inventory")api.search.mockRejectedValue(failure);
        if(stage==="existing_file"){documents=[fixture(0)];api.get.mockRejectedValue(failure);}
        if(stage==="folder_resolve")api.folder.mockRejectedValue(failure);
        if(stage==="file_move"){documents=[fixture(0)];api.move.mockRejectedValue(failure);}
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"existing",stage,status:403,uploadAttempted:false});
        expect(console.warn).toHaveBeenCalledExactlyOnceWith("[courtos/example-import]",{stage,status:403,code:"existing"});
        expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/PRIVATE|CourtOS_|doc-0/);
        expect(api.upload).not.toHaveBeenCalled();
    });
    it("distinguishes an HTTP asset failure from a byte-integrity failure",async()=>{
        vi.mocked(fetch).mockResolvedValueOnce(new Response("private body",{status:503}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"asset",stage:"asset_download",status:503,uploadAttempted:false});
        expect(console.warn).toHaveBeenCalledExactlyOnceWith("[courtos/example-import]",{stage:"asset_download",status:503,code:"asset"});
        expect(api.search).not.toHaveBeenCalled();expect(api.folder).not.toHaveBeenCalled();
    });
    it("keeps an uncertain accepted upload in the upload category and never retries it",async()=>{
        api.upload.mockRejectedValue(Object.assign(new Error("response lost"),{status:502}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"upload",stage:"upload",status:502,uploadAttempted:true});
        expect(api.upload).toHaveBeenCalledOnce();
    });
    it("reuses exact prior editions without replacing bytes and conditionally files only those samples",async()=>{
        documents=matter.documents.map((_,index)=>fixture(index,true));
        const result=await importExampleMatter(matter,new AbortController().signal);
        expect(api.upload).not.toHaveBeenCalled();expect(result.reusedCount).toBe(4);expect(result.previousEditionCount).toBe(4);expect(api.move).toHaveBeenCalledTimes(4);
        expect(api.move.mock.calls[0][3]).toEqual({version_id:"version-0",content_sha256:matter.documents[0].previousEditions[0].sha256,updated_at:"2026-10-10T14:00:00Z"});
        expect(result.sources.map(s=>s.document.content_sha256)).toEqual(matter.documents.map(d=>d.previousEditions[0].sha256));
    });
    it("renames legacy synthetic metadata in place while retaining every folder/document/version and byte hash",async()=>{
        const folders=legacyTree(),ids=folders.map(folder=>folder.id),versions=documents.map(doc=>[doc.id,doc.current_version_id,doc.content_sha256]);
        const result=await importExampleMatter(matter,new AbortController().signal);
        expect(result.folderId).toBe("case-old");expect(result.reusedCount).toBe(4);expect(result.previousEditionCount).toBe(4);
        expect(folders.map(folder=>folder.id)).toEqual(ids);expect(documents.map(doc=>[doc.id,doc.current_version_id,doc.content_sha256])).toEqual(versions);
        expect(api.upload).not.toHaveBeenCalled();expect(api.move).not.toHaveBeenCalled();expect(api.rename).toHaveBeenCalledTimes(4);
        expect(api.rename.mock.calls[0][3]).toEqual({version_id:"version-0",content_sha256:matter.documents[0].previousEditions[0].sha256,updated_at:"2026-10-10T14:00:00Z",filename:matter.documents[0].previousFilenames[0]});
        expect(api.renameFolder).toHaveBeenCalledWith("files","case-old",matter.caseNumber,{name:matter.legacyFiling.caseNumber,updated_at:"2026-10-10T14:00:00Z",parent_folder_id:null});
        expect(folders.map(folder=>folder.name).join(" ")).not.toContain("CourtOS");expect(documents.map(doc=>doc.filename)).toEqual(matter.documents.map(doc=>doc.filename));
        api.rename.mockClear();api.renameFolder.mockClear();await importExampleMatter(matter,new AbortController().signal);
        expect(api.rename).not.toHaveBeenCalled();expect(api.renameFolder).not.toHaveBeenCalled();expect(api.upload).not.toHaveBeenCalled();
    });
    it("does not rename a legacy case that also contains an unrelated original",async()=>{
        legacyTree();documents.push({...fixture(0),id:"unrelated",filename:"Originalvertrag.pdf",library_folder_id:"common"});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile",code:"existing"});
        expect(api.renameFolder).not.toHaveBeenCalled();expect(api.rename).not.toHaveBeenCalled();expect(api.upload).not.toHaveBeenCalled();
    });
    it("does not merge existing old/new case folders or party folders",async()=>{
        const folders=legacyTree();folders.push({...folders[0],id:"other-case",name:matter.caseNumber});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
        expect(api.renameFolder).not.toHaveBeenCalled();expect(api.upload).not.toHaveBeenCalled();
        folders.pop();folders.push({...folders[1],id:"other-party",name:matter.parties[0].label});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
        expect(api.renameFolder).not.toHaveBeenCalled();expect(api.rename).not.toHaveBeenCalled();
    });
    it("stops on a folder revision conflict before renaming document metadata",async()=>{
        legacyTree();api.renameFolder.mockRejectedValue(Object.assign(Error("changed"),{status:409}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile",status:409});
        expect(api.renameFolder).toHaveBeenCalledOnce();expect(api.rename).not.toHaveBeenCalled();expect(api.upload).not.toHaveBeenCalled();
    });
    it("stops on a document revision conflict and never retries unconditionally",async()=>{
        legacyTree();api.rename.mockRejectedValue(Object.assign(Error("changed"),{status:409}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"file_rename",status:409});
        expect(api.rename).toHaveBeenCalledOnce();expect(api.upload).not.toHaveBeenCalled();expect(api.move).not.toHaveBeenCalled();
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
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"asset",stage:"asset_integrity",uploadAttempted:false});expect(api.upload).not.toHaveBeenCalled();expect(api.folder).not.toHaveBeenCalled();
    });
    it("does not report a complete selection from an unready resulting version",async()=>{
        api.upload.mockImplementation(async(_kind,files:{clientId:string;file:File}[])=>files.map(({clientId,file},index)=>{const document=fixture(index);document.status="processing";documents.push(document);return {clientId,filename:file.name,status:"completed",result:document};}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"upload",uploadAttempted:true});
    });
    it("cancels before any request after an already-aborted signal",async()=>{
        const controller=new AbortController();controller.abort();await expect(importExampleMatter(matter,controller.signal)).rejects.toMatchObject({name:"AbortError"});expect(api.upload).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    });
    it("rejects a catalogue entry whose path does not match the expected static pattern",async()=>{
        const malformed={...matter,documents:[{...matter.documents[0],path:"/examples/wrong/path.pdf"}]};
        await expect(importExampleMatter(malformed,new AbortController().signal)).rejects.toMatchObject({code:"asset",stage:"asset_integrity",uploadAttempted:false});
        expect(fetch).not.toHaveBeenCalled();
    });
    it("passes through a mid-flight abort error from a stage operation without wrapping it",async()=>{
        const controller=new AbortController();
        vi.mocked(fetch).mockImplementationOnce(async()=>{controller.abort();throw new DOMException("Aborted","AbortError");});
        await expect(importExampleMatter(matter,controller.signal)).rejects.toMatchObject({name:"AbortError"});
        expect(console.warn).not.toHaveBeenCalled();
    });
    it("rejects a concurrent import of the same matter as already locked",async()=>{
        const controller=new AbortController();
        const first=importExampleMatter(matter,controller.signal);
        await expect(importExampleMatter(matter,controller.signal)).rejects.toMatchObject({code:"existing",stage:"lock",uploadAttempted:false});
        await first;
    });
    it("serialises a successful import through the Web Locks API callback",async()=>{
        const request=vi.fn((_name:string,_opts:unknown,callback:()=>Promise<unknown>)=>callback());
        Object.defineProperty(navigator,"locks",{configurable:true,value:{request}});
        try{
            const result=await importExampleMatter(matter,new AbortController().signal);
            expect(request).toHaveBeenCalledOnce();expect(result.folderId).toBeTruthy();
        }finally{
            delete (navigator as {locks?:unknown}).locks;
        }
    });
    it("serialises through the Web Locks API when available, wrapping an unexpected acquisition failure",async()=>{
        const request=vi.fn(()=>{throw new Error("Locks API disabled");});
        Object.defineProperty(navigator,"locks",{configurable:true,value:{request}});
        try{
            await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"existing",stage:"lock"});
            expect(request).toHaveBeenCalledWith(`courtos-example-import:${matter.id}`,expect.objectContaining({mode:"exclusive"}),expect.any(Function));
        }finally{
            delete (navigator as {locks?:unknown}).locks;
        }
    });
    it("refuses to reconcile a matched folder that the backend reports as non-root",async()=>{
        const folders=legacyTree();const root=folders.find(f=>f.id==="case-old")!;
        api.root.mockResolvedValue({folders:[{...root,parent_folder_id:"unexpected-parent"}],documents:[],documentsHasMore:false});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
        expect(api.children).not.toHaveBeenCalled();
    });
    it("rejects a duplicated folder listing within the same legacy subtree",async()=>{
        const folders=legacyTree();folders.push({...folders.find(f=>f.id==="party-0")!});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("rejects an incompletely paginated legacy subtree",async()=>{
        legacyTree();api.children.mockImplementation(async()=>({folders:[],documents:[],documentsHasMore:true}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("refuses to reconcile a child folder whose reported parent does not match its listing",async()=>{
        api.root.mockResolvedValue({folders:[{id:"case-old",name:matter.legacyFiling.caseNumber,parent_folder_id:null,updated_at:"2026-10-10T14:00:00Z"}],documents:[],documentsHasMore:false});
        api.children.mockImplementation(async(_kind,id:string)=>id==="case-old"
            ?{folders:[{id:"child-x",name:matter.legacyFiling.sharedFolder,parent_folder_id:"not-case-old",updated_at:"2026-10-10T14:00:00Z"}],documents:[],documentsHasMore:false}
            :{folders:[],documents:[],documentsHasMore:false});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("refuses to reconcile a root-level legacy folder with an unrecognised name",async()=>{
        const folders=legacyTree();folders.push({id:"mystery",name:"Unexpected Folder",parent_folder_id:"case-old",updated_at:"2026-10-10T14:00:00Z"} as LibraryFolder);
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("refuses to reconcile a party-level legacy folder with an unrecognised name",async()=>{
        const folders=legacyTree();folders.push({id:"mystery",name:"Unexpected Subfolder",parent_folder_id:"party-0",updated_at:"2026-10-10T14:00:00Z"} as LibraryFolder);
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("rejects a legacy document whose metadata changed since the initial match",async()=>{
        legacyTree();let calls=0;
        api.get.mockImplementation(async(id:string)=>{calls++;const doc={...documents.find(item=>item.id===id)};if(calls===7)doc.current_version_id="tampered-version";return doc;});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("refuses to rename an empty legacy-named folder with no matching documents",async()=>{
        api.root.mockResolvedValue({folders:[{id:"empty-case",name:matter.legacyFiling.caseNumber,parent_folder_id:null,updated_at:"2026-10-10T14:00:00Z"}],documents:[],documentsHasMore:false});
        api.children.mockResolvedValue({folders:[],documents:[],documentsHasMore:false});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
        expect(api.renameFolder).not.toHaveBeenCalled();
    });
    it("stops before renaming a legacy folder whose revision stamp is missing",async()=>{
        const folders=legacyTree();const root=folders.find(f=>f.id==="case-old")!;delete (root as {updated_at?:string}).updated_at;
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
        expect(api.renameFolder).not.toHaveBeenCalled();
    });
    it("stops when a folder rename response does not match the expected result",async()=>{
        legacyTree();api.renameFolder.mockImplementation(async(_kind,id:string,name:string)=>({id,name,updated_at:"2026-10-10T14:01:00Z",parent_folder_id:"wrong-parent"}));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_reconcile"});
    });
    it("stops a plain rename when the document changes between the inventory check and the rename",async()=>{
        documents=[{...fixture(0,true),filename:matter.documents[0].previousFilenames[0],library_folder_id:null}];
        let calls=0;
        api.get.mockImplementation(async(id:string)=>{calls++;const doc={...documents.find(item=>item.id===id)};if(calls===2)doc.current_version_id="changed-version";return doc;});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"file_rename",code:"existing"});
        expect(api.rename).not.toHaveBeenCalled();
    });
    it("stops a plain rename when the post-rename document does not reflect the new name",async()=>{
        documents=[{...fixture(0,true),filename:matter.documents[0].previousFilenames[0],library_folder_id:null}];
        api.rename.mockImplementation(async(_kind,id:string)=>{const doc=documents.find(item=>item.id===id)!;doc.updated_at="2026-10-10T14:00:01Z";return {...doc};});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"file_rename",code:"existing"});
    });
    it("stops when resolving a case/party folder path reports a conflict",async()=>{
        api.folder.mockImplementation(async(_kind,segments:string[])=>segments.length===1?{conflict:true,folder_id:null,folders:[]}:{conflict:false,folder_id:segments.join("/"),folders:[]});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"folder_resolve"});
        expect(api.upload).not.toHaveBeenCalled();
    });
    it("stops a plain move when the document changes between selection and the move",async()=>{
        documents=[fixture(0,true)];documents[0].library_folder_id="somewhere-else";
        let calls=0;
        api.get.mockImplementation(async(id:string)=>{calls++;const doc={...documents.find(item=>item.id===id)};if(calls===2)doc.current_version_id="changed-version";return doc;});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"file_move",code:"existing"});
        expect(api.move).not.toHaveBeenCalled();
    });
    it("stops a plain move when the moved document fails re-validation",async()=>{
        documents=[fixture(0,true)];documents[0].library_folder_id="elsewhere";
        api.move.mockImplementation(async(_kind,id:string,folderId:string)=>{const doc=documents.find(item=>item.id===id)!;doc.library_folder_id=folderId;doc.status="processing";doc.updated_at="2026-10-10T14:01:00Z";return {...doc};});
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({stage:"file_move",code:"existing"});
    });
    it("recognises the moved document's folder through the legacy folder_id field",async()=>{
        documents=[fixture(0,true)];documents[0].library_folder_id="elsewhere";
        api.move.mockImplementation(async(_kind,id:string,folderId:string)=>{
            const doc=documents.find(item=>item.id===id)!;doc.library_folder_id=null;(doc as unknown as {folder_id?:string|null}).folder_id=folderId;doc.updated_at="2026-10-10T14:01:00Z";
            return {...doc};
        });
        const result=await importExampleMatter(matter,new AbortController().signal);
        expect(result.reusedCount).toBe(1);
    });
    it("rejects an individual upload item that did not complete",async()=>{
        api.upload.mockImplementation(async(_kind,files:{clientId:string;file:File}[])=>files.map(({clientId,file})=>({clientId,filename:file.name,status:"failed",errorCode:"virus_scan_failed",result:null})));
        await expect(importExampleMatter(matter,new AbortController().signal)).rejects.toMatchObject({code:"upload",stage:"upload_confirm",uploadAttempted:true});
    });
});
