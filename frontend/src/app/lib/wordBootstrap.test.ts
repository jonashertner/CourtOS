import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = resolve(import.meta.dirname, "../../../../word-addin/bootstrap");
const origin = "https://sandbox.swisslaw.io";
const owner = "00000000-0000-0000-0000-000000000001";
const otherOwner = "00000000-0000-0000-0000-000000000002";
const state = "a".repeat(64);
const json = (id = owner) => new Response(JSON.stringify({ user: { id } }), { headers: { "content-type": "application/json; charset=utf-8" } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

type DialogHandler = (event: { origin?: string; message?: string; error?: number }) => void;
function harness(page: "index" | "login" | "complete", search = "", host = origin) {
    const html = new DOMParser().parseFromString(readFileSync(resolve(root, `${page}.html`), "utf8"), "text/html");
    document.head.innerHTML = html.head.innerHTML; document.body.innerHTML = html.body.innerHTML;
    const handlers: Record<string, DialogHandler> = {};
    const dialog = { close: vi.fn(), addEventHandler: vi.fn((kind: string, callback: DialogHandler) => { handlers[kind] = callback; }) };
    const office = {
        onReady: vi.fn().mockResolvedValue({ host: "Word" }),
        AsyncResultStatus: { Succeeded: "succeeded" },
        EventType: { DialogMessageReceived: "message", DialogEventReceived: "closed" },
        context: { requirements: { isSetSupported: vi.fn().mockReturnValue(true) }, ui: {
            displayDialogAsync: vi.fn((_url, _options, callback) => callback({ status: "succeeded", value: dialog })),
            openBrowserWindow: vi.fn(), messageParent: vi.fn(),
        } },
    };
    const fetch = vi.fn().mockImplementation(async () => json());
    let randomByte = 0;
    const window = {
        document, Office: office, fetch,
        location: { origin: host, href: host + (page === "complete" ? "/word-auth/complete.html" : `/word-bootstrap/${page}.html`) + search, replace: vi.fn() },
        crypto: { getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(++randomByte)) },
        setTimeout, clearTimeout,
    };
    Object.defineProperty(window, "Word", { get: () => { throw new Error("No Word document API access is permitted during startup"); } });
    const context = { window, URL, URLSearchParams, Uint8Array, TextDecoder, AbortController, Error, Promise, JSON };
    runInNewContext(readFileSync(resolve(root, "runtime.js"), "utf8"), context);
    const start = () => runInNewContext(readFileSync(resolve(root, page === "index" ? "bootstrap.js" : `${page}.js`), "utf8"), context);
    return { window, office, fetch, dialog, handlers, start };
}
function callback(h: ReturnType<typeof harness>, overrides: Record<string, unknown> = {}, eventOrigin: string | undefined = origin) {
    const url = h.office.context.ui.displayDialogAsync.mock.calls[0][0];
    h.handlers.message({ origin: eventOrigin, message: JSON.stringify({ type: "courtos:word:authenticated", state: new URL(url).searchParams.get("state"), userId: owner, ...overrides }) });
}
afterEach(() => { vi.useRealTimers(); document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("CourtOS Word bootstrap authentication boundary", () => {
    it("keeps the pilot notice country-free in all pages and languages without authenticating", async () => {
        for (const page of ["index", "login", "complete"] as const) {
            const h = harness(page, page === "index" ? "" : `?state=${state}`);
            expect(document.getElementById("pilot-note")?.textContent).not.toMatch(/Deutschland|Germany|Allemagne|Germania/i);
            h.start(); await flush();
            for (const value of ["de", "fr", "it", "en"]) {
                fireEvent.click(document.querySelector(`[data-ui-locale="${value}"]`)!);
                expect(document.querySelector(`[data-ui-locale="${value}"]`)).toHaveAttribute("aria-pressed", "true");
                expect(document.getElementById("pilot-note")?.textContent).toContain("CourtOS");
                expect(document.getElementById("pilot-note")?.textContent).not.toMatch(/Deutschland|Germany|Allemagne|Germania/i);
            }
            expect(h.fetch).not.toHaveBeenCalled();
            expect(h.office.context.ui.messageParent).not.toHaveBeenCalled();
        }
    });
    it("uses the Office UI hint and an explicit language choice without authenticating or reading the document", async () => {
        const h = harness("index");
        Object.assign(h.office.context, { displayLanguage: "fr-CH" });
        h.start(); await flush();
        expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: "English" }));
        expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
        expect(document.documentElement.lang).toBe("en");
        expect(h.fetch).not.toHaveBeenCalled(); expect(h.office.context.ui.displayDialogAsync).not.toHaveBeenCalled();
        expect(h.window.location.replace).not.toHaveBeenCalled();
    });
    it("translates diagnostics while preserving their code and fixed authentication request", async () => {
        const h = harness("complete", `?state=${state}`); h.start(); await flush();
        h.fetch.mockResolvedValue(new Response("", { status: 403 }));
        fireEvent.click(screen.getByRole("button", { name: "Italiano" }));
        fireEvent.click(screen.getByRole("button", { name: "Conferma l’accesso in Word" })); await flush();
        expect(screen.getByRole("status")).toHaveTextContent("Codice di verifica D1-HTTP403");
        expect(h.fetch).toHaveBeenCalledExactlyOnceWith(origin + "/api/auth/cloudflare", expect.objectContaining({ method: "POST", mode: "cors", redirect: "error" }));
        expect(h.office.context.ui.messageParent).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "English" }));
        expect(screen.getByRole("status")).toHaveTextContent("Diagnostic code D1-HTTP403");
        expect(h.fetch).toHaveBeenCalledOnce();
    });
    it("initializes Office before login, with no document, API, popup or navigation access on load", async () => {
        const h = harness("index"); h.start(); await flush();
        expect(h.office.onReady).toHaveBeenCalledTimes(1);
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.office.context.ui.displayDialogAsync).not.toHaveBeenCalled();
        expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
    });
    it("opens only the fixed same-origin non-iframe dialog after an explicit click, once", async () => {
        const h = harness("index"); h.start(); await flush();
        fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        expect(h.office.context.ui.displayDialogAsync).toHaveBeenCalledTimes(1);
        const [url, options] = h.office.context.ui.displayDialogAsync.mock.calls[0];
        expect(new URL(url).origin).toBe(origin);
        expect(new URL(url).pathname).toBe("/word-bootstrap/login.html");
        expect([...new URL(url).searchParams.keys()]).toEqual(["state"]);
        expect(new URL(url).searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
        expect(options).toMatchObject({ displayInIframe: false, promptBeforeOpen: true });
        expect(h.fetch).not.toHaveBeenCalled();
    });
    it("ignores foreign-origin, missing-origin, mismatched-state and malformed messages without probing or navigating", async () => {
        const h = harness("index"); h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        callback(h, {}, "https://attacker.example");
        h.handlers.message({ message: JSON.stringify({ type: "courtos:word:authenticated", state: new URL(h.office.context.ui.displayDialogAsync.mock.calls[0][0]).searchParams.get("state"), userId: owner }) });
        callback(h, { state: "b".repeat(64) }); callback(h, { userId: "not-an-owner" });
        h.handlers.message({ origin, message: "not-json" });
        await flush();
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.dialog.close).not.toHaveBeenCalled();
        expect(h.window.location.replace).not.toHaveBeenCalled();
    });
    it("enters research only after the pane confirms its own matching cookie session; replay is inert", async () => {
        const h = harness("index"); h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        callback(h); callback(h); await flush();
        expect(h.dialog.close).toHaveBeenCalledTimes(1);
        expect(h.fetch).toHaveBeenCalledTimes(1);
        expect(h.fetch).toHaveBeenCalledWith(origin + "/api/auth/session", expect.objectContaining({ method: "GET", credentials: "include", mode: "cors", redirect: "error", cache: "no-store" }));
        expect(h.window.location.replace).toHaveBeenCalledWith(origin + "/word/research");
    });
    it.each(["no cookie", "different owner", "login HTML", "redirect failure"])("fails closed when the pane has %s", async (failure) => {
        const h = harness("index");
        if (failure === "no cookie") h.fetch.mockResolvedValue(new Response("", { status: 401 }));
        if (failure === "different owner") h.fetch.mockResolvedValue(json(otherOwner));
        if (failure === "login HTML") h.fetch.mockResolvedValue(new Response("<h1>Login</h1>", { headers: { "content-type": "text/html" } }));
        if (failure === "redirect failure") h.fetch.mockRejectedValue(new Error("Access redirected"));
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" })); callback(h); await flush();
        expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("link", { name: "Im Browser öffnen" })).toBeVisible();
        expect(screen.getByRole("status")).toHaveTextContent(/Browser/);
        expect(h.office.context.ui.openBrowserWindow).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("link", { name: "Im Browser öffnen" }));
        expect(h.office.context.ui.openBrowserWindow).toHaveBeenCalledWith(origin + "/research");
    });
    it("does not equate closing the dialog with a completed login, even if an older pane session exists", async () => {
        const h = harness("index"); h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        h.handlers.closed({ error: 12006 }); await flush();
        expect(h.fetch).not.toHaveBeenCalled();
        expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("D0-GESCHLOSSEN");
    });
    it("cancels an oversized streamed auth response before buffering the rest or navigating", async () => {
        const h = harness("index");
        const reader = { read: vi.fn().mockResolvedValueOnce({ done: false, value: new Uint8Array(5000) }).mockResolvedValueOnce({ done: false, value: new Uint8Array(4000) }), cancel: vi.fn().mockResolvedValue(undefined), releaseLock: vi.fn() };
        h.fetch.mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json" }), body: { getReader: () => reader }, text: vi.fn(() => { throw new Error("Unbounded text read"); }) });
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" })); callback(h); await flush();
        expect(reader.read).toHaveBeenCalledTimes(2);
        expect(reader.cancel).toHaveBeenCalledTimes(1);
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
        expect(h.fetch.mock.calls[0][1].signal.aborted).toBe(true);
        expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("Browser");
    });
    it("rejects a declared oversized response before requesting a stream reader", async () => {
        const h = harness("index"); const getReader = vi.fn();
        h.fetch.mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "application/json", "content-length": "8193" }), body: { getReader } });
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" })); callback(h); await flush();
        expect(getReader).not.toHaveBeenCalled(); expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(h.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    });
    it("aborts malformed UTF-8 without accepting a session or retaining an unread stream", async () => {
        const h = harness("index");
        h.fetch.mockResolvedValue(new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } }));
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" })); callback(h); await flush();
        expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(h.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    });
    it("decodes UTF-8 safely when a session JSON response splits a multibyte character across chunks", async () => {
        const h = harness("index"); const data = new TextEncoder().encode(JSON.stringify({ user: { id: owner }, label: "é" }));
        const split = data.findIndex(byte => byte === 0xc3) + 1;
        const stream = new ReadableStream({ start(controller) { controller.enqueue(data.slice(0, split)); controller.enqueue(data.slice(split)); controller.close(); } });
        h.fetch.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" })); callback(h); await flush();
        expect(h.window.location.replace).toHaveBeenCalledWith(origin + "/word/research");
    });
    it("recovers from a synchronous dialog error without exposing it or fetching an API", async () => {
        const h = harness("index"); h.office.context.ui.displayDialogAsync.mockImplementation(() => { throw new Error("Internal host details"); }); h.start(); await flush();
        fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
        expect(screen.getByRole("status")).not.toHaveTextContent("Internal host details");
        expect(h.fetch).not.toHaveBeenCalled();
    });
    it("retires a timed-out opening and closes its late dialog without accepting authentication", async () => {
        vi.useFakeTimers(); const h = harness("index");
        let resultCallback: ((result: unknown) => void) | undefined;
        h.office.context.ui.displayDialogAsync.mockImplementation((_url, _options, callback) => { resultCallback = callback; });
        h.start(); await vi.advanceTimersByTimeAsync(0);
        fireEvent.click(screen.getByRole("button", { name: "Anmelden" }));
        await vi.advanceTimersByTimeAsync(15001);
        expect(screen.getByRole("button", { name: "Anmelden" })).toBeEnabled();
        resultCallback!({ status: "succeeded", value: h.dialog });
        expect(h.dialog.close).toHaveBeenCalledTimes(1);
        expect(h.dialog.addEventHandler).not.toHaveBeenCalled();
        expect(h.fetch).not.toHaveBeenCalled();
    });
    it("does not offer login on hosts without origin-checked Office messages", async () => {
        const h = harness("index"); h.office.context.requirements.isSetSupported.mockImplementation(name => name !== "DialogOrigin"); h.start(); await flush();
        expect(screen.getByRole("button", { name: "Anmelden" })).toBeDisabled();
        expect(h.fetch).not.toHaveBeenCalled();
        expect(screen.getByRole("link", { name: "Im Browser öffnen" })).toBeVisible();
    });
    it("never initializes authentication on a copied untrusted host", async () => {
        const h = harness("index", "", "https://attacker.example"); h.start(); await flush();
        expect(screen.getByRole("button", { name: "Anmelden" })).toBeDisabled();
        expect(h.fetch).not.toHaveBeenCalled();
    });
    it("shows a bounded Office initialization failure", async () => {
        vi.useFakeTimers(); const h = harness("index"); h.office.onReady.mockReturnValue(new Promise(() => {})); h.start();
        await vi.advanceTimersByTimeAsync(15001);
        expect(screen.getByRole("status")).toHaveTextContent("Word-Verbindung ist nicht verfügbar");
        expect(h.fetch).not.toHaveBeenCalled();
    });
});

