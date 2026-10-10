/* Public boot utilities. No document access, credentials or stored session data. */
(function (w) {
    "use strict";
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const STATE = /^[0-9a-f]{64}$/;
    const ORIGIN = "https://sandbox.swisslaw.io";
    const OFFICE_URL = "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";
    let readiness;
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
                    else resolve(w.Office);
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
        sameOrigin();
        if (!((method === "GET" && path === "/api/auth/session") || (method === "POST" && path === "/api/auth/cloudflare"))) throw new Error("Unsupported request");
        const controller = new AbortController();
        const timer = w.setTimeout(() => controller.abort(), 10000);
        try {
            const response = await w.fetch(path, { method, credentials: "include", mode: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
            if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("Session unavailable");
            const declaredBytes = response.headers.get("content-length");
            if (declaredBytes && (!/^\d+$/.test(declaredBytes) || Number(declaredBytes) > 8192)) throw new Error("Invalid session response");
            if (!response.body || typeof response.body.getReader !== "function") throw new Error("Invalid session response");
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8", { fatal: true });
            let raw = "";
            let bytes = 0;
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done) break;
                    bytes += part.value.byteLength;
                    if (bytes > 8192) {
                        void reader.cancel().catch(() => {});
                        throw new Error("Invalid session response");
                    }
                    raw += decoder.decode(part.value, { stream: true });
                }
                raw += decoder.decode();
            } finally { reader.releaseLock(); }
            const user = JSON.parse(raw).user;
            if (!user || typeof user.id !== "string" || !UUID.test(user.id)) throw new Error("Invalid session response");
            return user.id;
        } catch (error) {
            controller.abort();
            throw error;
        } finally { w.clearTimeout(timer); }
    }
    function setupBrowserLink() {
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
    w.CourtOSWordBoot = Object.freeze({ sameOrigin, stateFromUrl, newState, officeReady, authUser, setupBrowserLink, validUserId: value => typeof value === "string" && UUID.test(value), validState: value => typeof value === "string" && STATE.test(value) });
})(window);
