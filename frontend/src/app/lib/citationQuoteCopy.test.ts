import { describe, expect, it } from "vitest";
import { panelDocumentFromCitation, type DocumentCitation } from "@/app/components/shared/types";
import { citationQuoteCopy } from "./citationQuoteCopy";

const id="11111111-1111-4111-8111-111111111111",version="22222222-2222-4222-8222-222222222222";
const text='A.________ nennt die Zahlung "Vorschuss" – nicht Darlehen.';
function citation():DocumentCitation {return {type:"citation_data",ref:1,doc_id:"doc",document_id:id,version_id:version,version_number:2,filename:"Klage.pdf",page:3,quote:text,verified:true,quotes:[{page:3,quote:text,verification:{verified:true,version_id:version,pdf_sha256:"a".repeat(64),page_hashes:[{page:3,sha256:"b".repeat(64)}]}}]};}
describe("citation pane copy provenance",()=>{
    it.each(["de","fr","it","en"] as const)("preserves exact quote punctuation, identity, version and owned page link (%s)",locale=>{
        const value=citation();const result=citationQuoteCopy(value,panelDocumentFromCitation(value),0,text,"", "https://sandbox.swisslaw.io",locale);
        expect(result.complete).toBe(true);expect(result.text).toContain(text);expect(result.text).toContain("Klage.pdf");expect(result.text).toContain(" 2 · ");
        expect(result.text).toContain(`/sources/library/${id}/${version}?page=3`);expect(result.text).not.toContain("'Vorschuss'");
    });
    it("does not construct a full reference for a mismatched document, version, quote, page or verification",()=>{
        const value=citation(),document=panelDocumentFromCitation(value);
        for (const changed of [{...document,document_id:"other"},{...document,version_id:"other"},{...document,quotes:[{...document.quotes[0],quote:"other"}]},{...document,quotes:[{...document.quotes[0],target:{page:4}}]}]) {
            const result=citationQuoteCopy(value,changed,0,text,"Seite 3","https://sandbox.swisslaw.io","de");
            expect(result.complete).toBe(false);expect(result.text).not.toContain("https:");expect(result.text).toContain("ohne vollständige Quellenangabe");
        }
        const unchecked={...value,verified:false};expect(citationQuoteCopy(unchecked,document,0,text,"","https://sandbox.swisslaw.io","de").complete).toBe(false);
    });
    it("copies each explicitly verified page of a short cross-page quote and rejects a forged origin",()=>{
        const value=citation();value.quotes![0]={...value.quotes![0],page:"3-4",verification:{...value.quotes![0].verification!,page_hashes:[{page:3,sha256:"b".repeat(64)},{page:4,sha256:"c".repeat(64)}]}};
        const document=panelDocumentFromCitation(value);
        const result=citationQuoteCopy(value,document,0,text,"","https://sandbox.swisslaw.io","de");
        expect(result.complete).toBe(true);expect(result.text).toContain("?page=3");expect(result.text).toContain("?page=4");
        expect(citationQuoteCopy(value,document,0,text,"","https://user:secret@example.org","de").complete).toBe(false);
    });
});
