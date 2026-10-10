import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicDecisionCitation } from "../../shared/types";
import { displayCitationQuote, formatCitationPage, panelDocumentFromCitation } from "../../shared/types";
import { hasCheckedCitationLocation } from "@/app/lib/citationEvidence";
import { openPublicCitationOriginal, publicCitationOriginalUrl, safePublicCitationUrl } from "@/app/lib/publicCitationLinks";
import { buildCitationAppendix, citationTooltip, CitationsBlock } from "./CitationSources";

const quote = "Der Wortlaut 🧭 bleibt unverändert.";
const citation: PublicDecisionCitation = {
    type: "citation_data", kind: "public_decision", ref: 1,
    decision_id: "bge_BGE_137_I_195", title: "BGE 137 I 195",
    source_url: "https://www.bger.ch/decision?id=137&part=2#E2",
    pdf_url: "https://www.bger.ch/decision.pdf", content_hash: null,
    start: 410, end: 410 + Array.from(quote).length, quote, verified: true,
};
afterEach(() => vi.restoreAllMocks());

describe("public decision citation locations", () => {
    it("accepts live Unicode code-point positions without inventing a fixed version", () => {
        expect(hasCheckedCitationLocation(citation)).toBe(true);
        expect(hasCheckedCitationLocation({...citation, content_hash: "upstream-fingerprint-1"})).toBe(true);
        expect(displayCitationQuote(citation)).toBe(quote);
        expect(formatCitationPage(citation)).toContain(`Unicode [410, ${citation.end})`);
        expect(formatCitationPage(citation)).not.toMatch(/Page|Seite|Version/);
        expect(citationTooltip(citation)).toContain("keinen Fingerabdruck");
        expect(citationTooltip(citation)).toContain("rechtliche Aussage ist damit nicht bestätigt");
    });
    it.each([
        {verified: false}, {start: -1}, {end: 410}, {end: citation.end + 1},
        {start: 410.5}, {end: Number.MAX_SAFE_INTEGER + 1}, {decision_id: ""},
        {decision_id: "bad\nID"}, {quote:"A sufficiently long prefix \ud83e",end:410+28}, {content_hash: ""}, {content_hash: "bad\nvalue"},
    ])("does not accept inconsistent location metadata %j", change => {
        expect(hasCheckedCitationLocation({...citation,...change})).toBe(false);
    });
    it("cannot convert a public decision to a personal document", () => {
        expect(() => panelDocumentFromCitation(citation)).toThrow("public source viewer");
    });
    it("routes source and pinpoint buttons through the supplied public callback", () => {
        const open = vi.fn(), pinpoint = vi.fn();
        render(<CitationsBlock citations={[citation]} onOpenSource={open} onCitationClick={pinpoint}/>);
        fireEvent.click(screen.getByRole("button",{name:"BGE 137 I 195"}));
        fireEvent.click(screen.getByRole("button",{name:"Citation 1"}));
        expect(open).toHaveBeenCalledWith(citation);
        expect(pinpoint).toHaveBeenCalledWith(citation);
        expect(screen.getByText(/keine amtliche Seiten- oder Randnummer/)).toBeVisible();
    });
    it("marks invalid public offset evidence as unconfirmed even when verified is set", () => {
        render(<CitationsBlock citations={[{...citation,end:citation.end+1}]}/>);
        expect(screen.getByRole("button",{name:"Citation 1. Zitat nicht bestätigt"})).toBeVisible();
    });
});

describe("safe public citation originals and copy", () => {
    it.each(["javascript:alert(1)","data:text/html,<b>bad</b>","//example.com/a","https://user:pass@example.com/a","https://exam\nple.com/a"," https://example.com/a","http://example.com/has space"])('rejects %s', value => {
        expect(safePublicCitationUrl(value)).toBeNull();
    });
    it("opens only a safe official original once, without private navigation", () => {
        const open = vi.spyOn(window,"open").mockReturnValue(null);
        expect(openPublicCitationOriginal(citation)).toBe(true);
        expect(open).toHaveBeenCalledExactlyOnceWith(citation.source_url,"_blank","noopener,noreferrer");
        expect(openPublicCitationOriginal({...citation,source_url:"javascript:bad",pdf_url:null})).toBe(false);
        expect(open).toHaveBeenCalledTimes(1);
        expect(publicCitationOriginalUrl({...citation,source_url:null})).toBe(citation.pdf_url);
    });
    it("copies escaped exact wording, corpus offsets and real originals, without fake page links", () => {
        const unsafeQuote = '<script>alert("x")</script> 🧭';
        const copy = buildCitationAppendix([{...citation,title:'<img src=x onerror=bad>',quote:unsafeQuote,end:citation.start+Array.from(unsafeQuote).length}],"https://sandbox.swisslaw.io");
        expect(copy.text).toContain(unsafeQuote);
        expect(copy.text).toContain(citation.decision_id);
        expect(copy.text).toContain("Ende ausgeschlossen");
        expect(copy.text).toContain("keinen Fingerabdruck");
        expect(copy.html).not.toContain("<script>");
        expect(copy.html).not.toContain("<img");
        expect(copy.html).toContain("&lt;script&gt;");
        expect(copy.html).toContain("id=137&amp;part=2#E2");
        expect(copy.html).not.toContain("/sources/library/");
        expect(copy.text).not.toContain("PDF-Seite");
        expect(copy.text).not.toContain("Fassung nicht angegeben");
    });
    it("omits unsafe original URLs from the export and preserves safe PDF fallback", () => {
        const copy=buildCitationAppendix([{...citation,source_url:"javascript:alert(1)"}],undefined,"en");
        expect(copy.html).not.toContain("javascript:");
        expect(copy.text).toContain(`Original PDF: ${citation.pdf_url}`);
        expect(copy.text).toContain("not official page or paragraph numbers");
    });
    it("preserves explicit public source text rather than replacing private page delimiters", () => {
        const exact="  A [[PAGE_BREAK]] B  ";
        expect(displayCitationQuote({...citation,quote:exact,end:410+exact.length})).toBe(exact);
        expect(buildCitationAppendix([{...citation,quote:exact,end:410+exact.length}]).text).toContain(`"${exact}"`);
    });
});
