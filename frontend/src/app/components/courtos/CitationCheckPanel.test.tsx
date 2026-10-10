import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CitationCheckReport, FormalCitationStatus } from "@mike/contracts";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { CitationCheckError } from "@/app/lib/citationCheckApi";
import { citationCheckMessages as C } from "@/app/lib/citationCheckMessages";
import { CitationCheckPanel } from "./CitationCheckPanel";
const api=vi.hoisted(()=>({check:vi.fn()}));
vi.mock("@/app/lib/citationCheckApi",async original=>({...await original<typeof import("@/app/lib/citationCheckApi")>(),checkCitations:api.check}));
const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222",sources=[{document_id:id,version_id:version}];
function fixture():CitationCheckReport{return {version:1,checked_at:"2026-10-10T16:00:00Z",engine:{name:"citecheck",commit:"e".repeat(40)},index:{generated:"2026-10-10",sha256:"a".repeat(64),decisions:100,labels:120,with_numbering:80},coverage:{documents:1,pages:2,extracted_text_bytes:400,complete_selected_extracted_text:true,all_citation_forms_recognised:false,images_checked:false,multiple_pinpoints:"first_only"},counts:{found:1,differs:1,missing:1,unchecked:1},semantic_support:"not_assessed",findings:(["found","differs","missing","unchecked"] as FormalCitationStatus[]).map((status,i)=>({id:`citation-${i+1}`,source:{document_id:id,version_id:version,version_number:2,filename:"Klage.pdf",pdf_sha256:"b".repeat(64),page_sha256:"c".repeat(64),page:2,start:0,end:13,quote:`BGE 137 I 19${i}`},status,pinpoint:i===0?"exists":i===1?"absent":"not_checked",decisions:i<2?[{decision_id:"bge137I195",label:"BGE 137 I 195",court:"BGer",canton:"CH",date:"2011-03-18",numbered_sections:["2.3"]}]:[],decisions_omitted:0,issues:i===1?[{kind:"pinpoint",written:"2.9",listed:["2.3"],nearby:["2.3"]}]:[],notes:[],suggestions:[],semantic_support:"not_assessed",quoted_decision_wording:"not_checked"}))};}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();setCourtOSLocale("checker-owner","de");api.check.mockResolvedValue(fixture());});
const mount=(props:Partial<Parameters<typeof CitationCheckPanel>[0]>={})=>render(<CourtOSLocaleProvider ownerId="checker-owner"><CitationCheckPanel sources={sources} disabled={false} onBusyChange={()=>{}} onOpen={()=>{}} {...props}/></CourtOSLocaleProvider>);
describe("integrated formal citation check",()=>{
    it.each(["de","fr","it","en"] as const)("%s: runs only on click and separates formal results from legal support",async locale=>{
        setCourtOSLocale("checker-owner",locale);const open=vi.fn();mount({onOpen:open});
        expect(api.check).not.toHaveBeenCalled();expect(screen.getByText(C.intro[locale])).toBeVisible();
        fireEvent.click(screen.getByRole("button",{name:C.start[locale]}));
        expect(await screen.findByText(C.caveat[locale])).toBeVisible();
        for(const status of ["found","differs","missing","unchecked"] as const)expect(screen.getAllByText(C[status][locale]).length).toBeGreaterThan(0);
        expect(screen.getByText(C.missingHelp[locale])).toBeVisible();expect(screen.getByText(C.excluded[locale])).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole("button",{name:/Klage.pdf/})[0]);
        expect(open).toHaveBeenCalledWith(expect.objectContaining({document_id:id,version_id:version,page:2,quote:"BGE 137 I 190",pdf_sha256:"b".repeat(64),page_sha256:"c".repeat(64),source_match:"exact"}));
        expect(api.check).toHaveBeenCalledExactlyOnceWith({sources},expect.any(AbortSignal));
        const links=Array.from(document.querySelectorAll("a[href^='https://mcp.opencaselaw.ch/entscheid/']"));
        expect(links).toHaveLength(2);
        for(const link of links){expect(link).toHaveAttribute("aria-label",`${C.openDecision[locale]}: BGE 137 I 195`);expect(link).toHaveAttribute("href","https://mcp.opencaselaw.ch/entscheid/bge137I195");expect(link).toHaveAttribute("target","_blank");expect(link).toHaveAttribute("rel","noopener noreferrer");}
        expect(api.check).toHaveBeenCalledTimes(1);
    });
    it("does not present an empty recognised set as a clean document",async()=>{
        const value=fixture();value.findings=[];value.counts={found:0,differs:0,missing:0,unchecked:0};api.check.mockResolvedValue(value);mount();
        fireEvent.click(screen.getByRole("button",{name:C.start.de}));expect(await screen.findByText(C.empty.de)).toBeVisible();
        expect(screen.getByText(C.caveat.de)).toBeVisible();
    });
    it("prevents double requests, reports busy to the selector, and discards a late response after unmount",async()=>{
        let resolve!:(value:CitationCheckReport)=>void;api.check.mockReturnValue(new Promise(done=>{resolve=done;}));const busy=vi.fn();const view=mount({onBusyChange:busy});
        fireEvent.click(screen.getByRole("button",{name:C.start.de}));expect(screen.getByRole("button",{name:C.running.de})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:C.running.de}));expect(api.check).toHaveBeenCalledTimes(1);expect(busy).toHaveBeenLastCalledWith(true);
        const signal=api.check.mock.calls[0][1];view.unmount();expect(signal.aborted).toBe(true);expect(busy).toHaveBeenLastCalledWith(false);
        await act(async()=>resolve(fixture()));expect(screen.queryByText(C.caveat.de)).toBeNull();
    });
    it.each(["scope","source","changed","busy","index","session","unavailable"] as const)("shows safe %s failure without automatic retry or partial results",async code=>{
        api.check.mockRejectedValue(new CitationCheckError(code));mount();fireEvent.click(screen.getByRole("button",{name:C.start.de}));
        expect(await screen.findByRole("alert")).not.toHaveTextContent("private");expect(screen.queryByText(C.caveat.de)).toBeNull();expect(api.check).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button",{name:C.start.de})).toBeEnabled();
    });
    it("does not retain an old success while retrying or after a new failure",async()=>{
        mount();fireEvent.click(screen.getByRole("button",{name:C.start.de}));await screen.findByText(C.caveat.de);
        api.check.mockRejectedValue(new Error("private file system path"));fireEvent.click(screen.getByRole("button",{name:C.start.de}));expect(await screen.findByRole("alert")).toHaveTextContent(C.error.de);expect(screen.queryByText(C.caveat.de)).toBeNull();
    });
    it("requires a selection and keeps returned source text inert",async()=>{
        const first=mount({sources:[]});expect(screen.getByRole("button",{name:C.start.de})).toBeDisabled();expect(api.check).not.toHaveBeenCalled();first.unmount();
        const value=fixture();value.findings[0].source.quote='<img src=x onerror="alert(1)">';api.check.mockResolvedValue(value);mount();fireEvent.click(screen.getByRole("button",{name:C.start.de}));await waitFor(()=>expect(screen.getByText(value.findings[0].source.quote)).toBeVisible());expect(document.querySelector("img")).toBeNull();
    });
});
