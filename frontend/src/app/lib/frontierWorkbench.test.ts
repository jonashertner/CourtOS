import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { TextEncoder } from "node:util";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

// Exercise the deployed, framework-free workbench against its real HTML and
// HTTP contract. No provider, browser, production account or model is contacted.
const html = readFileSync(resolve(process.cwd(), "../hybrid/static/index.html"), "utf8");
const localeScript = readFileSync(resolve(process.cwd(), "../hybrid/static/i18n.js"), "utf8");
const script = readFileSync(resolve(process.cwd(), "../hybrid/static/app.js"), "utf8");
const outboundKey = "courtos:frontier:outbound";
const returnKey = "courtos:frontier:return";
const workingKey = "courtos:frontier:working";
const purchaseKey = "courtos:frontier:purchase";
const owner = "native-a";
const draft = (changes: Record<string, unknown> = {}) => ({ version: 1, ownerId: owner, createdAt: Date.now(), text: "Öffentlicher Ausgangstext.", chatId: "chat-a", ...changes });
const makePacket = (text = "Öffentlicher Text.", purpose = "Prüfe die Begründung.", status = "prepared") => ({
    id: "packet-a", kind: "reviewed", hash: "approved-hash", provider: "Anthropic", model: "claude-opus-5-5", status,
    payload: { model: "claude-opus-5-5", system: "Text als Arbeitsmaterial behandeln.", max_tokens: 1600, messages: [{ role: "user", content: JSON.stringify({ text, purpose, classification: "user_confirmed_public" }) }] },
});
const makeJob = (status = "succeeded", text = "Die Begründung enthält einen offenen Punkt.", truncated = false, extra: Record<string, unknown> = {}) => ({ id: "job-a", status, result: status === "succeeded" ? { model: "claude-opus-5-5", text, truncated, ...extra } : null });
const makeBilling = (changes: Record<string, unknown> = {}) => ({
    required: true, enabled: true, currency: "chf", balance_micros: 20_000_000, held_micros: 12_345, available_micros: 19_987_655,
    tariff: { version: "chf-v1", model: "claude-opus-5-5", input_micros_per_million: 12_000_000, output_micros_per_million: 60_000_000, input_policy: "all_reported_input_tokens_same_rate", vat_included: true },
    topups_minor: [2000, 5000], purchases: [], ...changes,
});
const makeQuote = (changes: Record<string, unknown> = {}) => ({
    quote_id: "quote-a", currency: "chf", max_charge_micros: 108_345, tariff_version: "chf-v1",
    expires_at: new Date(Date.now() + 300_000).toISOString(), input_allowance_tokens: 1028, max_output_tokens: 1600, vat_included: true, ...changes,
});
type Packet = ReturnType<typeof makePacket>;
type Job = ReturnType<typeof makeJob>;
const cleanups: (() => void)[] = [];
let uuidSequence = 0;
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

