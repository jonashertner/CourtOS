"use client";

import { useId } from "react";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { COURTOS_LOCALES, COURTOS_LANGUAGE_NAMES } from "@/app/lib/courtosLocale";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";
import styles from "./CourtOSLanguageSelect.module.css";

export function CourtOSLanguageSelect({ explain = false }: { explain?: boolean }) {
    const { locale, setLocale, t, storageAvailable } = useCourtOSLocale();
    const id = useId();
    return <div className="courtos-language-select space-y-2">
        <div className={styles.row}>
            <span className={styles.label}>{t(m.language)}</span>
            <div className={styles.choices} role="group" aria-label={t(m.interfaceLanguage)} aria-describedby={explain ? `${id}-scope` : undefined}>
                {COURTOS_LOCALES.map(value => <button key={value} type="button" lang={value} aria-label={COURTOS_LANGUAGE_NAMES[value]} title={COURTOS_LANGUAGE_NAMES[value]} aria-pressed={locale === value} onClick={() => setLocale(value)}>{value.toUpperCase()}</button>)}
            </div>
        </div>
        {explain && <p id={`${id}-scope`} className="courtos-settings-note">{t(m.languageScope)}</p>}
        {!storageAvailable && <p role="status" className="courtos-settings-notice">{t(m.languageTemporary)}</p>}
    </div>;
}
