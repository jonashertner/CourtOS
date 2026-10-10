"use client";

import { useId } from "react";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { COURTOS_LOCALES, COURTOS_LANGUAGE_NAMES, isCourtOSLocale } from "@/app/lib/courtosLocale";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";

export function CourtOSLanguageSelect({ explain = false }: { explain?: boolean }) {
    const { locale, setLocale, t, storageAvailable } = useCourtOSLocale();
    const id = useId();
    return <div className="courtos-language-select space-y-2">
        <label className="flex items-center justify-between gap-4 text-sm" htmlFor={id}>
            <span>{t(m.language)}</span>
            <select id={id} aria-label={t(m.interfaceLanguage)} className="min-h-10 rounded border border-border bg-app-background px-3 text-foreground" value={locale}
                aria-describedby={explain ? `${id}-scope` : undefined}
                onChange={event => { if (isCourtOSLocale(event.target.value)) setLocale(event.target.value); }}>
                {COURTOS_LOCALES.map(value => <option key={value} value={value} lang={value}>{COURTOS_LANGUAGE_NAMES[value]}</option>)}
            </select>
        </label>
        {explain && <p id={`${id}-scope`} className="courtos-settings-note">{t(m.languageScope)}</p>}
        {!storageAvailable && <p role="status" className="courtos-settings-notice">{t(m.languageTemporary)}</p>}
    </div>;
}
