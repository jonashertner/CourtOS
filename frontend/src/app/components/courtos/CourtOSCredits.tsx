import { COURTOS_SOURCE_URL, COURTOS_UPSTREAM_URL } from "@/app/lib/courtos";

export function CourtOSCredits() {
    return (
        <p className="text-xs leading-relaxed text-muted-foreground">
            CourtOS baut auf{" "}
            <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={COURTOS_UPSTREAM_URL} target="_blank" rel="noopener noreferrer">MikeOSS</a>
            {" "}auf. Freie Software unter AGPL-3.0 ·{" "}
            <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={COURTOS_SOURCE_URL} target="_blank" rel="noopener noreferrer">Quellcode und Lizenz</a>
        </p>
    );
}
