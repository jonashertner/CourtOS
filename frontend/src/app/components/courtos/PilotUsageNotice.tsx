"use client";

import { COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";

/** These public-pilot values must stay aligned with the server's admission limits. */
export function PilotUsageNotice() {
    const { t } = useCourtOSLocale();
    if (!COURTOS_SELF_REGISTRATION) return null;
    return (
        <aside aria-label={t(m.pilotUsage)} className="courtos-usage space-y-2 text-muted-foreground">
            <p><strong className="font-semibold text-foreground">{t(m.limitedAccess)}</strong> {t(m.modelAllowance)}</p>
            <p>{t(m.uploadAllowance)}</p>
        </aside>
    );
}
