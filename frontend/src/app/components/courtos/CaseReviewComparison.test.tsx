import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseReviewReport, CaseReviewSource } from "@mike/contracts";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { reviewComparisonMessages as C } from "@/app/lib/reviewComparisonMessages";
import { CaseReviewComparison } from "./CaseReviewComparison";

function source(id:string,quote:string):CaseReviewSource {
    return {passage_id:`p-${id}`,document_id:id,version_id:`v-${id}`,version_number:2,filename:"Eingabe.pdf",page:3,start:40,end:40+Array.from(quote).length,quote,pdf_sha256:"a".repeat(64),page_sha256:"b".repeat(64),source_match:"exact"};
}
const claim=source("claim","A.________ behauptet, am 5. September CHF 1250 bezahlt zu haben.");
const opposing=source("response","B.________ bestreitet, die behauptete Zahlung erhalten zu haben.");
const evidence=source("exhibit","Das Konto zeigt am 5. September eine Belastung von CHF 1250.");
function report():CaseReviewReport {
    return {version:1,kind:"facts",language:"de",processing:"courtos_server_germany",model:"gemma",notices:[],rows:[{id:"r1",category:"fact",proposition:claim,party_label:"A.________",source_role:"claim",posture:"allegation",date:null,date_sort:null,date_status:"undated",amounts:[],assessment:"inconclusive",reasoning:"Die Belastung nennt hier keinen Zahlungsempfänger.",evidence:[evidence],opposing_position:[opposing],cited_references:[],assessment_basis:"selected_sources_only",semantic_status:"ai_draft_requires_review"}],coverage:{selection:[{...claim,pages:[3],role:"claim",party_label:"A.________"},{...opposing,pages:[3],role:"response",party_label:"B.________"},{...evidence,pages:[3],role:"exhibit",party_label:null}],extracted_text_bytes:300,complete_selected_text:true,all_claims_extracted:false,more_claims_reported:false,external_legal_research_performed:false}};
}
beforeEach(()=>{localStorage.clear();setCourtOSLocale("comparison-owner","de");});
describe("claim-by-claim source comparison",()=>{
    it.each(["de","fr","it","en"] as const)("%s: shows attributed opposing passages beside the claim with exact original navigation",locale=>{
        setCourtOSLocale("comparison-owner",locale);const onOpen=vi.fn();
        render(<CourtOSLocaleProvider ownerId="comparison-owner"><CaseReviewComparison report={report()} onOpen={onOpen}/></CourtOSLocaleProvider>);
        const table=screen.getByRole("table",{name:C.title[locale]});
        const cells=within(table).getAllByRole("cell");expect(cells).toHaveLength(4);
        expect(cells[0]).toHaveTextContent("A.________");expect(cells[0]).toHaveTextContent(claim.quote);
        expect(cells[1]).toHaveTextContent("B.________");expect(cells[1]).toHaveTextContent(opposing.quote);
        expect(cells[2]).toHaveTextContent(evidence.quote);expect(cells[3]).toHaveTextContent("Die Belastung nennt hier keinen Zahlungsempfänger.");
        expect(screen.getByText(C.help[locale])).toBeVisible();
        fireEvent.click(within(cells[1]).getByRole("button"));expect(onOpen).toHaveBeenCalledExactlyOnceWith(opposing);
    });
    it("does not attribute a different version or invent an opposing party from a matching filename",()=>{
        const data=report();data.coverage.selection[1].version_id="different-version";
        render(<CaseReviewComparison report={data} onOpen={vi.fn()}/>);
        const opposite=screen.getAllByRole("cell")[1];
        expect(within(opposite).getByText(C.unassignedParty.de)).toBeVisible();
        expect(within(opposite).queryByText("B.________",{exact:true})).toBeNull();
        expect(opposite).toHaveTextContent(opposing.quote);
    });
    it("preserves separate model rows and describes missing opposition without treating a claim as undisputed",()=>{
        const data=report();data.rows[0].opposing_position=[];data.rows.push({...data.rows[0],id:"r2"});
        render(<CaseReviewComparison report={data} onOpen={vi.fn()}/>);
        expect(screen.getAllByRole("row")).toHaveLength(3);
        expect(screen.getAllByText(claim.quote)).toHaveLength(2);
        expect(screen.getAllByText(C.noOpposition.de)).toHaveLength(2);
        expect(screen.getByText(C.help.de)).toBeVisible();
    });
    it("keeps legal references separate from the model's legal support and leaves chronology to its date view",()=>{
        const data=report();data.kind="legal";data.rows[0]={...data.rows[0],category:"legal",posture:"legal_argument",cited_references:[source("reference","Die Partei beruft sich auf BGE 137 I 195 E. 2.")]};
        const {rerender}=render(<CaseReviewComparison report={data} onOpen={vi.fn()}/>);
        expect(screen.getByText("Angeführte Rechtsquellen")).toBeVisible();
        expect(screen.getByText("Die Partei beruft sich auf BGE 137 I 195 E. 2.")).toBeInTheDocument();
        rerender(<CaseReviewComparison report={{...data,kind:"chronology"}} onOpen={vi.fn()}/>);
        expect(screen.queryByRole("table")).toBeNull();
    });
});
