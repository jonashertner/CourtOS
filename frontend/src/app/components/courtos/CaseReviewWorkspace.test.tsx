import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseReviewInput, CaseReviewRecord, CaseReviewSource, CaseReviewRow, CitationCheckReport } from "@mike/contracts";
import { CaseReviewWorkspace } from "./CaseReviewWorkspace";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { EXAMPLE_MATTERS } from "@/app/lib/exampleMatters";
import { CaseReviewError } from "@/app/lib/caseReviewApi";
const api=vi.hoisted(()=>({list:vi.fn(),folder:vi.fn(),path:vi.fn(),document:vi.fn(),start:vi.fn(),get:vi.fn(),stop:vi.fn(),importExample:vi.fn(),citationCheck:vi.fn(),owner:"owner"}));
vi.mock("@/app/contexts/AuthContext",()=>({useAuth:()=>({user:{id:api.owner}})}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/app/lib/mikeApi",()=>({searchLibraryDocuments:api.list,getLibrary:api.list,getLibraryFolderChildren:api.folder,getLibraryFolderPath:api.path,getDocument:api.document}));
vi.mock("@/app/lib/importExampleMatter",async original=>({...await original<typeof import("@/app/lib/importExampleMatter")>(),importExampleMatter:api.importExample}));
vi.mock("@/app/lib/citationCheckApi",async original=>({...await original<typeof import("@/app/lib/citationCheckApi")>(),checkCitations:api.citationCheck}));
vi.mock("@/app/lib/caseReviewApi",async original=>({...await original<typeof import("@/app/lib/caseReviewApi")>(),startCaseReview:api.start,getCaseReview:api.get,stopCaseReview:api.stop}));
vi.mock("./KnowledgeWorkspace",()=>({LocalSource:({result}:{result:{quote:string;version_id:string;page:number}})=><div data-testid="original-source" data-version={result.version_id} data-page={result.page}>{result.quote}</div>}));
const doc={id:"22222222-2222-4222-8222-222222222222",current_version_id:"33333333-3333-4333-8333-333333333333",active_version_number:2,filename:"Eingabe.pdf",file_type:"pdf",status:"ready"};
const pending=(input:CaseReviewInput):CaseReviewRecord=>({id:input.request_id,input,status:"analysing",created_at:"2026-10-10T12:00:00Z",report:null,error:null});
const renderApp=()=>render(<CourtOSLocaleProvider ownerId={api.owner}><CaseReviewWorkspace/></CourtOSLocaleProvider>);
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();localStorage.clear();api.owner="owner";api.document.mockRejectedValue(new Error("unavailable"));api.path.mockRejectedValue(new Error("unavailable"));setCourtOSLocale("owner","de");api.list.mockResolvedValue({documents:[doc,{...doc,id:"other",filename:"Antwort.docx",file_type:"docx"}],documentsHasMore:false});api.start.mockImplementation(async input=>pending(input));api.get.mockImplementation(async()=>new Promise(()=>{}));});
describe("submission review work flow",()=>{
    it("checks only selected versions without AI, locks the selection while running and clears results when the selection changes",async()=>{
        let resolve!:(value:CitationCheckReport)=>void;api.citationCheck.mockReturnValue(new Promise(done=>{resolve=done;}));
        renderApp();fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));
        expect(api.citationCheck).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Zitierangaben prüfen"}));
        expect(api.citationCheck).toHaveBeenCalledExactlyOnceWith({sources:[{document_id:doc.id,version_id:doc.current_version_id}]},expect.any(AbortSignal));
        expect(screen.getByRole("checkbox",{name:/Eingabe.pdf/})).toBeDisabled();expect(screen.getByRole("button",{name:"Teilanalyse starten"})).toBeDisabled();
        await act(async()=>resolve({version:1,checked_at:"2026-10-10T16:00:00Z",engine:{name:"citecheck",commit:"e".repeat(40)},index:{generated:"2026-10-10",sha256:"a".repeat(64),decisions:100,labels:120,with_numbering:80},coverage:{documents:1,pages:2,extracted_text_bytes:400,complete_selected_extracted_text:true,all_citation_forms_recognised:false,images_checked:false,multiple_pinpoints:"all"},counts:{found:0,differs:0,missing:0,unchecked:0},semantic_support:"not_assessed",findings:[]}));
        expect(await screen.findByText(/Keine vom Prüfer erkannten/)).toBeVisible();expect(api.start).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("checkbox",{name:/Eingabe.pdf/}));
        expect(screen.queryByText(/Keine vom Prüfer erkannten/)).toBeNull();expect(screen.getByRole("button",{name:"Zitierangaben prüfen"})).toBeDisabled();
        expect(document.getElementById("citation-check")).not.toBeNull();
    });
    it("browses case, party and document folders, keeps chosen versions across browsing, and identifies mixed roots",async()=>{
        const root={id:"case-a",name:"2026-001",parent_folder_id:null};
        const other={id:"case-b",name:"2026-002",parent_folder_id:null};
        const party={id:"party-a",name:"A.________ AG · Klägerin",parent_folder_id:root.id};
        const submissions={id:"submissions",name:"Eingaben",parent_folder_id:party.id};
        const otherDoc={...doc,id:"44444444-4444-4444-8444-444444444444",current_version_id:"55555555-5555-4555-8555-555555555555"};
        api.path.mockImplementation(async (_kind:string,id:string)=>({folders:id===submissions.id?[root,party,submissions]:id===party.id?[root,party]:id===root.id?[root]:[other]}));
        api.list.mockResolvedValue({documents:[],folders:[root,other],documentsHasMore:false});
        api.folder.mockImplementation(async(_kind:string,id:string)=>id===root.id?{documents:[],folders:[party],documentsHasMore:false}:id===party.id?{documents:[],folders:[submissions],documentsHasMore:false}:id===submissions.id?{documents:[doc],folders:[],documentsHasMore:false}:{documents:[otherDoc],folders:[],documentsHasMore:false});
        renderApp();
        fireEvent.click(await screen.findByRole("button",{name:root.name}));
        fireEvent.click(await screen.findByRole("button",{name:party.name}));
        fireEvent.click(await screen.findByRole("button",{name:submissions.name}));
        fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));
        fireEvent.change(screen.getByLabelText("Dokumentrolle"),{target:{value:"claim"}});
        fireEvent.change(screen.getByLabelText("Partei / Urheber"),{target:{value:"A.________ AG"}});
        await screen.findAllByText("2026-001 / A.________ AG · Klägerin / Eingaben");
        fireEvent.click(screen.getByRole("button",{name:"Alle Akten"}));
        fireEvent.click(await screen.findByRole("button",{name:other.name}));
        fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));
        expect(await screen.findByText("Auswahl aus mehreren Hauptordnern: 2026-001; 2026-002.")).toBeVisible();
        expect(screen.getAllByLabelText("Dokumentrolle")[0]).toHaveValue("claim");
        expect(screen.getAllByLabelText("Partei / Urheber")[0]).toHaveValue("A.________ AG");
        expect(api.start).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        await screen.findByText("Entwurf wird erstellt");
        expect(api.start.mock.calls[0][0].sources).toEqual([{document_id:doc.id,version_id:doc.current_version_id,role:"claim",party_label:"A.________ AG"},{document_id:otherDoc.id,version_id:otherDoc.current_version_id,role:"other",party_label:null}]);
    });
    it("discards late folder responses after returning to the root",async()=>{
        const folder={id:"case-a",name:"2026-001",parent_folder_id:null};
        api.list.mockResolvedValue({documents:[],folders:[folder],documentsHasMore:false});
        let resolve!:(value:unknown)=>void;api.folder.mockReturnValue(new Promise(done=>{resolve=done;}));
        renderApp();fireEvent.click(await screen.findByRole("button",{name:folder.name}));
        await waitFor(()=>expect(api.folder).toHaveBeenCalledWith("files",folder.id,{limit:20,offset:0}));
        fireEvent.click(screen.getByRole("button",{name:"Alle Akten"}));
        await screen.findByRole("button",{name:folder.name});
        await act(async()=>resolve({documents:[doc],folders:[],documentsHasMore:false}));
        expect(screen.queryByRole("checkbox",{name:/Eingabe.pdf/})).toBeNull();
        expect(api.start).not.toHaveBeenCalled();
    });
    it.each([["de","Alle Akten","Zur Ordneransicht"],["fr","Tous les dossiers","Revenir aux dossiers"],["it","Tutti i fascicoli","Torna alle cartelle"],["en","All matters","Back to folders"]] as const)("%s: returns from whole-library filename search to the current folder without losing selection",async(locale,rootLabel,backLabel)=>{
        setCourtOSLocale("owner",locale);
        const folder={id:"case-a",name:"2026-001",parent_folder_id:null};
        api.list.mockImplementation(async(_kind:string,options:{search?:string})=>options.search?{documents:[{...doc,library_folder_id:folder.id}],documentsHasMore:false}:{documents:[],folders:[folder],documentsHasMore:false});
        api.document.mockResolvedValue({...doc,library_folder_id:folder.id});api.path.mockResolvedValue({folders:[folder]});api.folder.mockResolvedValue({documents:[],folders:[],documentsHasMore:false});
        renderApp();expect(await screen.findByRole("button",{name:rootLabel})).toBeVisible();
        fireEvent.click(await screen.findByRole("button",{name:folder.name}));
        const input=screen.getByRole("textbox",{name:/Dateiname|Nom du fichier|Nome del file|File ?name/i});
        fireEvent.change(input,{target:{value:"Eingabe"}});fireEvent.submit(input.closest("form")!);
        fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));
        expect(api.list).toHaveBeenCalledWith("files",expect.objectContaining({search:"Eingabe",limit:20,offset:0}));
        await waitFor(()=>expect(screen.queryByText(/Ordnerpfad wird geladen|Chargement du chemin|Caricamento del percorso|Loading folder path/)).toBeNull());
        fireEvent.click(screen.getByRole("button",{name:backLabel}));
        await waitFor(()=>expect(screen.queryByRole("checkbox",{name:/Eingabe.pdf/})).toBeNull());
        expect(screen.getByText("Eingabe.pdf")).toBeVisible();
        expect(screen.getByRole("navigation")).toHaveTextContent(folder.name);
        expect(api.start).not.toHaveBeenCalled();
    });
    it.each([
        ["de","Das Modell hat keinen verwendbaren Prüfbericht erstellt. Es wurde kein Entwurf freigegeben. Ihre Quellen bleiben unverändert."],
        ["fr","Le modèle n’a pas produit de rapport d’examen utilisable. Aucun projet n’a été publié. Vos sources restent inchangées."],
        ["it","Il modello non ha prodotto un rapporto di esame utilizzabile. Nessuna bozza è stata rilasciata. Le vostre fonti restano invariate."],
        ["en","The model did not produce a usable review report. No draft was released. Your sources remain unchanged."],
    ] as const)("%s: explains unusable output separately from a source mismatch",async(locale,message)=>{
        setCourtOSLocale("owner",locale);
        const input:CaseReviewInput={request_id:"11111111-1111-4111-8111-111111111111",kind:"facts",language:"de",sources:[{document_id:doc.id,version_id:doc.current_version_id,role:"claim",party_label:null}]};
        sessionStorage.setItem("courtos:review-reference:v1:owner",JSON.stringify({owner:"owner",id:input.request_id}));
        api.get.mockResolvedValue({...pending(input),status:"failed",error:{code:"review_invalid_output",detail:"private provider detail"}});
        renderApp();expect(await screen.findByRole("alert")).toHaveTextContent(message);
        expect(screen.queryByText("private provider detail")).toBeNull();
        expect(screen.queryByRole("table")).toBeNull();
        expect(api.start).not.toHaveBeenCalled();expect(api.stop).not.toHaveBeenCalled();
    });
    it("imports an optional matter into an empty selection, preserves ready versions and never starts analysis automatically",async()=>{
        let resolve!:(value:unknown)=>void;api.importExample.mockReturnValue(new Promise(r=>{resolve=r;}));
        const sources=(["claim","response","exhibit","exhibit"] as const).map((role,index)=>({document:{...doc,id:`example-${index}`,current_version_id:`version-${index}`,filename:`Example${index}.pdf`},role,party:index===0?"Creditore":index===1?"Debitrice":""}));
        renderApp();await screen.findByRole("checkbox",{name:/Eingabe.pdf/});fireEvent.click(screen.getByText("Beispieldossiers"));
        fireEvent.click(screen.getByRole("button",{name:`Vier PDFs übernehmen · ${EXAMPLE_MATTERS.find(matter=>matter.id==="IT-01")!.caseNumber}`}));
        expect(screen.getByRole("checkbox",{name:/Eingabe.pdf/})).toBeDisabled();
        await act(async()=>resolve({sources,folderId:"case-it",reusedCount:0,previousEditionCount:0}));
        expect(screen.getAllByLabelText("Dokumentrolle").map(element=>(element as HTMLSelectElement).value)).toEqual(["claim","response","exhibit","exhibit"]);
        expect(screen.getByLabelText("Sprache des Entwurfs")).toHaveValue("it");expect(api.start).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));await screen.findByText("Entwurf wird erstellt");
        expect(api.start.mock.calls[0][0].sources.map((source:{version_id:string})=>source.version_id)).toEqual(["version-0","version-1","version-2","version-3"]);
    });
    it("requires explicit original-PDF selection and sends roles, party label and exact version only on start",async()=>{
        renderApp();expect(api.start).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Teilanalyse starten"})).toBeDisabled();
        expect(await screen.findByRole("checkbox",{name:/Antwort.docx/})).toBeDisabled();
        fireEvent.click(screen.getByRole("checkbox",{name:/Eingabe.pdf/}));
        expect(screen.getByRole("checkbox",{name:/Eingabe.pdf/}).closest("details")).toHaveAttribute("open");
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
        expect(screen.getByRole("link",{name:"Guide"})).toHaveAttribute("href","/guide/en.html#work");
        fireEvent.change(screen.getByLabelText("Draft language"),{target:{value:"fr"}});
        await act(async()=>{setCourtOSLocale("owner","it");});
        expect(screen.getByRole("heading",{name:"Esaminare gli atti"})).toBeVisible();expect(screen.getByLabelText("Lingua della bozza")).toHaveValue("fr");expect(api.start).not.toHaveBeenCalled();
        expect(screen.getByRole("link",{name:"Guida"})).toHaveAttribute("href","/guide/it.html#work");
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
    it("uses the side-by-side comparison for a completed factual report and does not treat no rows as a clean review",async()=>{
        api.start.mockImplementation(async(input:CaseReviewInput)=>({...pending(input),status:"completed",report:{version:1,kind:"facts",language:"de",processing:"courtos_server_germany",model:"gemma",rows:[],coverage:{selection:[],extracted_text_bytes:100,complete_selected_text:true,all_claims_extracted:false,more_claims_reported:false,external_legal_research_performed:false},notices:[]}}));
        renderApp();fireEvent.click(await screen.findByRole("checkbox",{name:/Eingabe.pdf/}));fireEvent.click(screen.getByRole("button",{name:"Teilanalyse starten"}));
        await screen.findByRole("table",{name:"Aussagen und Gegenpositionen"});
        expect(screen.getByText(/Keine Zeilen freigegeben/)).toBeVisible();
        expect(screen.queryByText("Zeitlich geordnete Angaben")).toBeNull();
        expect(api.start).toHaveBeenCalledOnce();
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