async function boot(options: {
    handoff?: Record<string, unknown>;
    storage?: Record<string, string>;
    preferences?: Record<string, string>;
    languageHint?: string;
    blockedPreferences?: boolean;
    nativeId?: string | null;
    ready?: boolean;
    resume?: { packet: Packet | null; job: Job | null };
    sendFailure?: boolean;
    completed?: Job;
    workbenchBilling?: { required: boolean; enabled: boolean };
    billing?: ReturnType<typeof makeBilling>;
    quotes?: ReturnType<typeof makeQuote>[];
    billingFailure?: boolean;
    quoteFailure?: boolean;
    checkoutReplies?: ({ checkout_url: string; purchase_id?: string } | Error)[];
    clock?: number;
} = {}) {
    const dom = new JSDOM(html, { url: "https://sandbox.example/hybrid/" });
    const doc = dom.window.document;
    const identity = { id: options.nativeId === undefined ? owner : options.nativeId };
    const assign = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
    const timers = new Map<ReturnType<typeof setTimeout>, { callback: () => void; at: number }>();
    let clock = options.clock ?? Date.now();
    class TestDate extends Date { static now() { return clock; } }
    let quoteNumber = 0, checkoutNumber = 0;
    const storage = dom.window.sessionStorage;
    for (const [key, value] of Object.entries(options.preferences || {})) dom.window.localStorage.setItem(key, value);
    const preferences = options.blockedPreferences ? { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } : dom.window.localStorage;
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
            ...(options.workbenchBilling ? { billing: options.workbenchBilling } : {}),
        };
        else if (pathname === "/hybrid/api/billing" && method === "GET") {
            if (options.billingFailure) throw new TypeError("Billing unavailable");
            data = options.billing || makeBilling();
        } else if (pathname === "/hybrid/api/billing/checkout" && method === "POST") {
            const reply = options.checkoutReplies?.[checkoutNumber++];
            if (reply instanceof Error) throw reply;
            const body = JSON.parse(String(init.body));
            data = reply ? { purchase_id: body.purchase_id, ...reply } : { checkout_url: "https://checkout.stripe.com/c/pay/synthetic", purchase_id: body.purchase_id };
        }
        else if (pathname === "/hybrid/api/packets/reviewed" && method === "POST") {
            const body = JSON.parse(String(init.body)); packet = makePacket(body.text, body.purpose); data = packet;
        } else if (pathname === "/hybrid/api/packets/packet-a/quote" && method === "POST") {
            if (options.quoteFailure) throw new TypeError("Quote unavailable");
            const quotes = options.quotes || [makeQuote({ expires_at: new Date(clock + 300_000).toISOString() })];
            data = quotes[Math.min(quoteNumber++, quotes.length - 1)];
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
        window: { location: { assign, href: dom.window.location.href }, addEventListener: dom.window.addEventListener.bind(dom.window) },
        navigator: { clipboard: { writeText: copy }, languages: [options.languageHint || "de-CH"] }, sessionStorage: storage, localStorage: preferences,
        fetch, TextEncoder, URL, AbortController, Date: TestDate, console,
        crypto: { randomUUID: vi.fn(() => `00000000-0000-4000-8000-${String(++uuidSequence).padStart(12, "0")}`) },
        setTimeout: (callback: () => void, delay: number) => { const id = setTimeout(() => { timers.delete(id); callback(); }, delay); timers.set(id, { callback, at: clock + delay }); return id; },
        clearTimeout: (id: ReturnType<typeof setTimeout>) => { clearTimeout(id); timers.delete(id); },
    });
    cleanups.push(() => { timers.forEach((_, id) => clearTimeout(id)); dom.window.close(); });
    runInContext(localeScript, context, { filename: "hybrid/static/i18n.js" });
    runInContext(script, context, { filename: "hybrid/static/app.js" });
    const el = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
    await vi.waitFor(() => expect(el("loading").hidden).toBe(true));
    const set = (id: string, value: string | boolean) => {
        const input = el<HTMLInputElement | HTMLTextAreaElement>(id);
        if (typeof value === "boolean") (input as HTMLInputElement).checked = value;
        else input.value = value;
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
        if (typeof value === "boolean") input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    };
    const submit = () => el("request-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    const posts = () => fetch.mock.calls.filter(([, init]) => init?.method === "POST");
    const requestPath = (input: string | URL) => new URL(String(input), dom.window.location.href).pathname;
    async function prepare(text = "Öffentlicher Text.", purpose = "Prüfe die Begründung.") {
        set("material", text); set("purpose", purpose); set("public-confirmation", true); submit();
        await vi.waitFor(() => expect(el("preview").hidden).toBe(false));
    }
    const advanceClock = async (milliseconds: number) => {
        clock += milliseconds;
        for (const [id, timer] of [...timers]) if (timer.at <= clock) { clearTimeout(id); timers.delete(id); timer.callback(); }
        await Promise.resolve();
    };
    return { doc, el, identity, fetch, storage, preferences: dom.window.localStorage, chooseLanguage: (value: string) => { el<HTMLSelectElement>("ui-language").value = value; el("ui-language").dispatchEvent(new dom.window.Event("change", { bubbles: true })); }, set, submit, posts, requestPath, prepare, assign, copy, advanceClock };
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
        expect(app.el("preview").querySelector(".processing-note")?.textContent).toBe("Freigegeben · Externer Auftrag beauftragt");
        expect(app.posts()).toHaveLength(0);
        expect(app.fetch.mock.calls.some(([input]) => app.requestPath(input) === "/hybrid/api/jobs/job-a")).toBe(true);
    });

    it("keeps an uncertain send disabled and never retries it automatically", async () => {
        const app = await boot({ sendFailure: true });
        await app.prepare(); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("global-message").textContent).toMatch(/Versandstatus ist ungeklärt/));
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(true);
        expect(app.posts().filter(([input]) => app.requestPath(input).endsWith("/send"))).toHaveLength(1);
        expect(app.el("preview").querySelector(".processing-note")?.textContent).toBe("Übermittlungsstatus wird geprüft");
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
        expect(app.el("preview").querySelector(".processing-note")?.textContent).toBe("Zur Freigabe · Noch nicht an Anthropic gesendet");
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