describe("Office dialog startup and protected completion", () => {
    it("initializes the dialog before navigating to its fixed Access-protected callback", async () => {
        const h = harness("login", `?state=${state}&next=https://attacker.example`); h.start(); await flush();
        expect(h.office.onReady).toHaveBeenCalled();
        expect(h.window.location.replace).toHaveBeenCalledWith(origin + "/word-auth/complete.html?state=" + state);
        expect(h.fetch).not.toHaveBeenCalled();
    });
    it.each(["", "?state=bad", `?state=${state}&state=${state}`])("rejects missing, invalid or duplicate state (%s)", async query => {
        const h = harness("login", query); h.start(); await flush();
        expect(h.window.location.replace).not.toHaveBeenCalled(); expect(h.fetch).not.toHaveBeenCalled();
    });
    it("establishes identity only after confirmation and sends no credentials or email", async () => {
        const h = harness("complete", `?state=${state}`); h.start(); await flush();
        expect(h.fetch).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" }));
        fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" })); await flush();
        expect(h.fetch.mock.calls.map(([path, init]) => [path, init.method])).toEqual([[origin + "/api/auth/cloudflare", "POST"], [origin + "/api/auth/session", "GET"]]);
        expect(h.fetch.mock.calls.every(([, init]) => init.mode === "cors" && init.redirect === "error" && init.credentials === "include")).toBe(true);
        const [raw, options] = h.office.context.ui.messageParent.mock.calls[0];
        expect(JSON.parse(raw)).toEqual({ type: "courtos:word:authenticated", state, userId: owner });
        expect(options).toEqual({ targetOrigin: origin });
        expect(h.fetch.mock.calls.every(([,init]) => init.body === undefined && init.headers === undefined)).toBe(true);
    });
    it("does not signal completion if the dialog session changes identity", async () => {
        const h = harness("complete", `?state=${state}`); h.fetch.mockResolvedValueOnce(json()).mockResolvedValueOnce(json(otherOwner)); h.start(); await flush();
        fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" })); await flush();
        expect(h.office.context.ui.messageParent).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("nicht bestätigt");
        expect(screen.getByRole("status")).toHaveTextContent("D3-KONTO");
    });
    it.each([
        { stage: "D1", responses: [new Response("private provider details", { status: 503 })], code: "HTTP503", calls: 1 },
        { stage: "D2", responses: [json(), new Response("private session details", { status: 401 })], code: "HTTP401", calls: 2 },
    ])("distinguishes $stage HTTP failure without returning a message or exposing response details", async ({ stage, responses, code, calls }) => {
        const h = harness("complete", `?state=${state}`);
        responses.forEach(response => h.fetch.mockResolvedValueOnce(response));
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" })); await flush();
        expect(h.fetch).toHaveBeenCalledTimes(calls);
        expect(screen.getByRole("status")).toHaveTextContent(`${stage}-${code}`);
        expect(screen.getByRole("status")).not.toHaveTextContent(/private|provider|session details/);
        expect(h.office.context.ui.messageParent).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Zugang in Word bestätigen" })).toBeEnabled();
        await flush(); expect(h.fetch).toHaveBeenCalledTimes(calls);
    });
    it("distinguishes Office callback failure from a rejected session without exposing host errors", async () => {
        const h = harness("complete", `?state=${state}`);
        h.office.context.ui.messageParent.mockImplementation(() => { throw new Error("private host session token"); });
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" })); await flush();
        expect(h.fetch).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("status")).toHaveTextContent("D4-RUECKGABE");
        expect(screen.getByRole("status")).not.toHaveTextContent("private host session token");
    });
});

