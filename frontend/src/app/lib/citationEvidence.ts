import type { Citation } from "@/app/components/shared/types";

const SHA256 = /^[a-f0-9]{64}$/i;

/** Verifies source-location evidence, not the truth of a generated proposition. */
export function hasCheckedCitationLocation(citation: Citation): boolean {
    if (citation.verified !== true) return false;
    if (citation.kind === "case") return true;
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
