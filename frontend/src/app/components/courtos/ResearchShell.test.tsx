// @vitest-environment-options {"url":"https://court.example.org/word/research?selection=private&token=private#private"}
import { useEffect } from "react";
import { emptyResearchState, useResearchHandoff } from "./ResearchHandoffContext";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchShell } from "./ResearchShell";
import { CourtOSLocaleProvider } from "@/app/contexts/CourtOSLocaleContext";
import { setCourtOSLocale } from "@/app/lib/courtosLocale";
const handoffId = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({ create: vi.fn(), pathname: "/research", query: "", email: "very.long.but.realistically.named.reader@court.example.org", signOut: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useSearchParams: () => new URLSearchParams(state.query), useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "shell-owner", email: state.email }, signOut: state.signOut }) }));
vi.mock("@/app/lib/courtos", async (original) => ({ ...(await original<typeof import("@/app/lib/courtos")>()), COURTOS_CLOUDFLARE_AUTH: false }));
vi.mock("@/app/lib/researchHandoff", async (original) => ({ ...(await original<typeof import("@/app/lib/researchHandoff")>()), createResearchHandoff: state.create }));
function WorkspaceMarker() {
    const handoff = useResearchHandoff(); const register = handoff?.register, bind = handoff?.bindWordDocument;
    useEffect(() => register?.({ getState: emptyResearchState, applyState: () => {} }), [register]);
    useEffect(() => { bind?.(null); }, [bind]);
    return <p>Word research</p>;
}
beforeEach(() => {
    state.pathname = "/research"; state.query = ""; state.signOut.mockReset().mockResolvedValue(undefined); state.replace.mockReset(); localStorage.clear(); sessionStorage.clear(); state.create.mockReset().mockResolvedValue({ id: handoffId, revision: 1, expires_at: new Date(Date.now() + 7200000).toISOString(), direction: "to_browser", acknowledged_revision: 0 });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("compact research window", () => {
    it.each([
        ["de", "Browser", "Im Browser fortsetzen"],
        ["fr", "Navigateur", "Continuer dans le navigateur"],
        ["it", "Browser", "Continua nel browser"],
        ["en", "Browser", "Continue in browser"],
    ] as const)("keeps the %s Word header label short with the complete accessible action", (locale, visible, accessible) => {
        state.pathname = "/word/research";
        setCourtOSLocale("shell-owner", locale);
        render(<CourtOSLocaleProvider ownerId="shell-owner"><ResearchShell><WorkspaceMarker /></ResearchShell></CourtOSLocaleProvider>);
        const button = screen.getByRole("button", { name: accessible });
        expect(button).toHaveTextContent(new RegExp(`^${visible}$`));
        expect(button).toHaveAttribute("title", accessible);
        expect(button).toHaveClass("courtos-word-browser-link--compact");
        expect(state.create).not.toHaveBeenCalled();
    });
    it("shows research and personal library, complete identity and source offer without workspace navigation", () => {
        render(<ResearchShell><p>Source results</p></ResearchShell>);
        expect(screen.getByRole("link", { name: "Recherche" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Bibliothek" })).toHaveAttribute("href", "/library");
        expect(screen.queryByRole("contentinfo")).toBeNull();
        expect(screen.getByRole("link", {name:"Eingaben prüfen"})).toHaveAttribute("href", "/review");
        const citecheck = screen.getByRole("link", { name: "Zitate prüfen" });
        expect(citecheck).toHaveAttribute("href", "https://jonashertner.github.io/citecheck/taskpane.html?lang=de");
        expect(citecheck).toHaveAttribute("target", "_blank");
        expect(citecheck).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByText(state.email)).not.toBeVisible();
        fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
        expect(screen.getByText(state.email)).toBeVisible();
        fireEvent.click(screen.getByText("Hilfe und Quellcode"));
        expect(screen.getByRole("link", { name: /GitHub · Quellcode/ })).toHaveAttribute("href", "https://github.com/jonashertner/CourtOS");
        expect(screen.getByRole("main")).toHaveTextContent("Source results");
        expect(screen.queryByRole("link", { name: /Projekte|Arbeitsabläufe|Assistent/ })).toBeNull();
        expect(screen.queryByRole("link", { name: "Im Browser fortsetzen" })).toBeNull();
    });
    it("keeps library navigation active inside a folder", () => {
        state.pathname = "/library/folders/one";
        render(<ResearchShell>Folder</ResearchShell>);
        expect(screen.getByRole("link", { name: "Bibliothek" })).toHaveAttribute("aria-current", "page");
    });
    it.each([["/word/research", ""], ["/library/folders/one", "host=word"]])("retains the Word return path and disables unavailable model actions in %s", (pathname, query) => {
        state.pathname = pathname; state.query = query;
        render(<ResearchShell>Word research</ResearchShell>);
        expect(screen.getByRole("link", { name: "Recherche" })).toHaveAttribute("href", "/word/research");
        expect(screen.getByRole("link", { name: "Bibliothek" })).toHaveAttribute("href", "/library?host=word");
        fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
        expect(screen.getByRole("radio", { name: /Gemma/ })).toBeDisabled();
        expect(screen.getByRole("radio", { name: /Claude Opus/ })).toBeDisabled();
        expect(screen.getByText(/KI-Aufträge sind in dieser Word-Testfassung noch nicht verfügbar/)).toBeVisible();
    });
    it("ends the application session before returning to password login", async () => {
        render(<ResearchShell>Results</ResearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
        fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
        await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
        expect(state.signOut).toHaveBeenCalledOnce();
    });
    it("keeps an unsuccessful sign-out visible and recoverable", async () => {
        state.signOut.mockRejectedValue(new Error("private server detail"));
        render(<ResearchShell>Results</ResearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "Einstellungen" }));
        fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Die Abmeldung ist gerade nicht möglich");
        expect(screen.queryByText("private server detail")).toBeNull();
        expect(state.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Abmelden" })).toBeEnabled();
    });
    it("opens only an opaque research-handoff URL through supported Office UI without reading a document", async () => {
        state.pathname = "/word/research";
        const openBrowserWindow = vi.fn(); const readDocument = vi.fn(); const wordRun = vi.fn();
        const isSetSupported = vi.fn().mockReturnValue(true);
        vi.stubGlobal("Office", { context: { requirements: { isSetSupported }, ui: { openBrowserWindow }, document: { getSelectedDataAsync: readDocument } } });
        vi.stubGlobal("Word", { run: wordRun });
        render(<ResearchShell><WorkspaceMarker /></ResearchShell>);
        expect(openBrowserWindow).not.toHaveBeenCalled();
        const action = screen.getByRole("button", { name: "Im Browser fortsetzen" });
        fireEvent.click(action);
        await waitFor(() => expect(openBrowserWindow).toHaveBeenCalledOnce());
        expect(isSetSupported).toHaveBeenCalledWith("OpenBrowserWindowApi", "1.1");
        expect(openBrowserWindow).toHaveBeenCalledExactlyOnceWith(`https://court.example.org/research?handoff=${handoffId}`);
        expect(state.create).toHaveBeenCalledExactlyOnceWith(emptyResearchState());
        expect(readDocument).not.toHaveBeenCalled(); expect(wordRun).not.toHaveBeenCalled();
        expect(state.replace).not.toHaveBeenCalled();
    });
    it.each(["missing", "unsupported", "throws"])("keeps an explicit opaque HTTPS new-tab fallback when Office is %s", async (mode) => {
        state.pathname = "/library"; state.query = "host=word&selection=private";
        const openBrowserWindow = vi.fn().mockImplementation(() => { if (mode === "throws") throw new Error("host unavailable"); });
        vi.stubGlobal("Office", mode === "missing" ? undefined : { context: { requirements: { isSetSupported: () => mode !== "unsupported" }, ui: { openBrowserWindow } } });
        render(<ResearchShell><WorkspaceMarker /></ResearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "Im Browser fortsetzen" }));
        const link = await screen.findByRole("link", { name: "Recherche im Browser öffnen" });
        expect(link).toHaveAttribute("href", `https://court.example.org/research?handoff=${handoffId}`);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener noreferrer");
        if (mode !== "throws") expect(openBrowserWindow).not.toHaveBeenCalled();
    });
});