describe("frontier workbench explicit CHF billing contract", () => {
    const enabled = { required: true, enabled: true };
    const requestsTo = (app: Awaited<ReturnType<typeof boot>>, path: string) => app.fetch.mock.calls.filter(([input]) => app.requestPath(input) === "/hybrid/api/" + path);
    async function prepared(app: Awaited<ReturnType<typeof boot>>) {
        await app.prepare();
        await vi.waitFor(() => expect(app.el("quote-section").hidden).toBe(false));
        await vi.waitFor(() => expect(app.el("quote-amount").textContent).toMatch(/0\.108345/));
    }

    it.each([undefined, { required: false, enabled: true }])("makes no billing or checkout requests when workbench billing is not required (%j)", async workbenchBilling => {
        const app = await boot({ workbenchBilling });
        await app.prepare();
        expect(app.fetch.mock.calls.some(([input]) => /\/billing(?:\/|$)|\/quote$/.test(app.requestPath(input)))).toBe(false);
        expect(app.el("billing-panel").hidden).toBe(true);
        app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        const send = requestsTo(app, "packets/packet-a/send")[0];
        expect(JSON.parse(String(send[1]?.body))).toEqual({ hash: "approved-hash" });
    });

    it("reads the required wallet without initiating purchase, quote or model calls", async () => {
        const app = await boot({ workbenchBilling: enabled });
        await vi.waitFor(() => expect(app.el("billing-balance").textContent).toMatch(/19\.987655/));
        expect(app.el("billing-held").textContent).toMatch(/0\.012345/);
        expect(app.el("billing-tariff").textContent).toMatch(/12/);
        expect(app.el("billing-tariff").textContent).toMatch(/60/);
        expect(app.el("billing-tariff").textContent).toMatch(/MwSt|Mehrwertsteuer/i);
        expect(app.el("topup-20").textContent).toMatch(/20/);
        expect(app.el("topup-50").textContent).toMatch(/50/);
        expect(requestsTo(app, "billing")).toHaveLength(1);
        expect(app.posts()).toHaveLength(0);
        expect(app.assign).not.toHaveBeenCalled();
    });

    it.each(["disabled", "wallet failure", "quote failure"])("fails closed for required billing with %s", async failure => {
        const app = await boot({ workbenchBilling: failure === "disabled" ? { required: true, enabled: false } : enabled,
            ready: failure !== "disabled", billing: makeBilling({ enabled: failure !== "disabled" }),
            billingFailure: failure === "wallet failure", quoteFailure: failure === "quote failure" });
        app.set("material", "Öffentlicher Text."); app.set("purpose", "Prüfen"); app.set("public-confirmation", true); app.submit();
        await new Promise(resolve => setTimeout(resolve, 10));
        const consent = app.el<HTMLInputElement>("quote-consent");
        if (consent) app.set("quote-consent", true);
        app.el<HTMLButtonElement>("send").click();
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
        expect(app.assign).not.toHaveBeenCalled();
    });

    it("obtains a quote for the exact prepared hash and requires separate unchecked cost consent", async () => {
        const app = await boot({ workbenchBilling: enabled }); await prepared(app);
        const quotes = requestsTo(app, "packets/packet-a/quote");
        expect(quotes).toHaveLength(1);
        expect(JSON.parse(String(quotes[0][1]?.body))).toEqual({ hash: "approved-hash" });
        expect(quotes[0][1]?.headers).toMatchObject({ "X-CSRF-Token": "session-csrf" });
        expect(app.el<HTMLInputElement>("quote-consent").checked).toBe(false);
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(true);
        app.el<HTMLButtonElement>("send").click();
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
        expect(app.el("quote-section").textContent).toMatch(/MwSt|Mehrwertsteuer/i);
    });

    it("sends the accepted integer ceiling, quote and CHF once despite a double click", async () => {
        const app = await boot({ workbenchBilling: enabled }); await prepared(app);
        app.set("quote-consent", true);
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(false);
        app.el<HTMLButtonElement>("send").click(); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        const sends = requestsTo(app, "packets/packet-a/send");
        expect(sends).toHaveLength(1);
        expect(JSON.parse(String(sends[0][1]?.body))).toEqual({ hash: "approved-hash", billing: { quote_id: "quote-a", max_charge_micros: 108_345, currency: "chf" } });
    });

    it.each([
        ["foreign currency", { currency: "eur" }], ["fractional microCHF", { max_charge_micros: 1.5 }],
        ["empty charge ceiling", { max_charge_micros: 0 }],
        ["unconfirmed VAT", { vat_included: undefined }], ["invalid expiry", { expires_at: "not-a-date" }],
        ["expired quote", { expires_at: "2020-01-01T00:00:00Z" }],
    ])("refuses a quote with %s instead of accepting cost consent", async (_label, changes) => {
        const app = await boot({ workbenchBilling: enabled, quotes: [makeQuote(changes)] }); await app.prepare();
        await vi.waitFor(() => expect(app.el("quote-expires").textContent).toMatch(/nicht berechnet/));
        expect(app.el<HTMLInputElement>("quote-consent").disabled).toBe(true);
        app.set("quote-consent", true); app.el<HTMLButtonElement>("send").click();
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
    });

    it("does not permit a confirmed quote exceeding available funds", async () => {
        const app = await boot({ workbenchBilling: enabled, billing: makeBilling({ available_micros: 108_344 }) });
        await prepared(app); app.set("quote-consent", true);
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(true);
        expect(app.el("quote-funds").hidden).toBe(false);
        expect(app.el("quote-funds").textContent).toMatch(/Guthaben reicht.*nicht aus/);
        expect(app.el("quote-funds").querySelector("a")?.getAttribute("href")).toBe("#billing-panel");
        app.el<HTMLButtonElement>("send").click();
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
    });

    it("blocks paid actions for a blocked wallet even when balance and a prepared quote are present", async () => {
        const app = await boot({ workbenchBilling: enabled, billing: makeBilling({ blocked: true }), resume: { packet: makePacket(), job: null } });
        expect(app.el("billing-status").textContent).toMatch(/geprüft.*Support/);
        for (const id of ["topup-20", "topup-50", "send"]) expect(app.el<HTMLButtonElement>(id).disabled).toBe(true);
        app.set("quote-consent", true);
        app.el<HTMLButtonElement>("send").click(); app.el<HTMLButtonElement>("topup-20").click();
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
        expect(requestsTo(app, "billing/checkout")).toHaveLength(0);
        app.el<HTMLButtonElement>("edit").click();
        app.set("public-confirmation", true); app.submit();
        expect(app.el<HTMLButtonElement>("prepare").disabled).toBe(true);
        expect(requestsTo(app, "packets/reviewed")).toHaveLength(0);
    });

    it("expires a quote, removes consent and permits another send only after explicit renewal and new consent", async () => {
        const now = Date.now();
        const app = await boot({ workbenchBilling: enabled, clock: now, quotes: [makeQuote({ expires_at: new Date(now + 1000).toISOString() }), makeQuote({ quote_id: "quote-b", expires_at: new Date(now + 300_000).toISOString() })] });
        await prepared(app); app.set("quote-consent", true);
        await app.advanceClock(1001);
        await vi.waitFor(() => expect(app.el<HTMLButtonElement>("send").disabled).toBe(true));
        expect(app.el<HTMLInputElement>("quote-consent").checked).toBe(false);
        expect(requestsTo(app, "packets/packet-a/quote")).toHaveLength(1);
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
        app.el<HTMLButtonElement>("refresh-quote").click();
        await vi.waitFor(() => expect(requestsTo(app, "packets/packet-a/quote")).toHaveLength(2));
        await vi.waitFor(() => expect(app.el<HTMLButtonElement>("refresh-quote").disabled).toBe(false));
        expect(requestsTo(app, "packets/reviewed")).toHaveLength(1);
        expect(requestsTo(app, "packets/packet-a/quote").map(([, init]) => JSON.parse(String(init?.body)))).toEqual([{ hash: "approved-hash" }, { hash: "approved-hash" }]);
        expect(app.el<HTMLInputElement>("quote-consent").checked).toBe(false);
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(true);
        app.set("quote-consent", true); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(1));
        expect(JSON.parse(String(requestsTo(app, "packets/packet-a/send")[0][1]?.body)).billing.quote_id).toBe("quote-b");
    });

    it("retires accepted cost consent so its old expiry cannot appear above a completed receipt", async () => {
        const now = Date.now();
        const app = await boot({ workbenchBilling: enabled, clock: now, quotes: [makeQuote({ expires_at: new Date(now + 1000).toISOString() })] });
        await prepared(app); app.set("quote-consent", true); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        expect(app.el("quote-section").hidden).toBe(true);
        expect(app.el<HTMLInputElement>("quote-consent").checked).toBe(false);
        await app.advanceClock(1001);
        expect(app.el("quote-section").hidden).toBe(true);
        expect(app.el("quote-expires").textContent).not.toMatch(/abgelaufen/);
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(1);
    });

    it("does not carry accepted cost consent into edited material or a resumed preview", async () => {
        const app = await boot({ workbenchBilling: enabled }); await prepared(app); app.set("quote-consent", true);
        app.el<HTMLButtonElement>("edit").click();
        await prepared(app);
        expect(app.el<HTMLInputElement>("quote-consent").checked).toBe(false);
        expect(app.el<HTMLButtonElement>("send").disabled).toBe(true);
        const reloaded = await boot({ workbenchBilling: enabled, resume: { packet: makePacket(), job: null } });
        await vi.waitFor(() => expect(reloaded.el("preview").hidden).toBe(false));
        expect(reloaded.el<HTMLInputElement>("quote-consent").checked).toBe(false);
        expect(requestsTo(reloaded, "packets/packet-a/send")).toHaveLength(0);
    });

    it("renders actual settlement and released hold with exact microCHF precision and VAT disclosure", async () => {
        const billing = { currency: "chf", charged_micros: 12_345, reserved_micros: 108_345, released_micros: 96_000, tariff_version: "chf-v1", input_tokens: 200, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, vat_included: true };
        const app = await boot({ workbenchBilling: enabled, completed: makeJob("succeeded", "Prüfbarer Entwurf.", false, { billing }) });
        await prepared(app); app.set("quote-consent", true); app.el<HTMLButtonElement>("send").click();
        await vi.waitFor(() => expect(app.el("result").hidden).toBe(false));
        expect(app.el("billing-result").hidden).toBe(false);
        expect(app.el("billing-result").textContent).toMatch(/0\.012345/);
        expect(app.el("billing-result").textContent).toMatch(/0\.096/);
        expect(app.el("billing-result").textContent).toMatch(/MwSt|Mehrwertsteuer/i);
        expect(app.el("billing-result").textContent).not.toMatch(/CHF\s*12[’' ]?345/);
    });

    it("does not invent an inclusive-VAT receipt when settlement VAT evidence is missing", async () => {
        const billing = { currency: "chf", charged_micros: 12_345, reserved_micros: 108_345, released_micros: 96_000, tariff_version: "chf-v1" };
        const app = await boot({ workbenchBilling: enabled, resume: { packet: makePacket(undefined, undefined, "submitted"), job: makeJob("succeeded", "Antwort", false, { billing }) } });
        expect(app.el("billing-result").textContent).not.toMatch(/inklusive.*MwSt/i);
        expect(app.el("billing-result").textContent).toMatch(/abgeglichen|prüfen|ungeklärt/i);
    });

    it("shows a failed job's zero charge and released reservation from the actual top-level receipt", async () => {
        const failed = { ...makeJob("failed"), billing: { currency: "chf", charged_micros: 0, reserved_micros: 108_345, released_micros: 108_345, tariff_version: "chf-v1", vat_included: true } };
        const app = await boot({ workbenchBilling: enabled, resume: { packet: makePacket(undefined, undefined, "submitted"), job: failed } });
        expect(app.el("result").hidden).toBe(true);
        expect(app.el("billing-result").textContent).toMatch(/CHF 0\.00 abgerechnet/);
        expect(app.el("billing-result").textContent).toMatch(/CHF 0\.108345 freigegeben/);
        expect(requestsTo(app, "packets/packet-a/send")).toHaveLength(0);
    });

    it("starts a CHF20 or CHF50 checkout only on an explicit action with a UUID purchase key", async () => {
        const app = await boot({ workbenchBilling: enabled });
        await vi.waitFor(() => expect(app.el<HTMLButtonElement>("topup-20").disabled).toBe(false));
        expect(requestsTo(app, "billing/checkout")).toHaveLength(0);
        app.el<HTMLButtonElement>("topup-20").click(); app.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(app.assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/synthetic"));
        const checkouts = requestsTo(app, "billing/checkout"); expect(checkouts).toHaveLength(1);
        expect(JSON.parse(String(checkouts[0][1]?.body))).toEqual({ purchase_id: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/), amount_minor: 2000 });
        expect(checkouts[0][1]?.headers).toMatchObject({ "X-CSRF-Token": "session-csrf" });
        const fifty = await boot({ workbenchBilling: enabled }); fifty.el<HTMLButtonElement>("topup-50").click();
        await vi.waitFor(() => expect(requestsTo(fifty, "billing/checkout")).toHaveLength(1));
        expect(JSON.parse(String(requestsTo(fifty, "billing/checkout")[0][1]?.body)).amount_minor).toBe(5000);
    });

    it("preserves a checkout purchase key across an uncertain response and reload without automatic retry", async () => {
        const app = await boot({ workbenchBilling: enabled, checkoutReplies: [new TypeError("Uncertain network outcome")] });
        app.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(requestsTo(app, "billing/checkout")).toHaveLength(1));
        await vi.waitFor(() => expect(app.el<HTMLButtonElement>("topup-20").disabled).toBe(false));
        const first = JSON.parse(String(requestsTo(app, "billing/checkout")[0][1]?.body));
        const saved = app.storage.getItem(purchaseKey); expect(saved).not.toBeNull();
        expect(app.assign).not.toHaveBeenCalled();
        const reloaded = await boot({ workbenchBilling: enabled, storage: { [purchaseKey]: saved! } });
        expect(requestsTo(reloaded, "billing/checkout")).toHaveLength(0);
        expect(reloaded.assign).not.toHaveBeenCalled();
        reloaded.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(requestsTo(reloaded, "billing/checkout")).toHaveLength(1));
        expect(JSON.parse(String(requestsTo(reloaded, "billing/checkout")[0][1]?.body))).toEqual(first);
    });

    it("never resumes a pending checkout purchase belonging to another account", async () => {
        const id = "abcdef01-0000-4000-8000-000000000001";
        const app = await boot({ workbenchBilling: enabled, storage: { [purchaseKey]: JSON.stringify({ owner: "hybrid-other", amount: 2000, id, createdAt: Date.now() }) } });
        expect(requestsTo(app, "billing/checkout")).toHaveLength(0);
        app.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(requestsTo(app, "billing/checkout")).toHaveLength(1));
        expect(JSON.parse(String(requestsTo(app, "billing/checkout")[0][1]?.body)).purchase_id).not.toBe(id);
    });

    it("retains an unresolved checkout key beyond 24 hours rather than creating a second purchase", async () => {
        const now = Date.now(), id = "abcdef01-0000-4000-8000-000000000001";
        const saved = JSON.stringify({ owner: "hybrid-a", amount: 2000, id, createdAt: now - 3 * 86_400_000 });
        const app = await boot({ workbenchBilling: enabled, clock: now, storage: { [purchaseKey]: saved }, billing: makeBilling({ purchases: [] }) });
        expect(requestsTo(app, "billing/checkout")).toHaveLength(0);
        expect(app.storage.getItem(purchaseKey)).toBe(saved);
        app.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(requestsTo(app, "billing/checkout")).toHaveLength(1));
        expect(JSON.parse(String(requestsTo(app, "billing/checkout")[0][1]?.body))).toEqual({ purchase_id: id, amount_minor: 2000 });
    });

    it("rejects a Stripe URL associated with a different returned purchase ID", async () => {
        const app = await boot({ workbenchBilling: enabled, checkoutReplies: [{ checkout_url: "https://checkout.stripe.com/c/pay/synthetic", purchase_id: "different-purchase" }] });
        app.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(app.el("global-message").textContent).toMatch(/nicht geöffnet/));
        expect(app.assign).not.toHaveBeenCalled();
    });

    it.each(["http://checkout.stripe.com/c/pay/x", "https://checkout.stripe.com.attacker.example/pay", "https://checkout.stripe.com@attacker.example/pay", "https://user:password@checkout.stripe.com/pay", "https://checkout.stripe.com:444/pay", "javascript:alert(1)"])("refuses untrusted checkout navigation: %s", async checkout_url => {
        const app = await boot({ workbenchBilling: enabled, checkoutReplies: [{ checkout_url }] });
        app.el<HTMLButtonElement>("topup-20").click();
        await vi.waitFor(() => expect(requestsTo(app, "billing/checkout")).toHaveLength(1));
        await vi.waitFor(() => expect(app.el<HTMLButtonElement>("topup-20").disabled).toBe(false));
        expect(app.assign).not.toHaveBeenCalled();
    });
});

