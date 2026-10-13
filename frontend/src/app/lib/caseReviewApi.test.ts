import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseReviewRecord, CaseReviewSource } from "@mike/contracts";
import { clearCaseReview, getCaseReview, isReviewActive, parseCaseReviewRecord, rememberCaseReview, savedCaseReview, startCaseReview, stopCaseReview } from "./caseReviewApi";
const id="11111111-1111-4111-8111-111111111111", doc="22222222-2222-4222-8222-222222222222", version="33333333-3333-4333-8333-333333333333";
const quote="Die Partei behauptet eine Zahlung.";
function fixture():CaseReviewRecord {
    const source:CaseReviewSource={passage_id:"p1",document_id:doc,version_id:version,version_number:2,filename:"Eingabe.pdf",page:2,start:0,end:Array.from(quote).length,quote,pdf_sha256:"a".repeat(64),page_sha256:"b".repeat(64),source_match:"exact"};
    const input={request_id:id,kind:"facts" as const,language:"de" as const,sources:[{document_id:doc,version_id:version,role:"claim" as const,party_label:"Partei A"}]};
    return {id,status:"completed",created_at:"2026-10-10T12:00:00Z",input,error:null,report:{version:1,kind:"facts",language:"de",processing:"courtos_server_germany",model:"gemma",rows:[{id:"r1",category:"fact",proposition:source,party_label:"Partei A",source_role:"claim",posture:"allegation",date:null,date_sort:null,date_status:"undated",amounts:[],assessment:"not_found",reasoning:"Kein Zahlungsnachweis in der Auswahl.",evidence:[],opposing_position:[],cited_references:[],assessment_basis:"selected_sources_only",semantic_status:"ai_draft_requires_review"}],coverage:{selection:[{document_id:doc,version_id:version,version_number:2,filename:"Eingabe.pdf",pages:[1,2],role:"claim",party_label:"Partei A"}],extracted_text_bytes:120,complete_selected_text:true,all_claims_extracted:false,more_claims_reported:false,external_legal_research_performed:false},notices:[]}};
}
beforeEach(()=>sessionStorage.clear()); afterEach(()=>vi.unstubAllGlobals());
describe("bounded personal review API",()=>{
    it("flags only in-progress statuses as active, treating a missing record as inactive",()=>{
        expect(isReviewActive(null)).toBe(false);
        const record=(status:string)=>({status} as unknown as CaseReviewRecord);
        for(const status of ["queued","reading","analysing","checking"])expect(isReviewActive(record(status))).toBe(true);
        for(const status of ["completed","failed","cancelled","interrupted"])expect(isReviewActive(record(status))).toBe(false);
    });
    it("sends the exact immutable source selection once; reads and stops use no source body",async()=>{
        const body=fixture();const fetch=vi.fn(async()=>new Response(JSON.stringify(body),{status:200}));vi.stubGlobal("fetch",fetch);
        await startCaseReview(body.input);await getCaseReview(id);await stopCaseReview(id);
        expect(fetch).toHaveBeenNthCalledWith(1,"/api/knowledge/reviews",expect.objectContaining({method:"POST",credentials:"include",body:JSON.stringify(body.input)}));
        expect(fetch).toHaveBeenNthCalledWith(2,`/api/knowledge/reviews/${id}`,expect.objectContaining({method:"GET"}));
        expect(fetch).toHaveBeenNthCalledWith(3,`/api/knowledge/reviews/${id}/stop`,expect.objectContaining({method:"POST",body:"{}"}));
    });
    it.each([401,403,404,409,429,503])("maps status %s without exposing backend details",async status=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({detail:"private storage path",code:"unknown"}),{status})));
        await expect(getCaseReview(id)).rejects.not.toThrow("private storage path");
    });
    it.each(["wrongVersion","unverified","unknownRole","missingCoverage","fakeComplete","reportOnFailure","wrongOffsets"])("refuses malformed/unbound report %s",change=>{
        const value=fixture();const row=value.report!.rows[0];
        if(change==="wrongVersion") row.proposition.version_id=id;
        if(change==="unverified") (row.proposition as unknown as {source_match:string}).source_match="unverified";
        if(change==="unknownRole") (row as unknown as {source_role:string}).source_role="imaginary";
        if(change==="missingCoverage") value.report!.coverage.selection=[];
        if(change==="fakeComplete") (value.report!.coverage as unknown as {all_claims_extracted:boolean}).all_claims_extracted=true;
        if(change==="reportOnFailure") value.status="failed";
        if(change==="wrongOffsets") row.proposition.end=1;
        expect(()=>parseCaseReviewRecord(value,id)).toThrow();
    });
    it("recovers from a corrupted stored review reference",()=>{
        sessionStorage.setItem("courtos:review-reference:v1:alice","not json");
        expect(savedCaseReview("alice")).toBeNull();
    });
    it("keeps only a per-account handle for reload, never document text",()=>{
        rememberCaseReview("alice",id);expect(savedCaseReview("alice")).toBe(id);expect(savedCaseReview("bob")).toBeNull();
        expect(sessionStorage.getItem("courtos:review-reference:v1:alice")).toBe(JSON.stringify({owner:"alice",id}));
        clearCaseReview("alice");expect(savedCaseReview("alice")).toBeNull();
    });
    it("distinguishes safe context refusal from generic service failure",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:"review_context_unavailable",detail:"internal context details"}),{status:503})));
        await expect(startCaseReview(fixture().input)).rejects.toMatchObject({code:"context"});
    });
    it.each([["review_invalid_output","output"],["review_grounding_failed","grounding"]])("keeps %s distinct without exposing provider detail",async(serverCode,clientCode)=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:serverCode,detail:"private provider detail"}),{status:422})));
        await expect(startCaseReview(fixture().input)).rejects.toMatchObject({code:clientCode,message:clientCode});
    });
    it("rejects unordered chronology and retains an explicitly ambiguous date",()=>{
        const value=fixture();value.input.kind="chronology";value.report!.kind="chronology";
        const row=value.report!.rows[0];row.date=row.proposition;row.date_status="exact_day";row.date_sort="2026-09-07";
        value.report!.rows.push({...row,id:"r2",date_sort:"2026-09-05"});
        expect(()=>parseCaseReviewRecord(value,id)).toThrow();
        value.report!.rows[1].date_sort=null;value.report!.rows[1].date_status="ambiguous";
        expect(parseCaseReviewRecord(value,id).report!.rows[1].date?.quote).toBe(quote);
    });
    it("rejects a missing record value",()=>{
        expect(()=>parseCaseReviewRecord(null,id)).toThrow();
    });
    it("rejects an exact-day date status without a date",()=>{
        const value=fixture();const row=value.report!.rows[0];
        row.date_status="exact_day";row.date_sort="2026-09-07";row.date=null;
        expect(()=>parseCaseReviewRecord(value,id)).toThrow();
    });
    it("rejects an oversized proposition array such as more than three amounts",()=>{
        const value=fixture();const row=value.report!.rows[0];
        row.amounts=[row.proposition,row.proposition,row.proposition,row.proposition];
        expect(()=>parseCaseReviewRecord(value,id)).toThrow();
    });
    it("rejects a duplicate coverage-selection entry for the same source",()=>{
        const value=fixture();
        value.input.sources.push({document_id:"44444444-4444-4444-8444-444444444444",version_id:"55555555-5555-4555-8555-555555555555",role:"response",party_label:"Partei B"});
        value.report!.coverage.selection.push({...value.report!.coverage.selection[0]});
        expect(()=>parseCaseReviewRecord(value,id)).toThrow();
    });
    it("accepts a non-completed record carrying no report",()=>{
        const value=fixture();value.status="queued";value.report=null;
        expect(parseCaseReviewRecord(value,id)).toBe(value);
    });
    it("rejects a malformed id before any request",async()=>{
        const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
        await expect(getCaseReview("not-a-uuid")).rejects.toMatchObject({code:"input"});
        expect(fetch).not.toHaveBeenCalled();
    });
    it("falls back to the generic error when an error response body isn't valid JSON",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response("not json",{status:500})));
        await expect(getCaseReview(id)).rejects.toMatchObject({code:"unavailable"});
    });
    it("falls back to the generic error when an error response carries no string error code",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({detail:"internal"}),{status:500})));
        await expect(getCaseReview(id)).rejects.toMatchObject({code:"unavailable"});
    });
    it("rejects a short extra-field entry that fails source verification",()=>{
        const value=fixture();const row=value.report!.rows[0];
        row.evidence=[{...row.proposition,source_match:"unverified"} as unknown as CaseReviewSource];
        expect(()=>parseCaseReviewRecord(value,id)).toThrow();
    });
    it("maps a 404 on a write request to source, distinct from a missing GET",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:"unknown"}),{status:404})));
        await expect(stopCaseReview(id)).rejects.toMatchObject({code:"source"});
    });
    it("maps an unrecognised 422 without a known error code to input",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:"something_else"}),{status:422})));
        await expect(getCaseReview(id)).rejects.toMatchObject({code:"input"});
    });
    it("maps a thrown network failure before any response to the generic error",async()=>{
        vi.stubGlobal("fetch",vi.fn(async()=>{throw new TypeError("Failed to fetch");}));
        await expect(getCaseReview(id)).rejects.toMatchObject({code:"unavailable"});
    });
    it("ignores an empty owner or a malformed id without storing anything",()=>{
        rememberCaseReview("",id);expect(sessionStorage.length).toBe(0);
        rememberCaseReview("alice","not-a-uuid");expect(sessionStorage.length).toBe(0);
    });
});
