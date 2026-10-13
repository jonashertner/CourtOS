import type { Citation, PanelDocument } from "@/app/components/shared/types";
import { hasCheckedCitationLocation } from "./citationEvidence";
import { librarySourceUrl } from "./sourceLinks";
import type { CourtOSLocale } from "./courtosLocale";
import { citationControlMessages as C } from "./citationControlMessages";

/** Copies the selected source quote without punctuation rewriting or inferred links. */
export function citationQuoteCopy(citation: Citation | undefined, document: PanelDocument | undefined, index: number, fallbackQuote: string, locator: string, origin: string, locale: CourtOSLocale): {text:string;complete:boolean} {
    const limited = {text:[`“${fallbackQuote}”`,locator,C.limited[locale]].filter(Boolean).join("\n"),complete:false};
    if (!citation || citation.kind === "case" || citation.kind === "public_decision" || !document || document.type !== "pdf" ||
        citation.document_id !== document.document_id || !citation.version_id || citation.version_id !== document.version_id) return limited;
    const quote = citation.quotes?.[index];
    const range = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(String(quote?.page));
    if (!quote || !quote.quote || document.quotes[index]?.quote !== quote.quote ||
        String(document.quotes[index]?.target.page) !== String(quote.page) || !hasCheckedCitationLocation({...citation, quotes:[quote]}) || !range) return limited;
    const first = Number(range[1]), last = Number(range[2] ?? range[1]);
    const links = Array.from({length:last-first+1},(_,offset)=>({page:first+offset,url:librarySourceUrl(origin,citation.document_id,citation.version_id!,first+offset)}));
    if (links.some(link=>!link.url)) return limited;
    return {complete:true,text:[`“${quote.quote}”`,`${citation.filename} · ${C.version[locale]} ${citation.version_number ?? citation.version_id} · ${C.pdfPage[locale]} ${quote.page}`,...links.map(link=>`${C.original[locale]} · ${C.pdfPage[locale]} ${link.page}: ${link.url}`)].join("\n")};
}
