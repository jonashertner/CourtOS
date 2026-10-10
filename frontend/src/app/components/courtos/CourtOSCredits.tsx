"use client";

import { COURTOS_SOURCE_URL } from "@/app/lib/courtos";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";

export function CourtOSCredits() {
    const { t } = useCourtOSLocale();
    return (
        <p className="text-xs leading-relaxed text-muted-foreground">
            <a className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring" href={COURTOS_SOURCE_URL} target="_blank" rel="noopener noreferrer">{t(m.github)}</a>
        </p>
    );
}
