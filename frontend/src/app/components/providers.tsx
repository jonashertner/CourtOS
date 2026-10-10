"use client";

import { Suspense } from "react";
import { AuthProvider, useAuth } from "@/app/contexts/AuthContext";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { UserProfileProvider } from "@/app/contexts/UserProfileContext";
import { MfaLoginGate } from "@/app/components/shared/MfaLoginGate";
import { FullScreenLoader } from "@/app/components/shared/FullScreenLoader";
import { OnboardingGate } from "@/app/components/auth/OnboardingGate";
import { useInputModality } from "@/app/hooks/useInputModality";
import { AppToasts } from "@/app/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
    useInputModality();
    return (
        <AuthProvider>
            <LanguageForCurrentAccount>
            <UserProfileProvider>
                <Suspense fallback={<FullScreenLoader />}>
                    <MfaLoginGate>
                        <OnboardingGate>{children}</OnboardingGate>
                    </MfaLoginGate>
                </Suspense>
                <AppToasts />
            </UserProfileProvider>
            </LanguageForCurrentAccount>
        </AuthProvider>
    );
}

function LanguageForCurrentAccount({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    return <CourtOSLocaleProvider ownerId={user?.id ?? null}>{children}</CourtOSLocaleProvider>;
}
