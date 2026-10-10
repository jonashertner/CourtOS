import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/supabase";
import { CiteIndex } from "../../../lib/citecheck/vendor/index";
const mocks=vi.hoisted(()=>({load:vi.fn(),index:vi.fn()}));
vi.mock("../../chat/chat.service",()=>({loadCaseReviewEvidence:mocks.load}));
vi.mock("../../../lib/citecheck",async()=>({...await vi.importActual("../../../lib/citecheck"),loadCitationIndex:mocks.index}));
import { checkSelectedCitations, formalCitationFindings, citationCodepointRange } from "../knowledge.citationCheck";
import { CitationIndexUnavailable } from "../../../lib/citecheck";
const doc="00000000-0000-4000-8000-000000000001",version="00000000-0000-4000-8000-000000000002";
const input={sources:[{document_id:doc,version_id:version}]};
const db={} as Db;
const index=new CiteIndex(new TextEncoder().encode("#ocl-cite-index 1 synthetic-test-only\n4A_747/2012\tbger\tCH\t2013-04-05\t1,2.3\tbger_4A_747_2012\nBGE 140 III 0115\tbge\tCH\t2014-01-17\t2.1,2.2,2.3\tbge_BGE_140_III_115\nBGE 140 III 0200\tbge\tCH\t2014-02-01\t1\tbge_BGE_140_III_200\n"));
const evidence=(text="BGE 140 III 115 E. 2.3")=>[{document_id:doc,version_id:version,version_number:2,filename:"own.pdf",pdf_sha256:"a".repeat(64),version_sha256:"a".repeat(64),pages:[{page:1,text,sha256:"b".repeat(64)}]}];
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("COURTOS_PILOT_MODE","true");vi.stubEnv("COURTOS_KNOWLEDGE_ENABLED","true");mocks.load.mockImplementation(async()=>evidence());mocks.index.mockResolvedValue(index);});
describe("deterministic citation check",()=>{
  it.each(["BGE","ATF","DTF"])("checks %s against the same index without a model",label=>{
    const result=formalCitationFindings(evidence(`${label} 140 III 115 E. 2.3`),index);
    expect(result).toHaveLength(1);expect(result[0]).toMatchObject({status:"found",semantic_support:"not_assessed",quoted_decision_wording:"not_checked",source:{document_id:doc,version_id:version,page:1}});
  });
  it("keeps duplicate occurrences and maps astral-prefix UTF16 positions to page codepoints",()=>{
    const text="😀 BGE 140 III 115 E. 2.3; BGE 140 III 115 E. 2.3";
    const result=formalCitationFindings(evidence(text),index);expect(result).toHaveLength(2);
    expect(result[0].source.start).toBe(2);expect(result[1].source.start).toBeGreaterThan(result[0].source.end);
    for(const finding of result)expect(Array.from(text).slice(finding.source.start,finding.source.end).join("")).toBe(finding.source.quote);
  });
  it("does not convert an absent pinpoint, mismatched date or unrecognised reporter to verified",()=>{
    const findings=formalCitationFindings(evidence("BGE 140 III 115 E. 2.9; Urteil 4A_747/2012 vom 5. Mai 2013; ZR 110 Nr. 23; BGE 999 III 100"),index);
    expect(findings.map(f=>f.status)).toEqual(["differs","differs","unchecked","missing"]);
    expect(findings[0].issues[0].kind).toBe("pinpoint");expect(findings[1].issues[0].kind).toBe("date");
  });
  it("rejects an anchor cutting an emoji or invalid offsets",()=>{
    expect(()=>citationCodepointRange("😀 x",1,2)).toThrow();expect(()=>citationCodepointRange("abc",0,4)).toThrow();
    expect(citationCodepointRange("😀 x",3,4)).toEqual({start:2,end:3,quote:"x"});
  });
  it("keeps unavailable numbering and parent-only numbering explicitly unresolved",()=>{
    const noStructure=new CiteIndex(new TextEncoder().encode("#ocl-cite-index 1 synthetic-test-only\nBGE 140 III 0115\tbge\tCH\t2014-01-17\t\tbge_BGE_140_III_115\n"));
    const parentOnly=new CiteIndex(new TextEncoder().encode("#ocl-cite-index 1 synthetic-test-only\nBGE 140 III 0115\tbge\tCH\t2014-01-17\t2.3\tbge_BGE_140_III_115\n"));
    expect(formalCitationFindings(evidence(),noStructure)[0]).toMatchObject({status:"found",pinpoint:"no_structure"});
    expect(formalCitationFindings(evidence("BGE 140 III 115 E. 2.3a"),parentOnly)[0]).toMatchObject({status:"found",pinpoint:"parent_only"});
    expect(formalCitationFindings(evidence("BGE 999 III 100 E. 2.3"),index)[0]).toMatchObject({status:"missing",pinpoint:"not_checked"});
  });
  it("uses owner-bound exact-version admission twice and returns index provenance, not support assurance",async()=>{
    const response=await checkSelectedCitations(db,"owner",input);expect(response.ok).toBe(true);
    expect(mocks.load).toHaveBeenCalledTimes(2);expect(mocks.load).toHaveBeenLastCalledWith(db,"owner",input.sources,"citation_check");
    if(response.ok){expect(response.data.engine.commit).toMatch(/^[a-f0-9]{40}$/);expect(response.data.coverage).toMatchObject({all_citation_forms_recognised:false,images_checked:false,multiple_pinpoints:"first_only"});expect(response.data.counts.found).toBe(1);}
  });
  it.each([{sources:[]},{sources:[...input.sources,...input.sources]},{...input,user_id:"other"},{sources:[{...input.sources[0],filename:"secret"}]}])("rejects invalid/client-authority input before reading",async raw=>{
    expect(await checkSelectedCitations(db,"owner",raw)).toMatchObject({ok:false,code:"citation_check_invalid"});expect(mocks.load).not.toHaveBeenCalled();
  });
  it("returns no foreign/private metadata when source admission refuses",async()=>{
    mocks.load.mockRejectedValue(Object.assign(new Error("secret foreign filename"),{code:"source_grounding_failed",issue:"unavailable"}));
    const result=await checkSelectedCitations(db,"other",input);expect(result).toMatchObject({ok:false,kind:"not_found",code:"citation_check_source_unavailable"});expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("rejects changed bytes/version before releasing any findings",async()=>{
    mocks.load.mockResolvedValueOnce(evidence()).mockResolvedValueOnce([{...evidence()[0],pdf_sha256:"c".repeat(64)}]);
    expect(await checkSelectedCitations(db,"owner",input)).toMatchObject({ok:false,code:"citation_check_source_changed"});
  });
  it("rejects over 500 recognised citations without a partial report",async()=>{
    mocks.load.mockResolvedValue(evidence("BGE 140 III 115 E. 2.3; ".repeat(501)));
    const result=await checkSelectedCitations(db,"owner",input);
    expect(result).toMatchObject({ok:false,kind:"validation",code:"citation_check_scope"});
    expect(result).not.toHaveProperty("data");expect(mocks.load).toHaveBeenCalledOnce();
  });
  it("fails closed on missing verified index and never falls back to network",async()=>{
    mocks.index.mockRejectedValue(new CitationIndexUnavailable());const fetch=vi.spyOn(globalThis,"fetch");
    expect(await checkSelectedCitations(db,"owner",input)).toMatchObject({ok:false,code:"citation_index_unavailable"});expect(mocks.load).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
  });
  it("bounds concurrent scans and releases admission after failure",async()=>{
    let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});mocks.index.mockImplementation(async()=>{await wait;return index;});
    const first=checkSelectedCitations(db,"a",input),second=checkSelectedCitations(db,"b",input);
    expect(await checkSelectedCitations(db,"c",input)).toMatchObject({ok:false,code:"citation_check_busy"});release();await Promise.all([first,second]);
    expect((await checkSelectedCitations(db,"c",input)).ok).toBe(true);
  });
});
