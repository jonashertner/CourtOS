import type { PublicDecisionCitation } from "@/app/components/shared/types";

/** Navigation only: a URL does not establish a page or verify a proposition. */
export function safePublicCitationUrl(value: string | null | undefined): string | null {
    if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
            ? url.href : null;
    } catch { return null; }
}

export function publicCitationOriginalUrl(citation: PublicDecisionCitation): string | null {
    return safePublicCitationUrl(citation.source_url) ?? safePublicCitationUrl(citation.pdf_url);
}

/** Legacy chat views have no public corpus viewer. Never resolve this as a private file. */
export function openPublicCitationOriginal(citation: PublicDecisionCitation): boolean {
    const url = publicCitationOriginalUrl(citation);
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
}
