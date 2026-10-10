import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseReviewInput, CaseReviewRecord, CaseReviewSource, CaseReviewRow } from "@mike/contracts";
import { CaseReviewWorkspace } from "./CaseReviewWorkspace";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { CaseReviewError } from "@/app/lib/caseReviewApi";
const api=vi.hoisted(()=>({list:vi.fn(),start:vi.fn(),get:vi.fn(),stop:vi.fn(),owner:"owner"}));
vi.mock("@/app/contexts/AuthContext",()=>({useAuth:()=>({user:{id:api.owner}})}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/app/lib/mikeApi",()=>({searchLibraryDocuments:api.list}));
vi.mock("@/app/lib/caseReviewApi",async original=>({...await original<typeof import("@/app/lib/caseReviewApi")>(),startCaseReview:api.start,getCaseReview:api.get,stopCaseReview:api.stop}));
vi.mock("./KnowledgeWorkspace",()=>({LocalSource:({result}:{result:{quote:string;version_id:string;page:number}})=><div data-testid="original-source" data-version={result.version_id} data-page={result.page}>{result.quote}</div>}));
const doc={id:"22222222-2222-4222-8222-222222222222",current_version_id:"33333333-3333-4333-8333-333333333333",active_version_number:2,filename:"Eingabe.pdf",file_type:"pdf",status:"ready"};
const pending=(input:CaseReviewInput):CaseReviewRecord=>({id:input.request_id,input,status:"analysing",created_at:"2026-10-10T12:00:00Z",report:null,error:null});
const renderApp=()=>render(<CourtOSLocaleProvider ownerId={api.owner}><CaseReviewWorkspace/></CourtOSLocaleProvider>);
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();api.owner="owner";setCourtOSLocale("owner","de");api.list.mockResolvedValue({documents:[doc,{...doc,id:"other",filename:"Antwort.docx",file_type:"docx"}],documentsHasMore:false});api.start.mockImplementation(async input=>pending(input));api.get.mockImplementation(async()=>new Promise(()=>{}));});
describe("submission review work flow",()=>{
    it("requires explicit original-PDF selection and sends roles, party label and exact version only on start",async()=>{
        renderApp();expect(api.start).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Teilanalyse starten"})).toBeDisabled();
        expect(await screen.findByRole("checkbox",{name:/Antwort.docx/})).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox",{name:/Eingabe.pdf/}));
        fireEvent.change(screen.getByLabelText("Dokumentrolle"),{target:{value:"claim"}});
        fireEvent.change(screen.getByLabelText("Partei / Urheber"),{target:{value:"Partei A"}});
        fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        await screen.findByText("Entwurf wird erstellt");
        expect(api.start).toHaveBeenCalledOnce();expect(api.start.mock.calls[0][0]).toMatchObject({kind:"facts",language:"de",sources:[{document_id:doc.id,version_id:doc.current_version_id,role:"claim",party_label:"Partei A"}]});
        expect(api.get).toHaveBeenCalledWith(api.start.mock.calls[0][0].request_id,expect.any(AbortSignal));
    });
    it("retries an unconfirmed start with the same request ID and locked selection",async()=>{
        api.start.mockRejectedValueOnce(new Error("network"));renderApp();fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));
        fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        const retry=await screen.findByRole("button",{name:"Übermittlung erneut versuchen"});
        expect(screen.getByLabelText("Dokumentrolle")).toBeDisabled();expect(screen.queryByRole("button",{name:"Neue Auswahl"})).toBeNull();
        fireEvent.click(retry);await screen.findByText("Entwurf wird erstellt");
        expect(api.start.mock.calls[0][0]).toEqual(api.start.mock.calls[1][0]);
    });
    it("restores a saved handle by GET without starting or repeating a model request",async()=>{
        const input:CaseReviewInput={request_id:"11111111-1111-4111-8111-111111111111",kind:"legal",language:"de",sources:[{document_id:doc.id,version_id:doc.current_version_id,role:"claim",party_label:null}]};
        sessionStorage.setItem("courtos:review-reference:v1:owner",JSON.stringify({owner:"owner",id:input.request_id}));
        api.get.mockResolvedValue({...pending(input),status:"failed",error:{code:"review_grounding_failed",detail:"private provider detail"}});
        renderApp();await screen.findByText("Kein Prüfentwurf freigegeben");expect(screen.queryByText("private provider detail")).toBeNull();expect(api.start).not.toHaveBeenCalled();
    });
    it("renders an English task and keeps the explicitly chosen report language when interface language changes",async()=>{
        setCourtOSLocale("owner","en");renderApp();await screen.findByRole("heading",{name:"Review submissions"});
        fireEvent.change(screen.getByLabelText("Draft language"),{target:{value:"fr"}});
        await act(async()=>{setCourtOSLocale("owner","it");});
        expect(screen.getByRole("heading",{name:"Esaminare gli atti"})).toBeVisible();expect(screen.getByLabelText("Lingua della bozza")).toHaveValue("fr");expect(api.start).not.toHaveBeenCalled();
    });
    it("keeps an uncertain request after a retry loses authentication, until GET can resolve it",async()=>{
        api.start.mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(new CaseReviewError("session",true));
        api.get.mockRejectedValue(new CaseReviewError("session",true));
        renderApp();fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));
        fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        fireEvent.click(await screen.findByRole("button",{name:"Übermittlung erneut versuchen"}));
        await screen.findByRole("button",{name:"Status erneut laden"});
        const id=api.start.mock.calls[0][0].request_id;
        expect(JSON.parse(sessionStorage.getItem("courtos:review-reference:v1:owner")!)).toEqual({owner:"owner",id});
        expect(screen.queryByRole("button",{name:"Neue Auswahl"})).toBeNull();
        expect(api.start.mock.calls[1][0].request_id).toBe(id);expect(api.get).toHaveBeenCalledWith(id,expect.any(AbortSignal));
    });
    it("shows the explicit context failure without provider detail",async()=>{
        api.start.mockRejectedValueOnce(new CaseReviewError("context",true));renderApp();
        fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        expect(await screen.findByRole("alert")).toHaveTextContent("Es wurde nichts gekürzt");
        expect(screen.getByLabelText("Dokumentrolle")).toBeEnabled();expect(api.get).not.toHaveBeenCalled();
    });
    it("preserves source quotations and explicit dates, separates uncertain dates and opens the immutable page",async()=>{
        const input:CaseReviewInput={request_id:"11111111-1111-4111-8111-111111111111",kind:"chronology",language:"de",sources:[{document_id:doc.id,version_id:doc.current_version_id,role:"claim",party_label:"Partei A"}]};
        const source=(quote:string,page:number):CaseReviewSource=>({passage_id:`p${page}`,document_id:doc.id,version_id:doc.current_version_id,version_number:2,filename:doc.filename,page,start:0,end:Array.from(quote).length,quote,pdf_sha256:"a".repeat(64),page_sha256:"b".repeat(64),source_match:"exact"});
        const row=(id:string,quote:string,date:CaseReviewSource|null,dateSort:string|null,status:CaseReviewRow["date_status"]):CaseReviewRow=>({id,category:"fact",proposition:source(quote,2),party_label:"Partei A",source_role:"claim",posture:"allegation",date,date_sort:dateSort,date_status:status,amounts:[],assessment:"inconclusive",reasoning:"Ein Zahlungsnachweis fehlt.",evidence:[],opposing_position:[],cited_references:[],assessment_basis:"selected_sources_only",semantic_status:"ai_draft_requires_review"});
        const result:CaseReviewRecord={...pending(input),status:"completed",report:{version:1,kind:"chronology",language:"de",processing:"courtos_server_germany",model:"gemma",rows:[row("r1","Zahlung behauptet.",source("5. September 2026",1),"2026-09-05","exact_day"),row("r2","Entwurf beigefügt.",source("7. September 2026",2),"2026-09-07","exact_day"),row("r3","Weitere Zahlung unklar.",source("etwa September 2026",3),null,"ambiguous")],coverage:{selection:[{...input.sources[0],version_number:2,filename:doc.filename,pages:[1,2,3]}],extracted_text_bytes:1000,complete_selected_text:true,all_claims_extracted:false,more_claims_reported:true,external_legal_research_performed:false},notices:[]}};
        api.start.mockResolvedValue(result);renderApp();fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        await screen.findByText("Datum unklar oder nicht angegeben");
        const table=screen.getByRole("table");expect(table.textContent!.indexOf("5. September 2026")).toBeLessThan(table.textContent!.indexOf("7. September 2026"));
        expect(table.textContent!.indexOf("Datum unklar oder nicht angegeben")).toBeLessThan(table.textContent!.indexOf("etwa September 2026"));
        await act(async()=>{setCourtOSLocale("owner","fr");});
        expect(screen.getByText("Date incertaine ou non indiquée")).toBeVisible();expect(screen.getByText("etwa September 2026")).toBeVisible();
        fireEvent.click(screen.getAllByRole("button",{name:/Ouvrir le passage original: Eingabe.pdf, Page 2/i})[0]);
        expect(screen.getByTestId("original-source")).toHaveAttribute("data-version",doc.current_version_id);expect(screen.getByTestId("original-source")).toHaveAttribute("data-page","2");
        expect(api.start).toHaveBeenCalledOnce();
    });

});