describe("redacted Word authentication probe diagnostics", () => {
    it("keeps CORS-mode requests confined to the two fixed CourtOS endpoints", async () => {
        const h = harness("index");
        const boot = (h.window as typeof h.window & { CourtOSWordBoot: { authUser(method: string, path: string): Promise<string> } }).CourtOSWordBoot;
        for (const [method, path] of [
            ["POST", "https://attacker.example/api/auth/cloudflare"],
            ["POST", "//attacker.example/api/auth/cloudflare"],
            ["POST", "/api/auth/cloudflare?next=https://attacker.example"],
            ["GET", "/api/auth/cloudflare"],
            ["POST", "/api/auth/session"],
        ]) await expect(boot.authUser(method, path)).rejects.toThrow("Unsupported request");
        expect(h.fetch).not.toHaveBeenCalled();
    });
    it.each([
        ["HTTP403", () => new Response("secret response", { status: 403 })],
        ["HTTP_OTHER", () => new Response("secret response", { status: 418 })],
        ["MIME", () => new Response("<h1>private email</h1>", { headers: { "content-type": "text/html" } })],
        ["LENGTH", () => new Response("{}", { headers: { "content-type": "application/json", "content-length": "8193" } })],
        ["STREAM", () => ({ ok: true, headers: new Headers({ "content-type": "application/json" }), body: null })],
        ["UTF8", () => new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } })],
        ["JSON", () => new Response("private-email is not JSON", { headers: { "content-type": "application/json" } })],
        ["IDENTITY", () => new Response(JSON.stringify({ user: { id: "private-bad-id", email: "private-email" } }), { headers: { "content-type": "application/json" } })],
    ] as const)("reports pane %s using only an allowlisted code", async (code, response) => {
        const h = harness("index"); h.fetch.mockResolvedValue(response());
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Anmelden" })); callback(h); await flush();
        expect(screen.getByRole("status")).toHaveTextContent(`P1-${code}`);
        expect(screen.getByRole("status")).not.toHaveTextContent(/secret|private-email|private-bad-id|<h1>/);
        expect(h.window.location.replace).not.toHaveBeenCalled();
        expect(h.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    });
    it("distinguishes a fetch/redirect rejection from a body read failure without exposing either exception", async () => {
        const h = harness("complete", `?state=${state}`);
        h.fetch.mockRejectedValueOnce(new Error("private redirect cookie"));
        h.start(); await flush(); fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" })); await flush();
        expect(screen.getByRole("status")).toHaveTextContent("D1-NETWORK");
        expect(screen.getByRole("status")).not.toHaveTextContent("private redirect cookie");
        const reader = { read: vi.fn().mockRejectedValue(new Error("private transport details")), releaseLock: vi.fn() };
        h.fetch.mockResolvedValueOnce({ ok: true, headers: new Headers({ "content-type": "application/json" }), body: { getReader: () => reader } });
        fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" })); await flush();
        expect(screen.getByRole("status")).toHaveTextContent("D1-READ");
        expect(screen.getByRole("status")).not.toHaveTextContent("private transport details");
        expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    });
    it("reports a bounded request timeout separately and never retries it automatically", async () => {
        vi.useFakeTimers(); const h = harness("complete", `?state=${state}`);
        h.fetch.mockImplementation((_path, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("private abort details")))));
        h.start(); await vi.advanceTimersByTimeAsync(0);
        fireEvent.click(screen.getByRole("button", { name: "Zugang in Word bestätigen" }));
        await vi.advanceTimersByTimeAsync(10001);
        expect(screen.getByRole("status")).toHaveTextContent("D1-TIMEOUT");
        expect(screen.getByRole("status")).not.toHaveTextContent("private abort details");
        expect(h.fetch).toHaveBeenCalledTimes(1);
        expect(h.office.context.ui.messageParent).not.toHaveBeenCalled();
    });
});

describe("exact static route and manifest boundary", () => {
    it("keeps completion and API paths outside the exact public route list", () => {
        const routes = JSON.parse(readFileSync(resolve(root, "routes.json"), "utf8"));
        expect(Object.keys(routes.public_exact_paths).every(path => path.startsWith("/word-bootstrap/") && !path.includes("*") && !path.includes("complete"))).toBe(true);
        expect(Object.keys(routes.access_protected_exact_paths)).toEqual(["/word-auth/complete.html", "/word-auth/complete.js"]);
        for (const file of [...Object.values(routes.public_exact_paths), ...Object.values(routes.access_protected_exact_paths)] as string[]) expect(readFileSync(resolve(root, file)).length).toBeGreaterThan(0);
        const manifest = readFileSync(resolve(root, "../manifest.courtos-research.xml"), "utf8");
        expect(manifest).toContain(origin + "/word-bootstrap/index.html");
        expect(manifest).toContain(origin + "/word-bootstrap/icons/icon-64.png");
        expect(manifest).not.toContain("/word-assets/");
        const icon = readFileSync(resolve(root, "icons/icon-64.png"));
        expect([icon.readUInt32BE(16), icon.readUInt32BE(20)]).toEqual([64,64]);
    });
});
