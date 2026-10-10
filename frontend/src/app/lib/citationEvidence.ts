import type { Citation } from "@/app/components/shared/types";

const SHA256 = /^[a-f0-9]{64}$/i;

/** Verifies source-location evidence, not the truth of a generated proposition. */
export function hasCheckedCitationLocation(citation: Citation): boolean {
    if (citation.verified !== true) return false;
    if (citation.kind === "case") return true;
    if (citation.kind === "public_decision") {
        // A public location is a live corpus excerpt, not a private PDF version.
        // Upstream may omit a fingerprint; never manufacture one from the quote.
        return typeof citation.decision_id === "string" && citation.decision_id.trim().length > 0 &&
            !/[\u0000-\u001f\u007f]/.test(citation.decision_id) &&
            Number.isSafeInteger(citation.start) && citation.start >= 0 &&
            Number.isSafeInteger(citation.end) && citation.end > citation.start &&
            typeof citation.quote === "string" && citation.quote.trim().length > 0 &&
            !/[\uD800-\uDFFF]/u.test(citation.quote) &&
            Array.from(citation.quote).length === citation.end - citation.start &&
            (citation.content_hash === null || (typeof citation.content_hash === "string" &&
                citation.content_hash.length > 0 && citation.content_hash.length <= 200 &&
                !/[\u0000-\u001f\u007f]/.test(citation.content_hash)));
    }
    if (!citation.version_id || !citation.quotes?.length) return false;
    return citation.quotes.every(quote => {
        const verification = quote.verification;
        if (verification?.verified !== true || verification.version_id !== citation.version_id ||
            !SHA256.test(verification.pdf_sha256 ?? "")) return false;
        const range = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(String(quote.page));
        if (!range) return false;
        const first = Number(range[1]);
        const last = Number(range[2] ?? range[1]);
        if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first || last - first > 2) return false;
        const hashes = verification.page_hashes;
        if (!hashes || hashes.length !== last - first + 1) return false;
        return hashes.every((entry, index) => entry.page === first + index && SHA256.test(entry.sha256));
    });
}
