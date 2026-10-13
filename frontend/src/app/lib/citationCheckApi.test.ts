import { afterEach, describe, expect, it, vi } from "vitest";
import type { CitationCheckInput, CitationCheckReport } from "@mike/contracts";
import { checkCitations, parseCitationCheckReport, citationIndexDecisionUrl } from "./citationCheckApi";
vi.mock("@/app/lib/errorReporting",()=>({trackPendingRequest:()=>()=>{},markErrorHandled:vi.fn(),reportApiFailure:vi.fn(),reportNetworkFailure:vi.fn()}));
const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222";
const input:CitationCheckInput={sources:[{document_id:id,version_id:version}]};
const quote="BGE 137 I 195 E. 2.3";
function fixture():CitationCheckReport{return {version:1,checked_at:"2026-10-10T16:00:00Z",engine:{name:"citecheck",commit:"e".repeat(40)},index:{generated:"2026-10-10",sha256:"a".repeat(64),decisions:100,labels:120,with_numbering:80},coverage:{documents:1,pages:2,extracted_text_bytes:400,complete_selected_extracted_text:true,all_citation_forms_recognised:false,images_checked:false,multiple_pinpoints:"first_only"},counts:{found:1,differs:0,missing:0,unchecked:0},semantic_support:"not_assessed",findings:[{id:"citation-1",source:{document_id:id,version_id:version,version_number:2,filename:"Klage.pdf",pdf_sha256:"b".repeat(64),page_sha256:"c".repeat(64),page:2,start:7,end:7+Array.from(quote).length,quote},status:"found",pinpoint:"exists",decisions:[{decision_id:"bge137I195",label:"BGE 137 I 195",court:"BGer",canton:"CH",date:"2011-03-18",numbered_sections:["2.3"]}],decisions_omitted:0,issues:[],notes:[],suggestions:[],semantic_support:"not_assessed",quoted_decision_wording:"not_checked"}]};}
afterEach(()=>vi.unstubAllGlobals());
describe("formal citation API",()=>{
    it("links validated index IDs only to the existing fixed viewer, preserving literal hashes as data",()=>{
        const id="ow_gerichte_OGVE-2016-17-79.htm#";
        const url=citationIndexDecisionUrl(id)!;
        expect(url).toBe("https://mcp.opencaselaw.ch/entscheid/ow_gerichte_OGVE-2016-17-79.htm%23");
        expect(new URL(url).hash).toBe("");expect(new URL(url).search).toBe("");
        expect(decodeURIComponent(new URL(citationIndexDecisionUrl("BGE 137 I 195")!).pathname.split("/").at(-1)!)).toBe("BGE 137 I 195");
        for(const value of ["", "../secret", "https://evil.example", "//evil.example", "id/child", "id\\child", "id\n", "id%2fchild", "id?text=private", "a".repeat(241), null])expect(citationIndexDecisionUrl(value)).toBeNull();
    });
    it("sends only selected original IDs once to the authenticated internal route",async()=>{
        const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture()),{status:200}));vi.stubGlobal("fetch",fetch);
        const controller=new AbortController();await checkCitations(input,controller.signal);
        expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/knowledge/citations/check",expect.objectContaining({method:"POST",credentials:"include",cache:"no-store",body:JSON.stringify(input),signal:controller.signal}));
    });
    it.each(["version","offset","pdfHash","pageHash","semantic","wording","count","coverage","image","pinpoints","duplicate","overLimit"])("rejects incomplete or misleading %s report",change=>{
        const value=fixture(),finding=value.findings[0];
        if(change==="version")finding.source.version_id=id;
        if(change==="offset")finding.source.end++;
        if(change==="pdfHash")finding.source.pdf_sha256="unknown";
        if(change==="pageHash")finding.source.page_sha256="unknown";
        if(change==="semantic")Object.assign(value,{semantic_support:"verified"});
        if(change==="wording")Object.assign(finding,{quoted_decision_wording:"checked"});
        if(change==="count")value.counts.found=2;
        if(change==="coverage")value.coverage.documents=2;
        if(change==="image")Object.assign(value.coverage,{images_checked:true});
        if(change==="pinpoints")Object.assign(value.coverage,{multiple_pinpoints:"all"});
        if(change==="duplicate"){value.findings.push(finding);value.counts.found=2;}
        if(change==="overLimit")value.coverage.extracted_text_bytes=1048577;
        expect(()=>parseCitationCheckReport(value,input)).toThrow("unavailable");
    });
    it("accepts populated issues, notes and suggestions carrying null, text or mixed written content",()=>{
        const value=fixture();const finding=value.findings[0];
        finding.issues=[{kind:"court",written:null,listed:["BGer"],nearby:[]},{kind:"pinpoint",written:[2,3],listed:[],nearby:["context"]}];
        finding.notes=[{kind:"spelling",written:"BGE 137 I 195",parent:null},{kind:"merge",written:null,parent:"root-id"}];
        finding.suggestions=[{reason:"closest match",decision:{decision_id:"bge137I195",label:"BGE 137 I 195",court:"BGer",canton:"CH",date:"2011-03-18",numbered_sections:["2.3"]}}];
        const parsed=parseCitationCheckReport(value,input);
        expect(parsed.findings[0].issues[0].written).toBeNull();
        expect(parsed.findings[0].issues[1].written).toEqual([2,3]);
        expect(parsed.findings[0].notes[1].parent).toBe("root-id");
        expect(parsed.findings[0].suggestions[0].decision.decision_id).toBe("bge137I195");
    });
    it("accepts Unicode offsets, full deterministic scope and an honest empty result",()=>{
        const value=fixture();value.findings[0].source.quote="😀 BGE 137 I 195";value.findings[0].source.end=value.findings[0].source.start+Array.from(value.findings[0].source.quote).length;
        value.coverage.pages=200;value.coverage.extracted_text_bytes=1048576;
        expect(parseCitationCheckReport(value,input).findings[0].source.quote).toMatch(/^😀/);
        value.findings=[];value.counts.found=0;expect(parseCitationCheckReport(value,input).findings).toEqual([]);
    });
    it.each([[400,"citation_check_scope","scope"],[404,"citation_check_source_unavailable","source"],[409,"citation_check_source_changed","changed"],[503,"citation_check_busy","busy"],[503,"citation_index_unavailable","index"],[401,"unknown","session"],[503,"private-provider-error","unavailable"]])("maps %s/%s to safe %s without retry",async(status,code,expected)=>{
        const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({code,detail:"secret source path"}),{status:Number(status)}));vi.stubGlobal("fetch",fetch);
        await expect(checkCitations(input)).rejects.toMatchObject({code:expected,message:expected});expect(fetch).toHaveBeenCalledTimes(1);
    });
    it("rejects duplicate selection before request and preserves caller cancellation",async()=>{
        const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
        await expect(checkCitations({sources:[...input.sources,...input.sources]})).rejects.toMatchObject({code:"scope"});expect(fetch).not.toHaveBeenCalled();
        const controller=new AbortController(),error=new DOMException("Cancelled","AbortError");fetch.mockImplementation(()=>{controller.abort();throw error;});
        await expect(checkCitations(input,controller.signal)).rejects.toBe(error);
    });
    it("propagates a parse failure from a malformed successful response unchanged",async()=>{
        vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({not:"a report"}),{status:200})));
        await expect(checkCitations(input)).rejects.toMatchObject({code:"unavailable"});
    });
    it("falls back to the generic error for an unrecognised thrown failure",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>{throw new Error("boom");}));
        await expect(checkCitations(input)).rejects.toMatchObject({code:"unavailable"});
    });
});
