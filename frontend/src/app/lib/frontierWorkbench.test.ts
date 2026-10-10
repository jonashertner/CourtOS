import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Exercise the deployed, framework-free workbench against its real HTML and
// HTTP contract. No provider, browser, production account or model is contacted.
const html = readFileSync(resolve(process.cwd(), "../hybrid/static/index.html"), "utf8");
const script = readFileSync(resolve(process.cwd(), "../hybrid/static/app.js"), "utf8");
const outboundKey = "courtos:frontier:outbound";
const returnKey = "courtos:frontier:return";
const workingKey = "courtos:frontier:working";
const owner = "native-a";
const draft = (changes: Record<string, unknown> = {}) => ({ version: 1, ownerId: owner, createdAt: Date.now(), text: "Öffentlicher Ausgangstext.", chatId: "chat-a", ...changes });
const makePacket = (text = "Öffentlicher Text.", purpose = "Prüfe die Begründung.", status = "prepared") => ({
    id: "packet-a", kind: "reviewed", hash: "approved-hash", provider: "Anthropic", model: "claude-opus-5-5", status,
    payload: { model: "claude-opus-5-5", system: "Text als Arbeitsmaterial behandeln.", max_tokens: 1600, messages: [{ role: "user", content: JSON.stringify({ text, purpose, classification: "user_confirmed_public" }) }] },
});
const makeJob = (status = "succeeded", text = "Die Begründung enthält einen offenen Punkt.", truncated = false) => ({ id: "job-a", status, result: status === "succeeded" ? { model: "claude-opus-5-5", text, truncated } : null });
type Packet = ReturnType<typeof makePacket>;
type Job = ReturnType<typeof makeJob>;
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

