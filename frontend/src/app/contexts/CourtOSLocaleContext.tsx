"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { adoptSignInLanguage, COURTOS_LANGUAGE_TAGS, courtOSLocaleSnapshot, formatCourtOSText, refreshCourtOSLanguageHint, setCourtOSLocale, subscribeCourtOSLocale, type CourtOSLocale, type CourtOSText } from "@/app/lib/courtosLocale";

type LocaleContext = {
    locale: CourtOSLocale;
    setLocale(locale: CourtOSLocale): boolean;
    t(message: CourtOSText, values?: Readonly<Record<string, string | number>>): string;
    storageAvailable: boolean;
};
const Context = createContext<LocaleContext>({ locale: "de", setLocale: () => false, t: (message, values) => formatCourtOSText("de", message, values), storageAvailable: true });
export const useCourtOSLocale = () => useContext(Context);

/** Preference is account-bound in this browser/Word runtime, not a server profile.
 * No locale route rewrite: existing auth returns and immutable source URLs survive. */
export function CourtOSLocaleProvider({ ownerId, children }: { ownerId: string | null; children: ReactNode }) {
    const subscribe = useCallback((changed: () => void) => subscribeCourtOSLocale(ownerId, changed), [ownerId]);
    const getSnapshot = useCallback(() => courtOSLocaleSnapshot(ownerId), [ownerId]);
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "de:hint");
    const locale = snapshot.split(":")[0] as CourtOSLocale;
    const setLocale = useCallback((value: CourtOSLocale) => setCourtOSLocale(ownerId, value), [ownerId]);
    const t = useCallback((message: CourtOSText, values?: Readonly<Record<string, string | number>>) => formatCourtOSText(locale, message, values), [locale]);
    useEffect(() => { if (ownerId) adoptSignInLanguage(ownerId); }, [ownerId]);
    useEffect(() => {
        document.documentElement.lang = COURTOS_LANGUAGE_TAGS[locale];
    }, [locale]);
    useEffect(() => {
        // Do not initialise Office or wait for it. If the host is already present,
        // its readiness can improve the hint without overriding an explicit choice.
        const office = (window as unknown as { Office?: { onReady?: () => Promise<unknown> } }).Office;
        try { void office?.onReady?.().then(refreshCourtOSLanguageHint).catch(() => undefined); } catch { /* optional host */ }
    }, []);
    const value = useMemo(() => ({ locale, setLocale, t, storageAvailable: !snapshot.endsWith(":temporary") }), [locale, setLocale, t, snapshot]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}
