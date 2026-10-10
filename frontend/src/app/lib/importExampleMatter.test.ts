import {readFileSync} from "node:fs";
import {webcrypto,createHash} from "node:crypto";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {EXAMPLE_MATTERS} from "./exampleMatters";
import {importExampleMatter} from "./importExampleMatter";
const upload=vi.hoisted(()=>vi.fn());
vi.mock("./mikeApi",()=>({uploadLibraryDocuments:upload}));
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("fetch",vi.fn(async(path:string)=>new Response(readFileSync(`public${path}`))));});
const success=(files:{clientId:string;file:File}[])=>files.map(({clientId,file},i)=>({clientId,filename:file.name,status:"completed",errorCode:null,result:{id:`doc-${i}`,current_version_id:`version-${i}`,status:"ready",filename:file.name}}));
describe("explicit example import",()=>{
    it("ships exactly four separately sourced, hash-bound PDF packs below the selected-source budget",()=>{
        expect(EXAMPLE_MATTERS.map(m=>m.language)).toEqual(["de","fr","it","en"]);
        expect(new Set(EXAMPLE_MATTERS.map(m=>m.judgment.number)).size).toBe(4);
        for(const matter of EXAMPLE_MATTERS){
            expect(matter.textBytes).toBeLessThan(10000);expect(matter.documents.map(d=>d.role)).toEqual(["claim","response","exhibit","exhibit"]);
            for(const document of matter.documents){const bytes=readFileSync(`public${document.path}`);expect(bytes.length).toBe(document.bytes);expect(createHash("sha256").update(bytes).digest("hex")).toBe(document.sha256);expect(bytes.subarray(0,5).toString()).toBe("%PDF-");expect(document.path).not.toContain("findings");}
        }
    });
    it("uses the ordinary upload path and binds returned IDs, versions and roles, without an analysis call",async()=>{
        upload.mockImplementation(async(_kind,files)=>success(files));
        const controller=new AbortController();const result=await importExampleMatter(EXAMPLE_MATTERS[0],controller.signal);
        expect(upload).toHaveBeenCalledOnce();expect(upload.mock.calls[0][0]).toBe("files");expect(upload.mock.calls[0][2]).toEqual({signal:controller.signal});
        expect(upload.mock.calls[0][1].map((f:{clientId:string})=>f.clientId)).toEqual(["D01","D02","D03","D04"]);
        expect(result[0]).toMatchObject({document:{id:"doc-0",current_version_id:"version-0"},role:"claim",party:"Vermieterin"});
        expect(fetch).toHaveBeenCalledTimes(4);
    });
    it("rejects changed or login-page assets before creating any upload session",async()=>{
        vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>login</html>"));
        await expect(importExampleMatter(EXAMPLE_MATTERS[0],new AbortController().signal)).rejects.toMatchObject({code:"asset",uploadAttempted:false});expect(upload).not.toHaveBeenCalled();
    });
    it("does not treat partial completion or unready versions as a complete selection",async()=>{
        upload.mockImplementation(async(_kind,files)=>{const result=success(files);result[2].result.status="processing";return result;});
        await expect(importExampleMatter(EXAMPLE_MATTERS[0],new AbortController().signal)).rejects.toMatchObject({code:"upload",uploadAttempted:true});expect(upload).toHaveBeenCalledOnce();
    });
    it("carries cancellation through and never creates a session after an aborted asset stage",async()=>{
        const controller=new AbortController();controller.abort();
        await expect(importExampleMatter(EXAMPLE_MATTERS[0],controller.signal)).rejects.toMatchObject({name:"AbortError"});expect(upload).not.toHaveBeenCalled();
    });
});
