// @vitest-environment-options {"url":"https://sandbox.swisslaw.io/research"}
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
import { citationControlMessages as C } from "@/app/lib/citationControlMessages";
import { panelDocumentFromCitation, type DocumentCitation } from "../shared/types";
import { DocumentTitleRow } from "../shared/DocumentTitleRow";
import { CitationQuotesSection } from "./CitationQuotesSection";

vi.mock("@/app/lib/courtos",()=>({COURTOS_PILOT_MODE:true}));
const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222";
const quote='Die Partei bezeichnet den Betrag als "Vorschuss".';
const citation:DocumentCitation={type:"citation_data",ref:1,doc_id:"doc",document_id:id,version_id:version,version_number:2,filename:"Eingabe.pdf",page:3,quote,verified:true,quotes:[{page:3,quote,verification:{verified:true,version_id:version,pdf_sha256:"a".repeat(64),page_hashes:[{page:3,sha256:"b".repeat(64)}]}}]};
beforeEach(()=>{localStorage.clear();});afterEach(()=>vi.unstubAllGlobals());
describe("CourtOS citation controls",()=>{
    it.each(["de","fr","it","en"] as const)("uses %s controls and copies the exact source with durable original link",async(locale)=>{
        setCourtOSLocale("citation-owner",locale);const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal("navigator",{clipboard:{writeText}});
        const document=panelDocumentFromCitation(citation);
        render(<CourtOSLocaleProvider ownerId="citation-owner"><DocumentTitleRow document={document} compactActions isReloading={false}/><CitationQuotesSection document={document} citation={citation} citationRef={1} onClose={vi.fn()}/></CourtOSLocaleProvider>);
        expect(screen.getByLabelText(`${C.citation[locale]} 1`)).toBeVisible();
        expect(screen.getByText(`(${C.page[locale]} 3)`)).toBeVisible();
        expect(screen.getByRole("button",{name:C.view[locale]})).toBeEnabled();
        expect(screen.getByRole("button",{name:C.download[locale]})).toBeVisible();
        expect(screen.getByRole("button",{name:C.close[locale]})).toBeVisible();
        fireEvent.click(screen.getByRole("button",{name:C.cite[locale]}));
        await waitFor(()=>expect(writeText).toHaveBeenCalledOnce());
        expect(writeText.mock.calls[0][0]).toContain(quote);
        expect(writeText.mock.calls[0][0]).toContain(`/sources/library/${id}/${version}?page=3`);
        expect(screen.getByRole("button",{name:C.copied[locale]})).toBeVisible();
    });
    it("labels an incomplete reference as text-only and never guesses an original link",async()=>{
        const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal("navigator",{clipboard:{writeText}});
        render(<CitationQuotesSection document={panelDocumentFromCitation(citation)}/>);
        expect(screen.getByText(C.limited.de)).toBeVisible();
        fireEvent.click(screen.getByRole("button",{name:C.copyText.de}));
        await waitFor(()=>expect(writeText).toHaveBeenCalledOnce());
        expect(writeText.mock.calls[0][0]).toContain(quote);expect(writeText.mock.calls[0][0]).not.toContain("http");
    });
});
