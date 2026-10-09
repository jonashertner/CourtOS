"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/app/contexts/AuthContext";
import { AuthApiError, loginWithCloudflare } from "@/app/lib/authApi";
import { COURTOS_HOME, COURTOS_KNOWLEDGE_ENABLED, COURTOS_PILOT_MODE, COURTOS_SELF_REGISTRATION } from "@/app/lib/courtos";
import { SiteLogo } from "@/app/components/site-logo";
import { PilotUsageNotice } from "./PilotUsageNotice";
import { CourtOSCredits } from "./CourtOSCredits";
import { PillButtonUI } from "@/shared/ui/PillButtonUI";
import { authGlassCardUIClassName } from "@/shared/ui/AuthStylesUI";
import { cn } from "@/app/lib/utils";

function accessError(error: unknown): string {
    if (error instanceof AuthApiError) {
        if (error.status === 401 || error.status === 403) {
            return COURTOS_SELF_REGISTRATION
                ? "Der Zugang konnte nicht bestätigt werden. Melden Sie sich erneut mit Ihrem E-Mail-Code an. Falls die Meldung bleibt, ist dieser Zugang derzeit nicht verfügbar."
                : "Der Zugang konnte nicht bestätigt werden. Melden Sie sich erneut mit Ihrer freigegebenen E-Mail-Adresse an.";
        }
        if (error.status === 429) {
            return "Es gab mehrere Anmeldeversuche. Warten Sie kurz und versuchen Sie es erneut.";
        }
    }
    return "CourtOS ist gerade nicht erreichbar oder die Sitzung konnte nicht eröffnet werden. Bitte versuchen Sie es erneut.";
}

export function CourtOSAccessGate() {
    const router = useRouter();
    const { isAuthenticated, authLoading, refreshSession } = useAuth();
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated) router.replace(COURTOS_HOME);
    }, [authLoading, isAuthenticated, router]);

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
            router.replace(COURTOS_HOME);
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
                    <div>
                        <p className="courtos-kicker mb-4">ARBEITSRAUM FÜR DIE RECHTSPRAXIS</p>
                        <h1 className="courtos-section-title text-foreground">Willkommen bei CourtOS.</h1>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            {COURTOS_SELF_REGISTRATION
                                ? "Ihr E-Mail-Code bestätigt Ihre Adresse. Beim ersten Öffnen wird Ihr persönliches CourtOS-Konto erstellt. Eine Einladung oder ein zusätzliches Passwort ist nicht nötig."
                                : "Ihr E-Mail-Code bestätigt den Zugang. Öffnen Sie jetzt Ihren persönlichen Arbeitsraum; ein zusätzliches Passwort ist nicht nötig."}
                        </p>
                    </div>
                    {COURTOS_PILOT_MODE && (
                        <p className="text-sm leading-relaxed text-foreground">
                            Testbetrieb mit synthetischen Fällen.{COURTOS_KNOWLEDGE_ENABLED && " Öffentliche oder rechtmässig nutzbare, nicht vertrauliche Literaturauszüge sind ebenfalls möglich."} Bitte keine echten Akten, Personendaten oder vertraulichen Texte eingeben. Die Verarbeitung findet auf einem gemieteten Server in Deutschland statt.
                        </p>
                    )}
                    <PilotUsageNotice />
                    <PillButtonUI type="button" tone="black" size="normal" className="courtos-button min-h-11 w-full" disabled={opening || authLoading || isAuthenticated} onClick={() => void openWorkspace()}>
                        {opening || authLoading || isAuthenticated ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Zugang wird geprüft…</> : <>CourtOS öffnen <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                    </PillButtonUI>
                    {error && (
                        <div role="alert" className="space-y-3 text-sm leading-relaxed text-destructive">
                            <p>{error}</p>
                            <a href="/cdn-cgi/access/logout" className="inline-block underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Mit E-Mail-Code neu anmelden</a>
                        </div>
                    )}
                </div>
                <div className="mt-8"><CourtOSCredits /></div>
            </div>
        </main>
    );
}
