"use client";

import { ProcessingLocation } from "@/app/components/courtos/ProcessingLocation";
import { CourtOSLanguageSelect } from "./CourtOSLanguageSelect";
import { useCourtOSLocale } from "@/app/contexts/CourtOSLocaleContext";
import { courtOSMessages as m } from "@/app/lib/courtosMessages";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { COURTOS_GUIDE_PATH, COURTOS_SOURCE_URL } from "@/app/lib/courtos";
import { useResearchModelPreference, type ResearchModel } from "@/app/lib/researchModelPreference";

export type ResearchSettingsProps = {
    open: boolean;
    onClose: () => void;
    userId?: string | null;
    email?: string | null;
    onSignOut: () => void | Promise<void>;
    signingOut?: boolean;
    signOutError?: string;
    externalAvailable?: boolean;
    modelsAvailable?: boolean;
};

export function ResearchSettings({
    open, onClose, userId, email, onSignOut,
    signingOut = false, signOutError = "", externalAvailable = true, modelsAvailable = true,
}: ResearchSettingsProps) {
    const { t, locale } = useCourtOSLocale();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const modelName = useId();
    const { model, setModel } = useResearchModelPreference(userId, externalAvailable);
    const [storageNotice, setStorageNotice] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog || !open) return;
        const previousFocus = document.activeElement;
        if (!dialog.open) dialog.showModal();
        return () => {
            if (dialog.open) dialog.close();
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, [open]);

    function chooseModel(next: ResearchModel) {
        if (!modelsAvailable) return;
        setStorageNotice(setModel(next) !== next);
    }

    return <dialog ref={dialogRef} aria-labelledby={titleId} className="courtos-settings-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }}>
        <header className="courtos-settings-header">
            <h2 id={titleId}>{t(m.settings)}</h2>
            <button type="button" className="courtos-settings-close" onClick={onClose} aria-label={t(m.closeSettings)}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="courtos-settings-body">
            <CourtOSLanguageSelect explain />
            <fieldset className="courtos-settings-models" disabled={!modelsAvailable || !userId || signingOut}>
                <legend>{t(m.aiModel)}</legend>
                <label className="courtos-settings-model" data-processing-route="server"><input type="radio" name={modelName} value="gemma" checked={model === "gemma"} onChange={() => chooseModel("gemma")} /><ProcessingLocation service="gemma" /></label>
                <label className="courtos-settings-model" data-processing-route="external"><input type="radio" name={modelName} value="claude-opus-5-5" checked={model === "claude-opus-5-5"} disabled={!externalAvailable} onChange={() => chooseModel("claude-opus-5-5")} /><ProcessingLocation service="anthropic">{!externalAvailable && t(m.unavailable)}</ProcessingLocation></label>
            </fieldset>
            <p className="courtos-settings-note">{t(modelsAvailable ? m.modelScope : m.wordModelsUnavailable)}</p>
            {modelsAvailable && storageNotice && <p role="status" className="courtos-settings-notice">{t(m.modelNotSaved)}</p>}
            <div className="courtos-settings-facts"><p>{t(m.localSearch)}</p>{modelsAvailable && <p>{t(m.externalPreview)}</p>}</div>
            <section className="courtos-settings-account" aria-label={t(m.account)}>
                {email && <p className="courtos-settings-email">{email}</p>}
                <button type="button" className="courtos-settings-signout" onClick={() => void onSignOut()} disabled={signingOut}>{t(signingOut ? m.signingOut : m.signOut)}</button>
                {signOutError && <p role="alert" className="courtos-settings-error">{signOutError}</p>}
            </section>
            <details className="courtos-settings-help"><summary>{t(m.helpSource)}</summary><div><a href={`${COURTOS_GUIDE_PATH}${locale === "en" ? "de" : locale}.html`} target="_blank" rel="noopener noreferrer">{t(m.guide)}</a><a href={COURTOS_SOURCE_URL} target="_blank" rel="noopener noreferrer">{t(m.github)}</a></div></details>
        </div>
    </dialog>;
}
