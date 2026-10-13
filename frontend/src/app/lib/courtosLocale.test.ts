import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptSignInLanguage, courtOSLanguageHint, courtOSLocaleSnapshot, formatCourtOSText, normaliseCourtOSLocale, refreshCourtOSLanguageHint, setCourtOSLocale, subscribeCourtOSLocale } from "./courtosLocale";
import { courtOSMessages } from "./courtosMessages";
import { readerMessages } from "./courtosReaderMessages";
import { reviewMessages } from "./reviewMessages";

beforeEach(() => {
    localStorage.clear(); vi.restoreAllMocks();
    Object.defineProperty(navigator, "languages", { configurable: true, value: ["de-CH"] });
    Object.defineProperty(window, "Office", { configurable: true, value: undefined });
});
describe("CourtOS interface language", () => {
    it("names the processing service without a country label in every interface edition", () => {
        for (const messages of [courtOSMessages, readerMessages, reviewMessages]) {
            for (const message of Object.values(messages)) {
                for (const text of Object.values(message)) expect(text).not.toMatch(/Deutschland|Germany|Allemagne|Germania/i);
            }
        }
        for (const locale of ["de", "fr", "it", "en"] as const) {
            expect(courtOSMessages.serverGermany[locale]).toContain("CourtOS");
            expect(courtOSMessages.externalApi[locale]).toContain("Anthropic");
            expect(readerMessages.server[locale]).toContain("CourtOS");
        }
    });
    it("uses supported regional browser and optional Office display-language hints", () => {
        Object.defineProperty(navigator, "languages", { configurable: true, value: ["pt-BR", "fr-CH", "it-IT"] });
        expect(courtOSLanguageHint()).toBe("fr");
        Object.defineProperty(window, "Office", { configurable: true, value: { context: { displayLanguage: "it-CH", get document() { throw new Error("Must not read a document"); } } } });
        expect(courtOSLanguageHint()).toBe("it");
        expect(normaliseCourtOSLocale("en-GB")).toBe("en");
        expect(normaliseCourtOSLocale("garbage")).toBeNull();
    });
    it("keeps explicit choices account-bound and stronger than host hints", () => {
        expect(setCourtOSLocale("locale-owner-a", "fr")).toBe(true);
        expect(courtOSLocaleSnapshot("locale-owner-a")).toBe("fr:saved");
        expect(courtOSLocaleSnapshot("locale-owner-b")).toBe("de:hint");
        expect(courtOSLocaleSnapshot(null)).toBe("de:hint");
        Object.defineProperty(window, "Office", { configurable: true, value: { context: { displayLanguage: "en-US" } } });
        expect(courtOSLocaleSnapshot("locale-owner-a")).toBe("fr:saved");
    });
    it("ignores malformed, wrong-owner and unknown-language storage", () => {
        const key = "courtos:ui-language:v1:account:owner-invalid";
        for (const value of ["oops", JSON.stringify({ version: 1, ownerId: "someone-else", locale: "fr" }), JSON.stringify({ version: 1, ownerId: "owner-invalid", locale: "es" })]) {
            localStorage.setItem(key, value);
            expect(courtOSLocaleSnapshot("owner-invalid")).toBe("de:hint");
        }
        expect(setCourtOSLocale("owner-invalid", "es" as "de")).toBe(false);
    });
    it("retains an explicit choice in memory on storage failure without reviving an old stored choice", () => {
        setCourtOSLocale("owner-blocked-storage", "de");
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
        expect(setCourtOSLocale("owner-blocked-storage", "it")).toBe(false);
        expect(courtOSLocaleSnapshot("owner-blocked-storage")).toBe("it:temporary");
        expect(courtOSLocaleSnapshot("another-owner")).toBe("de:hint");
    });
    it("adopts an explicit sign-in choice once and never overwrites an account preference", () => {
        setCourtOSLocale(null, "fr"); adoptSignInLanguage("newly-signed-in");
        expect(courtOSLocaleSnapshot("newly-signed-in")).toBe("fr:saved");
        adoptSignInLanguage("later-account"); expect(courtOSLocaleSnapshot("later-account")).toBe("de:hint");
        setCourtOSLocale("existing-account", "it"); setCourtOSLocale(null, "en"); adoptSignInLanguage("existing-account");
        expect(courtOSLocaleSnapshot("existing-account")).toBe("it:saved");
    });
    it("consumes a bounded sign-in language bridge after navigation, ignoring future or stale choices", () => {
        const pending="courtos:ui-language:signin:v1";
        localStorage.setItem(pending,JSON.stringify({locale:"it",createdAt:Date.now()}));
        adoptSignInLanguage("bridge-current");
        expect(courtOSLocaleSnapshot("bridge-current")).toBe("it:saved");
        expect(localStorage.getItem(pending)).toBeNull();
        for(const [id,createdAt] of [["bridge-expired",Date.now()-1_800_001],["bridge-future",Date.now()+60_000]] as const){
            localStorage.setItem(pending,JSON.stringify({locale:"fr",createdAt}));
            adoptSignInLanguage(id);
            expect(courtOSLocaleSnapshot(id)).toBe("de:hint");
            expect(localStorage.getItem(pending)).toBeNull();
        }
    });
    it("substitutes values as plain text, without recursive interpolation or HTML interpretation", () => {
        const message = { de: "Quelle {name}: {count}", fr: "Source {name} : {count}", it: "Fonte {name}: {count}", en: "Source {name}: {count}" };
        expect(formatCourtOSText("en", message, { name: "<script>{count}</script>", count: 2 })).toBe("Source <script>{count}</script>: 2");
    });
    it("leaves an unmatched placeholder literal instead of blank", () => {
        const message = { de: "Quelle {name}", fr: "Source {name}", it: "Fonte {name}", en: "Source {name}" };
        expect(formatCourtOSText("en", message, {})).toBe("Source {name}");
    });
    it("rejects an empty or over-length owner id without touching storage", () => {
        expect(setCourtOSLocale("", "fr")).toBe(false);
        expect(courtOSLocaleSnapshot("")).toBe("de:hint");
        expect(setCourtOSLocale("a".repeat(129), "fr")).toBe(false);
        expect(courtOSLocaleSnapshot("a".repeat(129))).toBe("de:hint");
    });
    it("ignores a stored array value and falls back to the hint", () => {
        const key = "courtos:ui-language:v1:account:owner-array";
        localStorage.setItem(key, JSON.stringify(["de"]));
        expect(courtOSLocaleSnapshot("owner-array")).toBe("de:hint");
    });
    it("falls back to the default locale and a no-op refresh without a window (SSR)", () => {
        vi.stubGlobal("window", undefined);
        try {
            expect(courtOSLanguageHint()).toBe("de");
            expect(() => refreshCourtOSLanguageHint()).not.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });
    it("falls through a nullish navigator.languages list and an unmatched language to the default", () => {
        Object.defineProperty(navigator, "languages", { configurable: true, value: undefined });
        Object.defineProperty(navigator, "language", { configurable: true, value: "fr-CH" });
        expect(courtOSLanguageHint()).toBe("fr");
        Object.defineProperty(navigator, "languages", { configurable: true, value: ["xx-XX"] });
        Object.defineProperty(navigator, "language", { configurable: true, value: "yy" });
        expect(courtOSLanguageHint()).toBe("de");
    });
    it("notifies subscribers on a matching storage change and on language/focus events, then stops after unsubscribe", () => {
        const changed = vi.fn();
        const unsubscribe = subscribeCourtOSLocale("subscribe-owner", changed);
        const key = "courtos:ui-language:v1:account:subscribe-owner";
        window.dispatchEvent(new StorageEvent("storage", { key }));
        expect(changed).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new StorageEvent("storage", { key: "unrelated-key" }));
        expect(changed).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new StorageEvent("storage", { key: null }));
        expect(changed).toHaveBeenCalledTimes(2);
        window.dispatchEvent(new Event("courtos:ui-language"));
        expect(changed).toHaveBeenCalledTimes(3);
        window.dispatchEvent(new Event("languagechange"));
        expect(changed).toHaveBeenCalledTimes(4);
        window.dispatchEvent(new Event("focus"));
        expect(changed).toHaveBeenCalledTimes(5);
        unsubscribe();
        window.dispatchEvent(new Event("focus"));
        expect(changed).toHaveBeenCalledTimes(5);
    });
    it("provides all four complete catalog variants with equal placeholders and Swiss German spelling", () => {
        for (const message of [...Object.values(courtOSMessages), ...Object.values(readerMessages)]) {
            expect(Object.keys(message).sort()).toEqual(["de", "en", "fr", "it"]);
            const placeholders = (text: string) => [...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(x => x[1]).sort();
            for (const translation of Object.values(message)) { expect(translation.trim()).not.toBe(""); expect(placeholders(translation)).toEqual(placeholders(message.de)); }
            expect(message.de).not.toContain("ß");
        }
    });
});
