"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { AuthApiError, loginWithCloudflare } from "@/app/lib/authApi";
import { safeCourtOSResearchNext } from "@/app/lib/authRedirects";
import { COURTOS_HOME, COURTOS_PILOT_MODE, COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";
import { SiteLogo } from "@/app/components/site-logo";
import { PilotUsageNotice } from "./PilotUsageNotice";
import { CourtOSCredits } from "./CourtOSCredits";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { authGlassCardUIClassName } from "@/shared/ui/AuthStylesUI";
import { cn } from "@/app/lib/utils";
import { CourtOSLanguageSelect } from "./CourtOSLanguageSelect";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";
import type { CourtOSText } from "@/app/lib/courtosLocale";

function accessError(error: unknown): CourtOSText {
    if (error instanceof AuthApiError) {
        if (error.status === 401 || error.status === 403) {
            return COURTOS_SELF_REGISTRATION
                ? m.accessDeniedPublic
                : m.accessDeniedClosed;
        }
        if (error.status === 429) {
            return m.accessRateLimit;
        }
    }
    return m.accessUnavailable;
}

export function CourtOSAccessGate() {
    const { t } = useCourtOSLocale();
    const router = useRouter();
    const returnPath = safeCourtOSResearchNext(useSearchParams().get("next"), COURTOS_HOME);
    const { isAuthenticated, authLoading, refreshSession } = useAuth();
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState<CourtOSText | null>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated) router.replace(returnPath);
    }, [authLoading, isAuthenticated, returnPath, router]);

    const openWorkspace = async () => {
        if (opening) return;
        setOpening(true);
        setError(null);
        try {
            // No email, token or other client-supplied identity crosses this seam.
            // The backend validates the Access assertion and sets its own session.
            await loginWithCloudflare();
            const session = await refreshSession();
            if (!session) throw new Error("Session was not established");
            router.replace(returnPath);
        } catch (caught) {
            setError(accessError(caught));
            setOpening(false);
        }
    };

    return (
        <main className="flex min-h-dvh items-center justify-center bg-app-background px-6 py-12">
            <div className="w-full max-w-lg">
                <SiteLogo size="lg" className="mb-10" />
                <div className={cn(authGlassCardUIClassName, "courtos-access-panel space-y-6")}>
                    <CourtOSLanguageSelect />
                    <div>
                        <h1 className="courtos-section-title text-foreground">{t(m.openResearch)}</h1>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {t(m.accessConfirmed)}
                            {COURTOS_SELF_REGISTRATION && ` ${t(m.createOnOpen)}`}
                        </p>
                    </div>
                    {COURTOS_PILOT_MODE && (
                        <p className="text-sm leading-relaxed text-foreground">
                            {t(m.pilotNoConfidential)}
                        </p>
                    )}
                    {COURTOS_SELF_REGISTRATION && (
                        <details className="text-sm text-muted-foreground">
                            <summary className="cursor-pointer py-2 focus-visible:outline-2 focus-visible:outline-ring">{t(m.usageLimits)}</summary>
                            <div className="pt-2"><PilotUsageNotice /></div>
                        </details>
                    )}
                    <PillButtonUI type="button" tone="black" size="normal" className="courtos-button min-h-11 w-full" disabled={opening || authLoading || isAuthenticated} onClick={() => void openWorkspace()}>
                        {opening || authLoading || isAuthenticated ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t(m.accessChecking)}</> : <>{t(m.openCourtOS)} <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                    </PillButtonUI>
                    {error && (
                        <div role="alert" className="space-y-3 text-sm leading-relaxed text-destructive">
                            <p>{t(error)}</p>
                            <a href="/cdn-cgi/access/logout" className="inline-block underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">{t(m.signInAgain)}</a>
                        </div>
                    )}
                </div>
                <div className="mt-8"><CourtOSCredits /></div>
            </div>
        </main>
    );
}