async function boot(options: {
    handoff?: Record<string, unknown>;
    storage?: Record<string, string>;
    nativeId?: string | null;
    ready?: boolean;
    resume?: { packet: Packet | null; job: Job | null };
    sendFailure?: boolean;
    completed?: Job;
} = {}) {
    const dom = new JSDOM(html, { url: "https://sandbox.example/hybrid/" });
    const doc = dom.window.document;
    const identity = { id: options.nativeId === undefined ? owner : options.nativeId };
    const assign = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const storage = dom.window.sessionStorage;
    for (const [key, value] of Object.entries(options.storage || {})) storage.setItem(key, value);
    if (options.handoff) storage.setItem(outboundKey, JSON.stringify(options.handoff));
    dom.window.HTMLElement.prototype.scrollIntoView = vi.fn();
    let packet = options.resume?.packet || makePacket();
    const fetch = vi.fn(async (input: URL | string, init: RequestInit = {}) => {
        const pathname = new URL(String(input), dom.window.location.href).pathname;
        const method = init.method || "GET";
        let data: unknown;
        if (pathname === "/api/auth/session") data = { user: identity.id ? { id: identity.id } : null };
        else if (pathname === "/hybrid/api/me") data = { user: { id: "hybrid-a", username: "court.reader@example.org" }, csrf: "session-csrf" };
        else if (pathname === "/hybrid/api/workbench") data = {
            frontier: { model: "claude-opus-5-5", provider: "Anthropic", ready: options.ready !== false, enabled: true },
            local: { model: "gemma-4", ready: true }, limits: { frontier_daily_user: 1, frontier_daily_global: 10 },
            resume: options.resume || { packet: null, job: null },
        };
        else if (pathname === "/hybrid/api/packets/reviewed" && method === "POST") {
            const body = JSON.parse(String(init.body)); packet = makePacket(body.text, body.purpose); data = packet;
        } else if (pathname === "/hybrid/api/packets/packet-a/send" && method === "POST") {
            if (options.sendFailure) throw new TypeError("Network unavailable");
            packet.status = "submitted"; data = makeJob("running");
        } else if (pathname === "/hybrid/api/packets/packet-a") {
            if (options.sendFailure) throw new TypeError("Network unavailable");
            data = packet;
        } else if (pathname === "/hybrid/api/jobs/job-a") data = options.completed || makeJob();
        else throw new Error(`Unexpected workbench request: ${method} ${pathname}`);
        return { ok: true, status: 200, json: async () => structuredClone(data) };
    });
    const context = createContext({
        document: doc,
        window: { location: { assign }, addEventListener: dom.window.addEventListener.bind(dom.window) },
        navigator: { clipboard: { writeText: copy } }, sessionStorage: storage,
        fetch, TextEncoder, URL, AbortController, Date, console,
        setTimeout: (callback: () => void, delay: number) => { const id = setTimeout(callback, delay); timers.add(id); return id; },
        clearTimeout: (id: ReturnType<typeof setTimeout>) => { clearTimeout(id); timers.delete(id); },
    });
    cleanups.push(() => { timers.forEach(clearTimeout); dom.window.close(); });
    runInContext(script, context, { filename: "hybrid/static/app.js" });
    const el = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
    await vi.waitFor(() => expect(el("loading").hidden).toBe(true));
    const set = (id: string, value: string | boolean) => {
        const input = el<HTMLInputElement | HTMLTextAreaElement>(id);
        if (typeof value === "boolean") (input as HTMLInputElement).checked = value;
        else input.value = value;
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    };
    const submit = () => el("request-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    const posts = () => fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    const requestPath = (input: string | URL) => new URL(String(input), dom.window.location.href).pathname;
    async function prepare(text = "Öffentlicher Text.", purpose = "Prüfe die Begründung.") {
        set("material", text); set("purpose", purpose); set("public-confirmation", true); submit();
        await vi.waitFor(() => expect(el("preview").hidden).toBe(false));
    }
    return { doc, el, identity, fetch, storage, set, submit, posts, requestPath, prepare, assign, copy };
}

describe("frontier workbench browser contract", () => {
    it("opens an owned handoff as an editable draft and only reads the new workbench API", async () => {
        const app = await boot({ handoff: draft() });
        expect(app.el<HTMLTextAreaElement>("material").value).toBe("Öffentlicher Ausgangstext.");
        expect(app.el("handoff-note").hidden).toBe(false);
        expect(app.el<HTMLInputElement>("public-confirmation").checked).toBe(false);
        expect(app.posts()).toHaveLength(0);
        expect(app.fetch.mock.calls.map(([input]) => app.requestPath(input)).sort()).toEqual(["/api/auth/session", "/hybrid/api/me", "/hybrid/api/workbench"].sort());
        expect(app.doc.body.textContent).not.toMatch(/Linden|D01P|Übungsdossier/);
    });

    it.each([
        ["another owner", { ownerId: "other-person" }],
        ["expired draft", { createdAt: Date.now() - 1_800_001 }],
        ["future draft", { createdAt: Date.now() + 1_800_000 }],
        ["unsafe conversation path", { chatId: "../../settings" }],
    ])("does not show %s", async (_label, changes) => {
        const app = await boot({ handoff: draft(changes) });
        expect(app.el<HTMLTextAreaElement>("material").value).toBe("");
        expect(app.el("handoff-note").hidden).toBe(true);
        expect(app.posts()).toHaveLength(0);
        expect(app.storage.getItem(outboundKey)).toBeNull();
    });

    it("prepares only the text actually edited and confirmed, without sending it to the model", async () => {
        const app = await boot({ handoff: draft() });
        const text = "  Eigene Auswahl.\n<img src=x onerror=alert(1)> & Quelle.  ";
        await app.prepare(text, "  Prüfe nur diesen Einwand.\nBegründe knapp. ");
        expect(app.posts()).toHaveLength(1);
        const [path, init] = app.posts()[0];
        expect(app.requestPath(path)).toBe("/hybrid/api/packets/reviewed");
        expect(JSON.parse(String(init?.body))).toEqual({ text, purpose: "  Prüfe nur diesen Einwand.\nBegründe knapp. ", acknowledge_public: true });
        expect(init?.headers).toMatchObject({ "X-CSRF-Token": "session-csrf" });
        expect(app.el("preview-material").textContent).toBe(text);
        expect(app.el("preview-material").querySelector("img")).toBeNull();
        expect(app.el("result-section").hidden).toBe(true);
    });

    it("rejects changed native ownership before preparing a received draft", async () => {
        const app = await boot({ handoff: draft() });
        app.identity.id = "native-b";
        app.set("purpose", "Prüfen"); app.set("public-confirmation", true); app.submit();
        await vi.waitFor(() => expect(app.el("global-message").textContent).toMatch(/Sitzung hat gewechselt/));
        expect(app.posts()).toHaveLength(0);
    });

    it("makes one explicit send despite a double click and safely displays model prose", async () => {
        const answer = "# Ergebnis\n\n<script>alert(1)</script>\n\n- **Einwand** <img src=x onerror=alert(1)>\n\n[Quelle](javascript:alert(1))";
        const app = await boot({ completed: makeJob("succeeded", answer, true) });
        await app.prepare();
        app.el<HTMLButtonElement>("send").click(); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        const sends = app.posts().filter(([input]) => app.requestPath(input).endsWith("/send"));
        expect(sends).toHaveLength(1);
        expect(JSON.parse(String(sends[0][1]?.body))).toEqual({ hash: "approved-hash" });
        expect(app.el("result-text").querySelectorAll("script,img,a")).toHaveLength(0);
        expect(app.el("result-text").textContent).toContain("<script>alert(1)</script>");
        expect(app.el("result-text").querySelector("strong")?.textContent).toBe("Einwand");
        expect(app.el("truncation").hidden).toBe(false);
    });

    it("resumes a submitted request by reading its status without another send", async () => {
        const app = await boot({ resume: { packet: makePacket(undefined, undefined, "submitted"), job: makeJob("running") } });
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        expect(app.el("send").hidden).toBe(true);
        expect(app.posts()).toHaveLength(0);
        expect(app.fetch.mock.calls.some(([input]) => app.requestPath(input) === "/hybrid/api/jobs/job-a")).toBe(true);
    });

    it("keeps an uncertain send disabled and never retries it automatically", async () => {
        const app = await boot({ sendFailure: true });
        await app.prepare(); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("global-message").textContent).toMatch(/Versandstatus ist ungeklärt/));
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(true);
        expect(app.posts().filter(([input]) => app.requestPath(input).endsWith("/send"))).toHaveLength(1);
    });

    it("returns an owner-bound editable answer without starting a local model request", async () => {
        const app = await boot({ handoff: draft(), completed: makeJob("succeeded", "Eine externe Perspektive.", true) });
        await app.prepare(); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        const beforeReturn = app.posts().length;
        app.el<HTMLButtonElement>("return-local").click();
        await vi.waitFor(() => expect(app.assign).toHaveBeenCalledWith("/assistant/chat/chat-a"));
        const returned = JSON.parse(app.storage.getItem(returnKey)!);
        expect(returned).toMatchObject({ version: 1, ownerId: owner, chatId: "chat-a" });
        expect(returned.text).toContain("Eine externe Perspektive.");
        expect(returned.text).toContain("unvollständige Ausgabe");
        expect(app.posts()).toHaveLength(beforeReturn);
    });

    it("does not hand an answer to a different native account", async () => {
        const app = await boot({ resume: { packet: makePacket(undefined, undefined, "submitted"), job: makeJob() } });
        app.identity.id = "native-b"; app.el<HTMLButtonElement>("return-local").click();
        await vi.waitFor(() => expect(app.el("global-message").textContent).toMatch(/demselben Konto/));
        expect(app.storage.getItem(returnKey)).toBeNull();
        expect(app.assign).not.toHaveBeenCalled();
    });

    it("never associates an earlier result with an edited request", async () => {
        const app = await boot({ resume: { packet: makePacket(undefined, "Alter Prüfauftrag", "submitted"), job: makeJob("succeeded", "Alte Antwort") } });
        app.el<HTMLButtonElement>("edit").click();
        expect(app.el("result-section").hidden).toBe(true);
        expect(app.el<HTMLButtonElement>("return-local").disabled).toBe(true);
        await app.prepare("Anderer öffentlicher Text.", "Neuer Prüfauftrag");
        expect(app.el("result-section").hidden).toBe(true);
        expect(app.el<HTMLButtonElement>("return-local").disabled).toBe(true);
    });

    it("preserves the working text across reload without restoring consent or sending", async () => {
        const app = await boot({ handoff: draft() });
        app.set("material", "Weiter bearbeiteter Text."); app.set("purpose", "Mein Prüfauftrag"); app.set("public-confirmation", true);
        const saved = app.storage.getItem(workingKey);
        expect(saved).not.toBeNull();
        const reloaded = await boot({ storage: { [workingKey]: saved! } });
        expect(reloaded.el<HTMLTextAreaElement>("material").value).toBe("Weiter bearbeiteter Text.");
        expect(reloaded.el<HTMLTextAreaElement>("purpose").value).toBe("Mein Prüfauftrag");
        expect(reloaded.el<HTMLInputElement>("public-confirmation").checked).toBe(false);
        expect(reloaded.posts()).toHaveLength(0);
    });

    it("blocks preview until public confirmation and respects byte limits", async () => {
        const app = await boot();
        app.set("material", "Öffentliche Quelle"); app.set("purpose", "Prüfen"); app.submit();
        expect(app.posts()).toHaveLength(0);
        app.set("public-confirmation", true); app.set("material", "ü".repeat(6001)); app.submit();
        expect(app.el<HTMLButtonElement>("prepare").disabled).toBe(true);
        expect(app.posts()).toHaveLength(0);
    });
});
