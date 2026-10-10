/* Public boot utilities. No document access, credentials or stored session data. */
(function (w) {
    "use strict";
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const STATE = /^[0-9a-f]{64}$/;
    const ORIGIN = "https://sandbox.swisslaw.io";
    const OFFICE_URL = "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";
    // UI preference only. No identity, document content or auth token is stored.
    const LOCALE_KEY = "courtos:ui-language:v1:signed-out";
    const LANGUAGES = ["de", "fr", "it", "en"];
    const words = {
        language: ["Sprache", "Langue", "Lingua", "Language"],
        connecting: ["Word wird verbunden …", "Connexion à Word…", "Connessione a Word…", "Connecting to Word…"],
        signin: ["Anmelden", "Se connecter", "Accedi", "Sign in"],
        confirm: ["Zugang in Word bestätigen", "Confirmer l’accès dans Word", "Conferma l’accesso in Word", "Confirm access in Word"],
        browser: ["Im Browser öffnen", "Ouvrir dans le navigateur", "Apri nel browser", "Open in browser"],
        pilot: ["Testbetrieb · CourtOS-Server. Keine vertraulichen Unterlagen.", "Version de test · Serveur CourtOS. Aucun document confidentiel.", "Versione di prova · Server CourtOS. Non caricare documenti riservati.", "Test service · CourtOS server. No confidential documents."],
        checkingPane: ["Zugang in Word wird geprüft …", "Vérification de l’accès dans Word…", "Verifica dell’accesso in Word…", "Checking access in Word…"],
        differentAccount: ["Word verwendet eine andere Sitzung. Prüfcode P2-KONTO. Öffnen Sie die Recherche im Browser und prüfen Sie dort das Konto.", "Word utilise une autre session. Code de contrôle P2-KONTO. Ouvrez la recherche dans le navigateur et vérifiez le compte.", "Word usa un’altra sessione. Codice di verifica P2-KONTO. Aprite la ricerca nel browser e verificate l’account.", "Word is using a different session. Diagnostic code P2-KONTO. Open research in the browser and check the account."],
        paneFailed: ["Word konnte die Anmeldung nicht übernehmen. Prüfcode P1-{code}. Verwenden Sie die Recherche im Browser.", "Word n’a pas pu reprendre la connexion. Code de contrôle P1-{code}. Utilisez la recherche dans le navigateur.", "Word non ha potuto riprendere l’accesso. Codice di verifica P1-{code}. Usate la ricerca nel browser.", "Word could not receive the sign-in. Diagnostic code P1-{code}. Use research in the browser."],
        closed: ["Das Anmeldefenster wurde ohne Bestätigung beendet. Prüfcode D0-GESCHLOSSEN. Melden Sie sich erneut an.", "La fenêtre de connexion a été fermée sans confirmation. Code de contrôle D0-GESCHLOSSEN. Reconnectez-vous.", "La finestra di accesso è stata chiusa senza conferma. Codice di verifica D0-GESCHLOSSEN. Accedete di nuovo.", "The sign-in window closed without confirmation. Diagnostic code D0-GESCHLOSSEN. Sign in again."],
        separateWindow: ["Anmeldung im separaten Fenster …", "Connexion dans une fenêtre distincte…", "Accesso in una finestra separata…", "Signing in in a separate window…"],
        unsafeWindow: ["Die Anmeldung kann hier nicht sicher geöffnet werden. Verwenden Sie den Browser.", "La connexion ne peut pas être ouverte ici en toute sécurité. Utilisez le navigateur.", "Non è possibile aprire l’accesso in modo sicuro qui. Usate il browser.", "Sign-in cannot be opened safely here. Use the browser."],
        noResponse: ["Das Anmeldefenster reagiert nicht. Versuchen Sie es erneut oder verwenden Sie den Browser.", "La fenêtre de connexion ne répond pas. Réessayez ou utilisez le navigateur.", "La finestra di accesso non risponde. Riprovate oppure usate il browser.", "The sign-in window is not responding. Try again or use the browser."],
        cannotOpen: ["Das Anmeldefenster konnte nicht geöffnet werden. Versuchen Sie es erneut oder verwenden Sie den Browser.", "La fenêtre de connexion n’a pas pu être ouverte. Réessayez ou utilisez le navigateur.", "Non è stato possibile aprire la finestra di accesso. Riprovate oppure usate il browser.", "The sign-in window could not be opened. Try again or use the browser."],
        besideDocument: ["Rechtsrecherche neben Ihrem Dokument.", "La recherche juridique à côté de votre document.", "La ricerca giuridica accanto al vostro documento.", "Legal research alongside your document."],
        wordUnavailable: ["Die Word-Verbindung ist nicht verfügbar. Verwenden Sie die Recherche im Browser.", "La connexion à Word est indisponible. Utilisez la recherche dans le navigateur.", "La connessione a Word non è disponibile. Usate la ricerca nel browser.", "The Word connection is unavailable. Use research in the browser."],
        confirmSession: ["Bestätigen Sie den Zugang für diese Word-Sitzung.", "Confirmez l’accès pour cette session Word.", "Confermate l’accesso per questa sessione Word.", "Confirm access for this Word session."],
        cannotReturn: ["Diese Anmeldung kann nicht an Word zurückgegeben werden. Schliessen Sie das Fenster und beginnen Sie erneut.", "Cette connexion ne peut pas être transmise à Word. Fermez la fenêtre et recommencez.", "Questo accesso non può essere trasmesso a Word. Chiudete la finestra e ricominciate.", "This sign-in cannot be returned to Word. Close the window and start again."],
        confirming: ["Zugang wird bestätigt …", "Confirmation de l’accès…", "Conferma dell’accesso…", "Confirming access…"],
        confirmed: ["Anmeldung bestätigt. Sie können dieses Fenster schliessen.", "Connexion confirmée. Vous pouvez fermer cette fenêtre.", "Accesso confermato. Potete chiudere questa finestra.", "Sign-in confirmed. You can close this window."],
        failed: ["Der Zugang konnte nicht bestätigt werden. Prüfcode {code}. Versuchen Sie es erneut oder verwenden Sie die Recherche im Browser.", "L’accès n’a pas pu être confirmé. Code de contrôle {code}. Réessayez ou utilisez la recherche dans le navigateur.", "Non è stato possibile confermare l’accesso. Codice di verifica {code}. Riprovate oppure usate la ricerca nel browser.", "Access could not be confirmed. Diagnostic code {code}. Try again or use research in the browser."],
        loginFailed: ["Die Anmeldung konnte nicht geöffnet werden. Schliessen Sie dieses Fenster und versuchen Sie es erneut.", "La connexion n’a pas pu être ouverte. Fermez cette fenêtre et réessayez.", "Non è stato possibile aprire l’accesso. Chiudete questa finestra e riprovate.", "Sign-in could not be opened. Close this window and try again."],
    };
    let locale = "de", explicitLocale = null, languageReady = false;
    const labels = new Map();
    function languageHint(value) { const code = typeof value === "string" ? value.toLowerCase().split(/[-_]/)[0] : ""; return LANGUAGES.includes(code) ? code : null; }
    function text(element, key, values = {}) {
        if (!element || !words[key]) return;
        labels.set(element, { key, values });
        element.textContent = words[key][LANGUAGES.indexOf(locale)].replace(/\{([a-zA-Z]+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match);
    }
    function refreshLanguage() {
        let stored;
        try { const value = JSON.parse(w.localStorage.getItem(LOCALE_KEY)); if (value?.version === 1 && value.ownerId === null && LANGUAGES.includes(value.locale)) stored = value.locale; } catch { /* Optional preference storage. */ }
        let officeHint;
        try { officeHint = w.Office?.context?.displayLanguage; } catch { /* Not yet initialised. */ }
        const hints = [officeHint, ...(w.navigator?.languages || []), w.navigator?.language];
        locale = explicitLocale || stored || hints.map(languageHint).find(Boolean) || "de";
        w.document.documentElement.lang = locale === "en" ? "en" : locale + "-CH";
        w.document.querySelectorAll("[data-ui-locale]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.uiLocale === locale)));
        labels.forEach((binding, element) => text(element, binding.key, binding.values));
    }
    function setupLanguage() {
        if (languageReady) return; languageReady = true;
        for (const [id, key] of [["language-label", "language"], ["status", "connecting"], ["signin", "signin"], ["confirm", "confirm"], ["browser", "browser"], ["pilot-note", "pilot"]]) text(w.document.getElementById(id), key);
        w.document.querySelectorAll("[data-ui-locale]").forEach(button => button.addEventListener("click", () => {
            if (!LANGUAGES.includes(button.dataset.uiLocale)) return;
            explicitLocale = button.dataset.uiLocale;
            try {
                w.localStorage.setItem(LOCALE_KEY, JSON.stringify({ version: 1, ownerId: null, locale: explicitLocale }));
                w.localStorage.setItem("courtos:ui-language:signin:v1", JSON.stringify({ locale: explicitLocale, createdAt: Date.now() }));
            } catch { /* Current window choice still applies. */ }
            refreshLanguage();
        }));
        refreshLanguage();
    }
    let readiness;
    const PROBE_CODES = new Set(["TIMEOUT", "NETWORK", "HTTP_OTHER", "MIME", "LENGTH", "STREAM", "READ", "UTF8", "JSON", "IDENTITY", "UNKNOWN",
        "HTTP400", "HTTP401", "HTTP403", "HTTP404", "HTTP409", "HTTP429", "HTTP500", "HTTP502", "HTTP503", "HTTP504"]);
    function probeError(code) {
        const error = new Error("Authentication check failed");
        error.courtosProbeCode = code;
        return error;
    }
    function diagnosticCode(error) {
        return PROBE_CODES.has(error?.courtosProbeCode) ? error.courtosProbeCode : "UNKNOWN";
    }
    function sameOrigin() {
        if (w.location.origin !== ORIGIN) throw new Error("Untrusted host");
        return ORIGIN;
    }
    function stateFromUrl() {
        const values = new URL(w.location.href).searchParams.getAll("state");
        return values.length === 1 && STATE.test(values[0]) ? values[0] : null;
    }
    function newState() {
        const bytes = new Uint8Array(32);
        w.crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    }
    function officeReady() {
        if (readiness) return readiness;
        readiness = new Promise((resolve, reject) => {
            const timeout = w.setTimeout(() => reject(new Error("Office unavailable")), 15000);
            function connect() {
                if (!w.Office || typeof w.Office.onReady !== "function") return;
                // Initialize before authentication or any application content.
                Promise.resolve(w.Office.onReady()).then(info => {
                    w.clearTimeout(timeout);
                    if (info.host !== "Word") reject(new Error("Word unavailable"));
                    else { refreshLanguage(); resolve(w.Office); }
                }, () => { w.clearTimeout(timeout); reject(new Error("Office unavailable")); });
            }
            if (w.Office && typeof w.Office.onReady === "function") connect();
            else {
                const script = w.document.createElement("script");
                script.src = OFFICE_URL;
                script.async = true;
                script.onload = connect;
                script.onerror = () => { w.clearTimeout(timeout); reject(new Error("Office unavailable")); };
                w.document.head.appendChild(script);
            }
        });
        return readiness;
    }
    async function authUser(method, path) {
        const origin = sameOrigin();
        if (!((method === "GET" && path === "/api/auth/session") || (method === "POST" && path === "/api/auth/cloudflare"))) throw new Error("Unsupported request");
        const controller = new AbortController();
        let timedOut = false;
        const timer = w.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
        try {
            let response;
            // Under no-referrer, a non-CORS POST serializes Origin as null.
            // CORS mode retains the true Origin; the fixed URL and redirect:error
            // still confine this request to the validated CourtOS host.
            try { response = await w.fetch(origin + path, { method, credentials: "include", mode: "cors", cache: "no-store", redirect: "error", signal: controller.signal }); }
            catch { throw probeError(timedOut ? "TIMEOUT" : "NETWORK"); }
            if (!response.ok) throw probeError(PROBE_CODES.has("HTTP" + response.status) ? "HTTP" + response.status : "HTTP_OTHER");
            if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw probeError("MIME");
            const declaredBytes = response.headers.get("content-length");
            if (declaredBytes && (!/^\d+$/.test(declaredBytes) || Number(declaredBytes) > 8192)) throw probeError("LENGTH");
            if (!response.body || typeof response.body.getReader !== "function") throw probeError("STREAM");
            let reader;
            try { reader = response.body.getReader(); }
            catch { throw probeError("STREAM"); }
            let raw = "";
            let bytes = 0;
            try {
                let decoder;
                try { decoder = new TextDecoder("utf-8", { fatal: true }); }
                catch { throw probeError("UTF8"); }
                while (true) {
                    let part;
                    try { part = await reader.read(); }
                    catch { throw probeError(timedOut ? "TIMEOUT" : "READ"); }
                    if (part.done) break;
                    bytes += part.value.byteLength;
                    if (bytes > 8192) {
                        void reader.cancel().catch(() => {});
                        throw probeError("LENGTH");
                    }
                    try { raw += decoder.decode(part.value, { stream: true }); }
                    catch { throw probeError("UTF8"); }
                }
                try { raw += decoder.decode(); }
                catch { throw probeError("UTF8"); }
            } finally { reader.releaseLock(); }
            let data;
            try { data = JSON.parse(raw); }
            catch { throw probeError("JSON"); }
            const user = data?.user;
            if (!user || typeof user.id !== "string" || !UUID.test(user.id)) throw probeError("IDENTITY");
            return user.id;
        } catch (error) {
            controller.abort();
            throw error;
        } finally { w.clearTimeout(timer); }
    }
    function setupBrowserLink() {
        setupLanguage();
        const link = w.document.getElementById("browser");
        link.addEventListener("click", event => {
            try {
                sameOrigin();
                const office = w.Office;
                if (office?.context?.requirements?.isSetSupported("OpenBrowserWindowApi", "1.1") && typeof office.context.ui.openBrowserWindow === "function") {
                    office.context.ui.openBrowserWindow(ORIGIN + "/research");
                    event.preventDefault();
                }
            } catch { /* The fixed HTTPS anchor remains the explicit fallback. */ }
        });
    }
    w.CourtOSWordBoot = Object.freeze({ sameOrigin, stateFromUrl, newState, officeReady, authUser, diagnosticCode, setupBrowserLink, text, validUserId: value => typeof value === "string" && UUID.test(value), validState: value => typeof value === "string" && STATE.test(value) });
})(window);
