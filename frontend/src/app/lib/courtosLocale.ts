/** UI language only. Never changes source text, search filters or model instructions. */
export const COURTOS_LOCALES = ["de", "fr", "it", "en"] as const;
export type CourtOSLocale = typeof COURTOS_LOCALES[number];
export type CourtOSText = Readonly<Record<CourtOSLocale, string>>;
export const COURTOS_LANGUAGE_NAMES: Record<CourtOSLocale, string> = {
    de: "Deutsch", fr: "Français", it: "Italiano", en: "English",
};
export const COURTOS_LANGUAGE_TAGS: Record<CourtOSLocale, string> = {
    de: "de-CH", fr: "fr-CH", it: "it-CH", en: "en",
};
const EVENT = "courtos:ui-language";
const PREFIX = "courtos:ui-language:v1:";
const SIGN_IN_KEY = "courtos:ui-language:signin:v1";
const temporaryChoices = new Map<string, CourtOSLocale>();
let signInChoice: CourtOSLocale | null = null;

export function isCourtOSLocale(value: unknown): value is CourtOSLocale {
    return typeof value === "string" && (COURTOS_LOCALES as readonly string[]).includes(value);
}
export function normaliseCourtOSLocale(value: unknown): CourtOSLocale | null {
    if (typeof value !== "string" || value.length > 40) return null;
    const language = value.toLowerCase().split(/[-_]/)[0];
    return isCourtOSLocale(language) ? language : null;
}
function ownerKey(ownerId: string | null): string | null {
    if (ownerId !== null && (!ownerId || ownerId.length > 128)) return null;
    return `${PREFIX}${ownerId === null ? "signed-out" : `account:${encodeURIComponent(ownerId)}`}`;
}
/** Office display language is optional. Reading it never reads document content.
 * https://learn.microsoft.com/javascript/api/office/office.context#office-office-context-displaylanguage-member */
export function courtOSLanguageHint(): CourtOSLocale {
    if (typeof window === "undefined") return "de";
    try {
        const office = (window as unknown as { Office?: { context?: { displayLanguage?: unknown } } }).Office;
        const hint = normaliseCourtOSLocale(office?.context?.displayLanguage);
        if (hint) return hint;
    } catch { /* Office may not yet be initialised. Browser hints remain available. */ }
    for (const hint of [...(navigator.languages ?? []), navigator.language]) {
        const language = normaliseCourtOSLocale(hint);
        if (language) return language;
    }
    return "de";
}
function savedChoice(ownerId: string | null): CourtOSLocale | null {
    const key = ownerKey(ownerId);
    if (!key || typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const stored: unknown = JSON.parse(raw);
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
        const value = stored as { version?: unknown; ownerId?: unknown; locale?: unknown };
        return value.version === 1 && value.ownerId === ownerId && isCourtOSLocale(value.locale) ? value.locale : null;
    } catch { return null; }
}
/** A stable primitive snapshot supports SSR and immediate account isolation. */
export function courtOSLocaleSnapshot(ownerId: string | null): string {
    const key = ownerKey(ownerId);
    const temporary = key ? temporaryChoices.get(key) : null;
    if (temporary) return `${temporary}:temporary`;
    const stored = savedChoice(ownerId);
    if (stored) return `${stored}:saved`;
    return `${courtOSLanguageHint()}:hint`;
}
export function refreshCourtOSLanguageHint(): void {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}
export function setCourtOSLocale(ownerId: string | null, locale: CourtOSLocale): boolean {
    const key = ownerKey(ownerId);
    if (!key || !isCourtOSLocale(locale) || typeof window === "undefined") return false;
    let persisted = false;
    try {
        window.localStorage.setItem(key, JSON.stringify({ version: 1, ownerId, locale }));
        temporaryChoices.delete(key); persisted = true;
    } catch {
        // Retain the user's explicit choice in this window. Do not resurrect an
        // older stored language while writes are blocked.
        temporaryChoices.set(key, locale);
    }
    if (ownerId === null) {
        signInChoice = locale;
        // A bounded UI-only bridge survives the sign-in page navigation. It is
        // consumed once, never used as an account or authorisation credential.
        try { window.localStorage.setItem(SIGN_IN_KEY, JSON.stringify({ locale, createdAt: Date.now() })); } catch { /* in-memory handoff still works */ }
    }
    refreshCourtOSLanguageHint();
    return persisted;
}
/** An explicit pre-login selection applies once to the next account in this
 * window, and never overwrites that account's existing explicit preference. */
export function adoptSignInLanguage(ownerId: string): void {
    let choice = signInChoice; signInChoice = null;
    try {
        const value = JSON.parse(window.localStorage.getItem(SIGN_IN_KEY) || "null");
        window.localStorage.removeItem(SIGN_IN_KEY);
        if (!choice && value && isCourtOSLocale(value.locale) && typeof value.createdAt === "number" && Number.isFinite(value.createdAt) && value.createdAt <= Date.now() && Date.now() - value.createdAt <= 1_800_000) choice = value.locale;
    } catch { /* Preference storage is optional. */ }
    if (!choice) return;
    const key = ownerKey(ownerId);
    if (key && !savedChoice(ownerId) && !temporaryChoices.has(key)) setCourtOSLocale(ownerId, choice);
}
export function subscribeCourtOSLocale(ownerId: string | null, changed: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === ownerKey(ownerId) || event.key === null) changed();
    };
    window.addEventListener(EVENT, changed);
    window.addEventListener("storage", onStorage);
    window.addEventListener("languagechange", changed);
    window.addEventListener("focus", changed);
    return () => {
        window.removeEventListener(EVENT, changed); window.removeEventListener("storage", onStorage);
        window.removeEventListener("languagechange", changed); window.removeEventListener("focus", changed);
    };
}
/** Plain strings only. React renders these as text; no HTML translation or evaluation. */
export function formatCourtOSText(locale: CourtOSLocale, message: CourtOSText, values: Readonly<Record<string, string | number>> = {}): string {
    return message[locale].replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, key: string) =>
        Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);
}