describe("frontier interface language isolation", () => {
    it("identifies server and external provider without country labels in every language", async () => {
        const app = await boot();
        const calls = app.fetch.mock.calls.length;
        for (const language of ["de", "fr", "it", "en"]) {
            app.chooseLanguage(language);
            expect(app.doc.body.textContent).not.toMatch(/Deutschland|Germany|Allemagne|Germania/i);
            expect(app.doc.querySelector(".processing-local")?.textContent).toContain("CourtOS");
            expect(app.doc.body.textContent).toContain("Anthropic");
        }
        expect(app.fetch).toHaveBeenCalledTimes(calls);
        expect(app.posts()).toHaveLength(0);
    });
    const preference = (ownerId: string, locale: string) => JSON.stringify({version:1,ownerId,locale});
    const key = (id: string) => `courtos:ui-language:v1:account:${encodeURIComponent(id)}`;
    it("uses only this native account preference, with safe browser-hint fallback", async () => {
        const app = await boot({preferences:{[key(owner)]:preference(owner,"fr"),[key("native-b")]:preference("native-b","it")}});
        expect(app.doc.documentElement.lang).toBe("fr-CH");
        expect(app.el("prepare").textContent).toContain("Vérifier la demande");
        expect(app.doc.querySelector("a[data-guide]")?.getAttribute("href")).toBe("/guide/fr.html");
        const other = await boot({nativeId:"native-b",preferences:{[key(owner)]:preference(owner,"fr")},languageHint:"it-CH"});
        expect(other.doc.documentElement.lang).toBe("it-CH");
        const forged = await boot({preferences:{[key(owner)]:preference("native-b","fr")}});
        expect(forged.doc.documentElement.lang).toBe("de-CH");
    });
    it("changes only visible copy, leaving exact text, preview, costs and approval untouched with no request", async () => {
        const app = await boot({workbenchBilling:{required:true,enabled:true}});
        await app.prepare("Auftrag · Antwort kopieren · raw source <x>","Prüfe exakt diese Wörter.");
        await vi.waitFor(() => expect(app.el<HTMLInputElement>("quote-consent").disabled).toBe(false));
        app.set("quote-consent",true);
        const calls=app.fetch.mock.calls.length, preview=app.el("preview-json").textContent, amount=app.el("quote-amount").textContent;
        app.chooseLanguage("en");
        expect(app.doc.documentElement.lang).toBe("en");
        expect(app.el("send").textContent).toContain("Send to Anthropic");
        expect(app.el("preview-material").textContent).toBe("Auftrag · Antwort kopieren · raw source <x>");
        expect(app.el("preview-purpose").textContent).toBe("Prüfe exakt diese Wörter.");
        expect(app.el("preview-json").textContent).toBe(preview);
        expect(app.el("quote-amount").textContent).toBe(amount);
        expect(app.el<HTMLInputElement>("quote-consent").checked).toBe(true);
        expect(app.fetch).toHaveBeenCalledTimes(calls);
        expect(app.assign).not.toHaveBeenCalled();
        expect(JSON.parse(app.preferences.getItem(key(owner))!)).toEqual({version:1,ownerId:owner,locale:"en"});
        expect(app.doc.querySelector("a[data-guide]")?.textContent).toBe("Workbook (German)");
        expect(app.doc.querySelector("a[data-guide]")?.getAttribute("href")).toBe("/guide/de.html");
    });
    it("never translates result prose, triggers a retry or blocks work when preference storage fails", async () => {
        const original = "Antwort kopieren\n\nAuftrag · Das erhält Anthropic.";
        const app=await boot({blockedPreferences:true,resume:{packet:makePacket(undefined,undefined,"submitted"),job:makeJob("succeeded",original)}});
        const calls=app.fetch.mock.calls.length, before=app.el("result-text").textContent;
        app.chooseLanguage("it");
        expect(app.doc.documentElement.lang).toBe("it-CH");
        expect(app.el("result-text").textContent).toBe(before);
        expect(app.el("copy").textContent).toBe("Copia la risposta");
        expect(app.el("language-status").hidden).toBe(false);
        app.el("copy").click();
        await vi.waitFor(()=>expect(app.copy).toHaveBeenCalledWith(original));
        expect(app.fetch).toHaveBeenCalledTimes(calls);
    });
    it("provides all four UI strings with matching placeholders and Swiss German spelling", () => {
        const match=localeScript.match(/const rows = (\[[\s\S]*?\]);\n  const catalog/);
        expect(match).not.toBeNull();
        const rows=JSON.parse(match![1]) as string[][];
        expect(rows.length).toBeGreaterThan(100);
        for(const row of rows){
            expect(row).toHaveLength(4);
            expect(row[0]).not.toContain("ß");
            const placeholders=(text:string)=>[...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(value=>value[1]).sort();
            for(const value of row){ expect(value.trim()).not.toBe("");expect(placeholders(value)).toEqual(placeholders(row[0])); }
        }
    });
});
